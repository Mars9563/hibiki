// ============================================================
// lib/pdf.ts
// Client-only PDF first-page → PNG thumbnail rendering via pdf.js.
//
// pdf.js is dynamically imported so it never lands in the server
// bundle (it touches DOM/Canvas) and only loads once a PDF thumbnail
// is actually requested.
//
// The worker is served from /public/pdf.worker.min.mjs — a copy of
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs. It MUST stay
// version-matched with the installed pdfjs-dist; re-copy that file
// whenever the dependency is bumped, or rendering silently fails.
// ============================================================

let workerConfigured = false;

export async function renderPdfThumbnail(
  url: string,
  { maxWidth = 480, signal }: { maxWidth?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const pdfjs = await import('pdfjs-dist');

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    workerConfigured = true;
  }

  const loadingTask = pdfjs.getDocument({ url });

  // destroy() on the loading task tears down the document + worker
  // transport. Guarded so the abort path and the finally can't
  // double-destroy.
  const teardown = () => {
    if (!loadingTask.destroyed) void loadingTask.destroy();
  };
  signal?.addEventListener('abort', teardown);

  const doc = await loadingTask.promise;

  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1, maxWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    // v6 prefers the `canvas` param; it acquires the 2D context itself.
    await page.render({ canvas, viewport }).promise;

    return canvas.toDataURL('image/png');
  } finally {
    signal?.removeEventListener('abort', teardown);
    teardown();
  }
}
