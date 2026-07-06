import type { Attachment, AttachmentType } from '@/lib/types';
import type { AttachmentGroupProps } from './types';
import { ImageContent } from './ImageContent';
import { VideoContent } from './VideoContent';
import { AudioContent } from './AudioContent';
import { PdfContent } from './PdfContent';
import { GenericFileCard } from './GenericFileCard';

const GROUP_RENDERERS: Record<
  AttachmentType,
  React.ComponentType<AttachmentGroupProps>
> = {
  image: ImageContent,
  video: VideoContent,
  audio: AudioContent,
  pdf: PdfContent,
  other: GenericFileCard,
};

const ORDER: AttachmentType[] = ['image', 'video', 'audio', 'pdf', 'other'];

export function OtherContent({ attachments, isPending }: AttachmentGroupProps) {
  const groups = new Map<AttachmentType, Attachment[]>();
  for (const a of attachments) {
    const group = groups.get(a.attachmentType) ?? [];
    group.push(a);
    groups.set(a.attachmentType, group);
  }

  return (
    <div className="flex flex-col gap-2">
      {ORDER.filter((type) => groups.has(type)).map((type) => {
        const Renderer = GROUP_RENDERERS[type];
        return (
          <Renderer
            key={type}
            attachments={groups.get(type)!}
            isPending={isPending}
          />
        );
      })}
    </div>
  );
}
