// ============================================================
// routes/userMessages.ts
// PATCHED for cursor-based pagination, per-room (not per-room-list).
//
// Old contract: GET /api/messages?roomIds=["a","b"]  -> ALL messages
//               for ALL rooms in one unbounded query.
// New contract: GET /api/messages?roomId=a&limit=50&before=<ISO ts>
//               -> up to `limit` messages older than `before`,
//               newest-first (DESC). Omit `before` for page 1.
//
// This is a breaking change to the route's query shape — the
// frontend slice (createMessagesSlice.ts) already calls it this
// way. There is no remaining caller of the old `roomIds=[...]`
// shape once useRooms.ts's effect is deleted (see migration
// checklist), so this is safe to replace outright rather than
// version it.
// ============================================================
import express from 'express';
import authMiddleware from '../middleware/auth.js';
import { createUserClient } from '../config/supabase.js';
import multer from 'multer';
import { getIo } from '../socket/index.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { getAttachmentUrls } from '../config/r2.js';
import {
  AttachmentServiceError,
  createMessageWithAttachments,
  isAllowedMimeType,
} from '../services/attachment.service.js';

const router = express.Router();
router.use(authMiddleware);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

router.get('/messages', async (req, res) => {
  try {
    const supabase = createUserClient(req.userJWT ?? '');

    const roomId = req.query.roomId;
    if (!roomId || typeof roomId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing roomId' });
    }

    // Confirm the caller is actually a participant of this room before
    // returning anything — the old route trusted the client-supplied
    // roomIds array with no membership check at all.
    const { data: membership, error: membershipError } = await supabase
      .from('chat_room_participants')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('user_id', req.userId)
      .maybeSingle();

    if (membershipError) {
      console.error(membershipError);
      return res.status(500).json({ success: false, error: 'Server error' });
    }

    if (!membership) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;

    const before = req.query.before;

    let query = supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before && typeof before === 'string') {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const messageIds = (data ?? []).map((m) => m.id);
    const { data: attachmentRows, error: attachmentsError } =
      messageIds.length > 0
        ? await supabase
            .from('message_attachments')
            .select(
              'id, message_id, file_name, mime_type, file_size, attachment_type, object_key'
            )
            .in('message_id', messageIds)
        : { data: [], error: null };

    if (attachmentsError) {
      console.error(attachmentsError);
      return res.status(500).json({ success: false, error: 'Server error' });
    }

    const enrichedAttachments = await Promise.all(
      (attachmentRows ?? []).map(async (a) => {
        const { url, thumbnailUrl } = await getAttachmentUrls(
          a.object_key,
          a.attachment_type,
          a.file_name
        );
        return {
          messageId: a.message_id,
          attachment: {
            id: a.id,
            fileName: a.file_name,
            mimeType: a.mime_type,
            fileSize: a.file_size,
            attachmentType: a.attachment_type,
            url,
            thumbnailUrl,
          },
        };
      })
    );

    const attachmentsByMessage = new Map<string, any[]>();
    for (const { messageId, attachment } of enrichedAttachments) {
      const list = attachmentsByMessage.get(messageId) ?? [];
      list.push(attachment);
      attachmentsByMessage.set(messageId, list);
    }

    // Returned newest-first (DESC) — the frontend slice reverses this
    // into chronological order for rendering and reads the LAST item
    // here (the oldest of this page) to compute the next `before` cursor.
    res.json({
      success: true,
      messages: (data ?? []).map((m) => ({
        ...m,
        attachments: attachmentsByMessage.get(m.id) ?? [],
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const uploadFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    // Cheap first pass on the declared mimetype before buffering
    // into memory. The real check — verifying actual bytes — happens
    // in attachment.service.ts once the buffer exists; fileFilter
    // only ever sees headers.
    if (!isAllowedMimeType(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  },
});

// ---------- POST /api/rooms/:roomId/messages ----------
// Creates a message with one or more attachments. Requires at least
// one file — text-only messages still go through the existing
// message:send socket event. content is an optional caption.
router.post(
  '/rooms/:roomId/messages',
  uploadLimiter,
  uploadFiles.array('files', 10),
  async (req, res) => {
    try {
      const senderId = req.userId as string;
      const senderJWT = req.userJWT as string;
      const { roomId } = req.params as {
        roomId: string;
      };
      const { content, clientTempId } = req.body as {
        content?: string;
        clientTempId?: string;
      };
      const files = (req.files ?? []) as Express.Multer.File[];

      const message = await createMessageWithAttachments({
        senderId,
        senderJWT,
        roomId,
        content,
        files,
      });

      getIo().to(roomId).emit('message:new', { message, clientTempId });

      return res.status(201).json({ success: true, message });
    } catch (error) {
      if (error instanceof AttachmentServiceError) {
        return res
          .status(error.status)
          .json({ success: false, message: error.message });
      }
      console.error('Create message with attachments error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Internal server error' });
    }
  }
);

export default router;
