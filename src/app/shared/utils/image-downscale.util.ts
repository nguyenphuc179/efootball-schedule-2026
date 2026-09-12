/** Longest edge (px) and quality for a downscaled image. Keeps the data URI well under Firestore's
 *  1 MiB document limit (webp is typically 20–90 KB) while staying sharp enough for a logo/poster. */
const MAX_EDGE = 800;
const QUALITY = 0.85;
/** Refuse anything still huge after downscaling (e.g. a big PNG on a browser without webp encode). */
const MAX_DATA_URI_BYTES = 800_000;

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

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

  // webp keeps transparency (logos) and is compact; browsers without webp encode fall back to png.
  const dataUri = canvas.toDataURL('image/webp', QUALITY);
  if (dataUri.length > MAX_DATA_URI_BYTES) throw new Error('image too large');
  return dataUri;
}
