// ============================================================
// lib/cropImage.ts
// Pure canvas helper: takes a source image + the crop rectangle
// react-easy-crop reports (in source-image pixels) and returns a
// JPEG Blob of just that square region. No dependency beyond the
// browser canvas API.
// ============================================================
export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// outputSize keeps every avatar a consistent, reasonably small
// upload regardless of the source photo's resolution.
export async function getCroppedImageBlob(
  imageSrc: string,
  cropArea: CropArea,
  outputSize = 512
): Promise<Blob> {
  const image = await loadImage(imageSrc);

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to crop image'));
      },
      'image/jpeg',
      0.92
    );
  });
}
