import type { MessageType } from '@/lib/types';
import type { AttachmentGroupProps } from './types';
import { ImageContent } from './ImageContent';
import { VideoContent } from './VideoContent';
import { AudioContent } from './AudioContent';
import { PdfContent } from './PdfContent';
import { OtherContent } from './OtherContent';

export const ATTACHMENT_RENDERERS: Record<
  MessageType,
  React.ComponentType<AttachmentGroupProps> | null
> = {
  text: null,
  image: ImageContent,
  video: VideoContent,
  audio: AudioContent,
  pdf: PdfContent,
  other: OtherContent,
};

export type { AttachmentGroupProps } from './types';
