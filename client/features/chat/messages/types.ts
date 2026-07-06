import type { Attachment } from '@/lib/types';

export type AttachmentGroupProps = {
  attachments: Attachment[];
  isPending: boolean;
};
