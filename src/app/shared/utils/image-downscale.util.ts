/** Longest edge (px) and quality for a downscaled image. Keeps the data URI well under Firestore's
 *  1 MiB document limit (webp is typically 20–90 KB) while staying sharp enough for a logo/poster. */
const MAX_EDGE = 800;
const QUALITY = 0.85;
/** Refuse anything still huge after downscaling (e.g. a big PNG on a browser without webp encode). */
const MAX_DATA_URI_BYTES = 800_000;

/** Encodes a canvas to a compact data URI. Safari has no webp encoder and `toDataURL('image/webp', …)`
 *  silently falls back to PNG there — fine for a clean screenshot, but a photographed TV screen (camera
 *  capture) is busy/noisy content that balloons under lossless PNG, so force JPEG in that case instead
 *  (no alpha needed for a lineup photo). */
function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Decodes a blob via an `<img>` element (the classic, most broadly-compatible pattern). */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image failed to decode'));
    };
    img.src = url;
  });
}

/** Downscales an image file/blob (pasted bitmap or a picked file) to a compact webp data URI. */
export async function downscaleToDataUri(file: Blob): Promise<string> {
  let img: HTMLImageElement;
  try {
    img = await loadImageFromBlob(file);
  } catch {
    // No mainstream browser's <img>/createImageBitmap decodes HEIC/HEIF — the format an iPhone
    // camera saves photos in by default — so a decode failure is most likely that; convert to
    // JPEG first (lazy-loaded: this ~1 MB decoder only downloads when actually needed).
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    img = await loadImageFromBlob(Array.isArray(converted) ? converted[0] : converted);
  }

  // A photo straight from a camera (vs. a clean screenshot) can still be too big after one pass —
  // shrink further and retry a few times before giving up.
  let edge = MAX_EDGE;
  let quality = QUALITY;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

    const dataUri = encode(canvas, quality);
    if (dataUri.length <= MAX_DATA_URI_BYTES) return dataUri;

    quality = Math.max(0.4, quality - 0.15);
    edge = Math.round(edge * 0.8);
  }
  throw new Error('image too large');
}
