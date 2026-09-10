/**
 * Helpers for the "paste an image link" fields used across the app (team logo, tournament banner,
 * manager portrait, Hall of Fame poster). The project runs on the Firebase Spark plan — no Storage
 * — so an image is either a web URL or an inline `data:image/...` URI (a pasted screenshot that the
 * ImageUrlInputDirective has downscaled).
 */

/** A web URL or an inline data-image. Used as a form `Validators.pattern`. */
export const IMAGE_SRC_PATTERN = /^(https?:\/\/|data:image\/).+/i;

export function isImageSrc(value: string | null | undefined): boolean {
  return IMAGE_SRC_PATTERN.test((value ?? '').trim());
}

/**
 * A real image supplied by a person — a web URL or a pasted bitmap (`data:image/jpeg|png|webp…`).
 * Deliberately excludes our generated `data:image/svg+xml` initials avatars, which are placeholders
 * rather than something to display as a logo or pre-fill into an edit field.
 */
export function isUserImage(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return /^https?:\/\//i.test(v) || /^data:image\/(png|jpe?g|webp|gif|avif|bmp)/i.test(v);
}
