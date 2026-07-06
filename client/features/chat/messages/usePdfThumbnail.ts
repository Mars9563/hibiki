'use client';

import { useEffect, useState } from 'react';
import { renderPdfThumbnail } from '@/lib/pdf';

type ThumbnailState =
  | { status: 'loading'; src: null }
  | { status: 'ready'; src: string }
  | { status: 'error'; src: null };

// Renders page 1 of `url` to a PNG data URL. Works for both signed
// remote URLs and local blob URLs (staged, not-yet-uploaded files).
// Status is derived in render from url-keyed results, so the effect
// only ever calls setState from its async callbacks — never
// synchronously. Falls back to `status: 'error'` on any failure so
// callers can show a generic file card instead.
export function usePdfThumbnail(url: string | null): ThumbnailState {
  const [result, setResult] = useState<{ url: string; src: string } | null>(
    null
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    const controller = new AbortController();

    renderPdfThumbnail(url, { signal: controller.signal })
      .then((src) => {
        if (!cancelled) setResult({ url, src });
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(url);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  if (!url) return { status: 'error', src: null };
  if (result?.url === url) return { status: 'ready', src: result.src };
  if (failedUrl === url) return { status: 'error', src: null };
  return { status: 'loading', src: null };
}
