// ============================================================
// lib/attachments.ts
// Shared by ChatInput (staging/validation) and MessageBubble
// (rendering). Classification here is for optimistic UI only — the
// server re-classifies from actual file bytes, and that result is
// what lands once mergeRealMessage swaps the optimistic entry out.
// ============================================================
import type { AttachmentType, MessageType } from './types';

const MIME_TYPE_MAP: Record<string, AttachmentType> = {
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
};

const OTHER_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'text/plain',
  'text/csv',
];

export const ACCEPTED_FILE_TYPES = [
  ...Object.keys(MIME_TYPE_MAP),
  ...OTHER_MIME_TYPES,
];

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 10;

// The Next proxy caps the whole request body at 25 MiB
// (next.config proxyClientMaxBodySize) to stay within the R2 free
// plan. The caption and multipart boundaries ride in that same body,
// so staged files are held a little under the hard cap.
export const MAX_TOTAL_PAYLOAD_SIZE = 25 * 1024 * 1024 - 256 * 1024; // ~24.75MB

export function classifyMimeType(mimeType: string): AttachmentType {
  return MIME_TYPE_MAP[mimeType] ?? 'other';
}

export function deriveMessageType(
  attachments: { attachmentType: AttachmentType }[]
): MessageType {
  if (attachments.length === 0) return 'text';
  const unique = new Set(attachments.map((a) => a.attachmentType));
  return unique.size === 1 ? attachments[0].attachmentType : 'other';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
