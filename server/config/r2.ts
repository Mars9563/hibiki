// ============================================================
// config/r2.ts
// Single place that knows how to talk to R2 — mirrors
// config/cloudinary.ts. Nothing else should import
// @aws-sdk/client-s3 directly.
//
// R2 is fully S3-compatible; this is a stock AWS SDK v3 S3Client
// pointed at Cloudflare's endpoint, not a special R2 SDK.
// ============================================================
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(0, 100);
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
}

// attachments/{roomId}/{attachmentId}-{sanitizedFileName}
// attachmentId is generated in attachment.service.ts BEFORE upload —
// it becomes both this key's suffix and message_attachments.id, so
// the two never drift apart.
export function attachmentObjectKey(
  roomId: string,
  attachmentId: string,
  fileName: string
): string {
  return `attachments/${roomId}/${attachmentId}-${sanitizeFileName(fileName)}`;
}

// A thumbnail's key is fully derived from its original's object_key,
// so no extra DB column is needed — read paths can compute it on the
// fly. Only image attachments get one (generated in attachment.service).
export function thumbnailObjectKey(objectKey: string): string {
  return `${objectKey}.thumb.webp`;
}

export async function uploadAttachment(
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<void> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
}

export async function deleteAttachment(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Fresh signed URL on every read, 1hr expiry — same "never
// cached/stored" rule as getSignedAvatarUrl(). Unlike the Cloudinary
// version this is ASYNC (the AWS SDK's presigner always returns a
// Promise, even though no network call happens) — every call site
// needs an await.
export async function getSignedAttachmentUrl(
  key: string,
  opts?: { disposition?: 'inline' | 'attachment'; fileName?: string }
): Promise<string> {
  const responseContentDisposition = opts?.disposition
    ? `${opts.disposition}${
        opts.fileName ? `; filename="${sanitizeFileName(opts.fileName)}"` : ''
      }`
    : undefined;

  return getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
    }),
    { expiresIn: 3600 }
  );
}

// Both read paths (message create + message list) need the same pair
// of signed URLs — the file itself, and, for images, its thumbnail.
// Centralized here so the disposition rules and thumbnail key stay in
// one place. thumbnailUrl is always returned for images (the key is
// derived, not checked); for older images without a generated
// thumbnail the client's <img onError> falls back to the full url.
export async function getAttachmentUrls(
  objectKey: string,
  attachmentType: string,
  fileName: string
): Promise<{ url: string; thumbnailUrl: string | null }> {
  const url = await getSignedAttachmentUrl(objectKey, {
    disposition: attachmentType === 'other' ? 'attachment' : 'inline',
    fileName,
  });

  const thumbnailUrl =
    attachmentType === 'image'
      ? await getSignedAttachmentUrl(thumbnailObjectKey(objectKey), {
          disposition: 'inline',
          fileName,
        })
      : null;

  return { url, thumbnailUrl };
}
