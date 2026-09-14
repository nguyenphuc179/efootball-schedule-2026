/** Loads `src` (data URI or remote URL) into an `<img>`. `crossOrigin` lets a same-origin-CORS
 *  remote image (e.g. a Google profile photo) be read back out of a canvas without tainting it. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/**
 * Downloads whatever image is currently on screen (data URI or remote URL — a webp lineup capture,
 * a member's Google profile photo, …) as a `.png` file, converting via canvas so the saved file is
 * always PNG regardless of the source format. Falls back to just opening the original URL in a new
 * tab (letting the user save it manually) if canvas conversion fails — most likely a remote image
 * without permissive CORS headers, which taints the canvas and blocks `toDataURL`.
 */
export async function downloadImageAsPng(src: string, filename: string): Promise<void> {
  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    a.click();
  } catch {
    window.open(src, '_blank');
  }
}
