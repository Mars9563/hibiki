'use client';

import { FaFilePdf } from 'react-icons/fa6';
import { formatFileSize } from '@/lib/attachments';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/types';
import type { AttachmentGroupProps } from './types';
import { usePdfThumbnail } from './usePdfThumbnail';
import { GenericFileCard } from './GenericFileCard';

function PdfCard({
  file,
  isPending,
}: {
  file: Attachment;
  isPending: boolean;
}) {
  const thumb = usePdfThumbnail(file.url);

  // If page 1 can't be rendered (corrupt / CORS / non-pdf bytes),
  // degrade to the same row treatment every other file gets.
  if (thumb.status === 'error') {
    return <GenericFileCard attachments={[file]} isPending={isPending} />;
  }

  return (
    <a
      href={isPending ? undefined : file.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group/pdf block w-56 max-w-full overflow-hidden rounded-2xl bg-black/10 transition-colors hover:bg-black/15',
        isPending && 'pointer-events-none opacity-60'
      )}
    >
      <div className="relative flex aspect-3/4 max-h-72 items-center justify-center overflow-hidden bg-white">
        {thumb.status === 'ready' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb.src}
            alt={file.fileName}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="size-full animate-pulse bg-black/5" />
        )}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <FaFilePdf className="size-3" />
          PDF
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5">
        <FaFilePdf className="size-4.5 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.fileName}</p>
          <p className="text-xs opacity-70">{formatFileSize(file.fileSize)}</p>
        </div>
      </div>
    </a>
  );
}

export function PdfContent({ attachments, isPending }: AttachmentGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((file) => (
        <PdfCard key={file.id} file={file} isPending={isPending} />
      ))}
    </div>
  );
}
