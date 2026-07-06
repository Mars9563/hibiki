import { formatFileSize } from '@/lib/attachments';
import { cn } from '@/lib/utils';
import { getFileIcon } from './fileIcons';
import type { AttachmentGroupProps } from './types';

export function GenericFileCard({
  attachments,
  isPending,
}: AttachmentGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((file) => {
        const Icon = getFileIcon(file.mimeType);
        return (
          <a
            key={file.id}
            href={isPending ? undefined : file.url}
            target="_blank"
            rel="noopener noreferrer"
            download={file.fileName}
            className={cn(
              'flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors',
              'bg-black/10 hover:bg-black/15',
              isPending && 'pointer-events-none opacity-60'
            )}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-current/10">
              <Icon className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.fileName}</p>
              <p className="text-xs opacity-70">
                {formatFileSize(file.fileSize)}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
