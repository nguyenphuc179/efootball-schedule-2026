/** Longest edge (px) and quality for a downscaled image. Keeps the data URI well under Firestore's
 *  1 MiB document limit (webp is typically 20–90 KB) while staying sharp enough for a logo/poster. */
const MAX_EDGE = 800;
const QUALITY = 0.85;
/** Refuse anything still huge after downscaling (e.g. a big PNG on a browser without webp encode). */
const MAX_DATA_URI_BYTES = 800_000;

/** Downscales an image file/blob (pasted bitmap or a picked file) to a compact webp data URI. */
export async function downscaleToDataUri(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // webp keeps transparency (logos) and is compact; browsers without webp encode fall back to png.
  const dataUri = canvas.toDataURL('image/webp', QUALITY);
  if (dataUri.length > MAX_DATA_URI_BYTES) throw new Error('image too large');
  return dataUri;
}
