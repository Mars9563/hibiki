'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { FaMusic, FaVideo } from 'react-icons/fa6';
import { classifyMimeType, formatFileSize } from '@/lib/attachments';
import type { AttachmentType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStagedFiles, useRemoveStagedFile } from '@/store/selectors';
import { getFileIcon } from '../messages/fileIcons';
import { usePdfThumbnail } from '../messages/usePdfThumbnail';
import { useAttachmentPicker } from './useAttachmentPicker';

// One object URL per staged File, kept in sync with the staged array
// and revoked on change/unmount so blob memory never leaks.
//
// Creating object URLs is a side effect paired with revocation, so it
// lives in an effect rather than useMemo: under React Strict Mode the
// dev-only mount→cleanup→remount cycle would otherwise revoke the
// memoized URLs without recreating them — which is exactly why the
// first preview showed broken images until the file list changed.
// Recreating inside the effect keeps them valid across that remount.
function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map((f) => URL.createObjectURL(f));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing an external resource (blob URLs) that must be revoked
    setUrls(created);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return urls;
}

const STRIP_ICON: Partial<
  Record<AttachmentType, React.ComponentType<{ className?: string }>>
> = {
  video: FaVideo,
  audio: FaMusic,
};

// Render helpers, deliberately NOT components: selecting a stable icon
// from a static map inside a component body trips react-hooks'
// static-components rule. Kept as plain element-returning functions.
function genericIconEl(mimeType: string, className: string) {
  const Icon = getFileIcon(mimeType);
  return <Icon className={className} />;
}

function stripIconEl(file: File, className: string) {
  const type = classifyMimeType(file.type);
  const Icon = STRIP_ICON[type] ?? getFileIcon(file.type);
  return <Icon className={className} />;
}

// ---------- large preview of the focused file ----------

function GenericBigPreview({
  mimeType,
  name,
}: {
  mimeType: string;
  name: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-muted-foreground">
      {genericIconEl(mimeType, 'size-24')}
      <p className="max-w-xs truncate text-sm font-medium text-foreground">
        {name}
      </p>
    </div>
  );
}

function PdfBigPreview({ url, name }: { url: string; name: string }) {
  const thumb = usePdfThumbnail(url);

  if (thumb.status === 'ready') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumb.src}
        alt={name}
        className="max-h-full max-w-full rounded-2xl bg-white object-contain shadow-lg"
      />
    );
  }

  if (thumb.status === 'loading') {
    return <Loader2 className="size-8 animate-spin text-muted-foreground" />;
  }

  return <GenericBigPreview mimeType="application/pdf" name={name} />;
}

function BigPreview({ file, url }: { file: File; url: string }) {
  const type = classifyMimeType(file.type);

  if (type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={file.name}
        className="max-h-full max-w-full rounded-2xl object-contain shadow-lg"
      />
    );
  }

  if (type === 'video') {
    return (
      <video
        src={url}
        controls
        playsInline
        className="max-h-full max-w-full rounded-2xl shadow-lg"
      />
    );
  }

  if (type === 'audio') {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl bg-card p-8 shadow-lg">
        <FaMusic className="size-16 text-primary" />
        <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
        <audio src={url} controls className="w-full" />
      </div>
    );
  }

  if (type === 'pdf') return <PdfBigPreview url={url} name={file.name} />;

  return <GenericBigPreview mimeType={file.type} name={file.name} />;
}

// ---------- thumbnail strip ----------

function StripThumb({
  file,
  url,
  active,
  onSelect,
  onRemove,
}: {
  file: File;
  url: string | undefined;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const isImage = classifyMimeType(file.type) === 'image';

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'block size-14 overflow-hidden rounded-lg border-2 transition',
          active
            ? 'border-primary'
            : 'border-transparent opacity-60 hover:opacity-100'
        )}
      >
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={file.name} className="size-full object-cover" />
        ) : isImage ? (
          <div className="size-full bg-secondary" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-secondary px-1 text-muted-foreground">
            {stripIconEl(file, 'size-5')}
            <span className="w-full truncate text-center text-[8px] leading-none">
              {file.name}
            </span>
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// ---------- takeover ----------

export function AttachmentPreview() {
  const files = useStagedFiles();
  const removeStagedFile = useRemoveStagedFile();
  const { open: openFilePicker, input: fileInput } = useAttachmentPicker();
  const urls = useObjectUrls(files);

  const [selected, setSelected] = useState(0);
  // Clamp in render (files can shrink under us) rather than in an
  // effect — keeps the focused index valid without a cascading render.
  const focused = Math.min(selected, Math.max(0, files.length - 1));

  const active = files[focused];
  if (!active) return null;

  // Object URLs land one tick after mount (see useObjectUrls); show a
  // spinner for that frame instead of collapsing the whole takeover.
  const activeUrl = urls[focused];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-background">
      {fileInput}

      {/* focused file */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        {activeUrl ? (
          <BigPreview key={activeUrl} file={active} url={activeUrl} />
        ) : (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* meta + thumbnail carousel */}
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
        <p className="text-center text-xs text-muted-foreground">
          {active.name} · {formatFileSize(active.size)}
        </p>

        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {files.map((file, i) => (
            <StripThumb
              key={`${file.name}-${file.size}-${i}`}
              file={file}
              url={urls[i]}
              active={i === focused}
              onSelect={() => setSelected(i)}
              onRemove={() => removeStagedFile(i)}
            />
          ))}

          <button
            type="button"
            onClick={openFilePicker}
            aria-label="Add more files"
            className="flex size-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
