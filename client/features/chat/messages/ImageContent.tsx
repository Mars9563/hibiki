'use client';

import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Download from 'yet-another-react-lightbox/plugins/download';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/types';
import type { AttachmentGroupProps } from './types';

// Loads the server-generated thumbnail when present, falling back to
// the full image once if that thumbnail is missing/expired (e.g.
// images uploaded before thumbnails existed, or optimistic sends where
// `url` is a local blob and there's no thumbnail at all).
function BubbleImage({ attachment }: { attachment: Attachment }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const src =
    attachment.thumbnailUrl && !thumbFailed
      ? attachment.thumbnailUrl
      : attachment.url;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={attachment.fileName}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (attachment.thumbnailUrl && !thumbFailed) setThumbFailed(true);
      }}
      className="max-h-80 w-full object-cover"
    />
  );
}

export function ImageContent({ attachments, isPending }: AttachmentGroupProps) {
  // -1 = closed; otherwise the slide index the viewer opened at.
  const [index, setIndex] = useState(-1);

  const slides = attachments.map((img) => ({
    src: img.url,
    alt: img.fileName,
    download: { url: img.url, filename: img.fileName },
  }));

  // Thumbnails strip only earns its space with more than one image.
  const plugins =
    attachments.length > 1
      ? [Zoom, Counter, Download, Thumbnails]
      : [Zoom, Counter, Download];

  return (
    <>
      <div
        className={cn(
          'grid gap-1 overflow-hidden rounded-2xl',
          attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
        )}
      >
        {attachments.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => !isPending && setIndex(i)}
            className={cn(
              'block cursor-zoom-in bg-black/10 transition-opacity',
              isPending && 'pointer-events-none cursor-default opacity-60'
            )}
          >
            <BubbleImage attachment={img} />
          </button>
        ))}
      </div>

      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={plugins}
        counter={{ container: { style: { top: 'unset', bottom: 0 } } }}
        zoom={{ maxZoomPixelRatio: 3 }}
      />
    </>
  );
}
