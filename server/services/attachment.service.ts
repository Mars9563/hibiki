// ============================================================
// services/attachment.service.ts
// Upload validation + atomic message-with-attachments creation.
// Mirrors room.service.ts/profile.service.ts: business logic here,
// routes/userMessages.ts stays a thin HTTP <-> service layer.
//
// Trust boundary: message_attachments has no INSERT policy, so
// every write goes through supabaseSuperUser calling the
// create_message_with_attachments RPC (SECURITY DEFINER — bypasses
// RLS entirely). Because of that, room membership is checked here
// explicitly, on the user-scoped client, BEFORE any R2 traffic —
// and again inside the RPC itself as defense in depth.
// ============================================================
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { createUserClient, supabaseSuperUser } from '../config/supabase.js';
import {
  attachmentObjectKey,
  thumbnailObjectKey,
  uploadAttachment,
  deleteAttachment,
  getAttachmentUrls,
} from '../config/r2.js';

export class AttachmentServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AttachmentType = 'image' | 'video' | 'audio' | 'pdf' | 'other';
export type MessageType = AttachmentType | 'text';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB, the agreed v1 cap
export const MAX_FILES_PER_MESSAGE = 10;
// Files are buffered fully in memory (multer memoryStorage, same
// pattern as avatars) — 10 files x 25MB could mean 250MB held in RAM
// for one request. This bounds the realistic worst case without
// touching the per-file limit.
const MAX_TOTAL_UPLOAD_SIZE = 75 * 1024 * 1024;

export const MIME_ALLOWLIST: Record<string, AttachmentType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/mp4': 'audio',
  'audio/webm': 'audio',
  'application/pdf': 'pdf',
  'application/msword': 'other',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'other',
  'application/vnd.ms-excel': 'other',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'other',
  'application/zip': 'other',
  'text/plain': 'other',
  'text/csv': 'other',
};

// file-type sniffs magic bytes — it can't detect plain-text formats
// (no magic bytes exist for arbitrary text), so these two are
// trusted from the declared mimetype instead of buffer-verified.
const UNSNIFFABLE_MIME_TYPES = new Set(['text/plain', 'text/csv']);

export function isAllowedMimeType(mime: string): boolean {
  return mime in MIME_ALLOWLIST;
}

type IncomingFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

async function classifyFile(file: IncomingFile): Promise<AttachmentType> {
  if (file.size > MAX_FILE_SIZE) {
    throw new AttachmentServiceError(
      413,
      `${file.originalname} exceeds the 25MB limit`
    );
  }

  const declaredType = MIME_ALLOWLIST[file.mimetype];
  if (!declaredType) {
    throw new AttachmentServiceError(
      415,
      `${file.originalname}: unsupported file type`
    );
  }

  if (!UNSNIFFABLE_MIME_TYPES.has(file.mimetype)) {
    const sniffed = await fileTypeFromBuffer(file.buffer);
    if (!sniffed || MIME_ALLOWLIST[sniffed.mime] !== declaredType) {
      throw new AttachmentServiceError(
        415,
        `${file.originalname}: file content doesn't match its declared type`
      );
    }
  }

  return declaredType;
}

function deriveMessageType(attachmentTypes: AttachmentType[]): MessageType {
  const unique = new Set(attachmentTypes);
  return unique.size === 1 ? attachmentTypes[0] : 'other';
}

// Downscaled WebP preview for the message bubble, so clients don't
// pull the full-resolution original just to show a small image. 400px
// comfortably covers the bubble's max render size; the full image is
// only fetched when opened in the lightbox.
const THUMBNAIL_MAX_DIMENSION = 400;

async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // honor EXIF orientation before stripping metadata
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();
}

type CreateMessageWithAttachmentsParams = {
  senderId: string;
  senderJWT: string;
  roomId: string;
  content?: string;
  files: IncomingFile[];
};

export async function createMessageWithAttachments({
  senderId,
  senderJWT,
  roomId,
  content,
  files,
}: CreateMessageWithAttachmentsParams) {
  if (files.length === 0) {
    throw new AttachmentServiceError(400, 'At least one file is required');
  }
  if (files.length > MAX_FILES_PER_MESSAGE) {
    throw new AttachmentServiceError(
      400,
      `Max ${MAX_FILES_PER_MESSAGE} files per message`
    );
  }
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
    throw new AttachmentServiceError(413, 'Total upload size too large');
  }

  const userClient = createUserClient(senderJWT);
  const { data: membership, error: membershipError } = await userClient
    .from('chat_room_participants')
    .select('room_id')
    .eq('room_id', roomId)
    .eq('user_id', senderId)
    .maybeSingle();

  if (membershipError) {
    console.error('Attachment membership check error:', membershipError);
    throw new AttachmentServiceError(500, 'Server error');
  }
  if (!membership) {
    throw new AttachmentServiceError(403, 'You are not a member of this room');
  }

  const attachmentTypes = await Promise.all(files.map(classifyFile));
  const messageType = deriveMessageType(attachmentTypes);

  const trimmedContent = content?.trim() || null;
  if (trimmedContent && trimmedContent.length > 65536) {
    throw new AttachmentServiceError(400, 'Message too long');
  }

  const prepared = files.map((file, i) => {
    const id = randomUUID();
    const attachmentType = attachmentTypes[i];
    const objectKey = attachmentObjectKey(roomId, id, file.originalname);
    return {
      id,
      file,
      attachmentType,
      objectKey,
      // Only images get a thumbnail; the key is derived so read paths
      // can rebuild it without a DB column.
      thumbnailKey:
        attachmentType === 'image' ? thumbnailObjectKey(objectKey) : null,
    };
  });

  const uploaded: typeof prepared = [];
  try {
    await Promise.all(
      prepared.map(async (item) => {
        await uploadAttachment(
          item.file.buffer,
          item.objectKey,
          item.file.mimetype
        );

        // Thumbnails are a best-effort nicety: a failure here (odd
        // codec, corrupt pixels) must not sink the whole message — the
        // bubble just falls back to the full image via onError.
        if (item.thumbnailKey) {
          try {
            const thumb = await generateThumbnail(item.file.buffer);
            await uploadAttachment(thumb, item.thumbnailKey, 'image/webp');
          } catch (thumbErr) {
            console.error(`Thumbnail failed for ${item.objectKey}:`, thumbErr);
          }
        }

        uploaded.push(item);
      })
    );
  } catch (err) {
    console.error('R2 upload error:', err);
    await Promise.allSettled(
      uploaded.flatMap((item) => [
        deleteAttachment(item.objectKey),
        ...(item.thumbnailKey ? [deleteAttachment(item.thumbnailKey)] : []),
      ])
    );
    throw new AttachmentServiceError(502, 'Failed to upload one or more files');
  }

  const { data: result, error: rpcError } = await supabaseSuperUser.rpc(
    'create_message_with_attachments',
    {
      p_sender_id: senderId,
      p_room_id: roomId,
      p_content: trimmedContent,
      p_message_type: messageType,
      p_attachments: prepared.map((item) => ({
        id: item.id,
        object_key: item.objectKey,
        file_name: item.file.originalname,
        mime_type: item.file.mimetype,
        file_size: item.file.size,
        attachment_type: item.attachmentType,
      })),
    }
  );

  if (rpcError || !result) {
    console.error('create_message_with_attachments RPC error:', rpcError);
    await Promise.allSettled(
      prepared.flatMap((item) => [
        deleteAttachment(item.objectKey),
        ...(item.thumbnailKey ? [deleteAttachment(item.thumbnailKey)] : []),
      ])
    );
    throw new AttachmentServiceError(500, 'Failed to save message');
  }

  const attachmentsWithUrls = await Promise.all(
    (result.attachments as any[]).map(async (a) => {
      const { url, thumbnailUrl } = await getAttachmentUrls(
        a.object_key,
        a.attachment_type,
        a.file_name
      );
      return {
        id: a.id,
        fileName: a.file_name,
        mimeType: a.mime_type,
        fileSize: a.file_size,
        attachmentType: a.attachment_type,
        url,
        thumbnailUrl,
      };
    })
  );

  return {
    ...result.message,
    attachments: attachmentsWithUrls,
  };
}
