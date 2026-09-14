import { Directive, ElementRef, HostListener, Input, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { downscaleToDataUri } from '../utils/image-downscale.util';

/**
 * Makes the app's "image link" inputs forgiving about how the image reached the clipboard:
 *
 * 1. **Pasting a link** — strips every whitespace character as you type/paste. Text copied from
 *    "Copy image address", the address bar or a chat often carries a leading space, a trailing
 *    newline or wrapped line breaks; a leading space fails the `^https?://` validator (Save stays
 *    disabled) and inner breaks survive `.trim()`. URLs never contain whitespace, so it's safe.
 *
 * 2. **Pasting the image itself** — Chrome's "Copy image" puts a bitmap on the clipboard with no
 *    text, so a plain paste inserts nothing. Here we intercept it, downscale it on a canvas and
 *    drop in a `data:image/jpeg` URI, so "copy image → paste" just works without any file upload.
 */
@Directive({
  selector: 'input[appImageUrlInput]',
  standalone: true,
})
export class ImageUrlInputDirective {
  private ngControl = inject(NgControl, { self: true, optional: true });
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  /** Passed through to `downscaleToDataUri` for a "paste the image itself" — a caller displaying
   *  the image much larger than a small logo/avatar (e.g. a full-width banner) should raise this. */
  @Input() maxEdge?: number;
  @Input() maxBytes?: number;

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\s+/g, '');
    if (cleaned !== input.value) this.write(cleaned);
  }

  @HostListener('paste', ['$event'])
  async onPaste(event: ClipboardEvent): Promise<void> {
    const items = event.clipboardData?.items;
    const imageItem = items && Array.from(items).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imageItem) return; // a normal text paste — let it through; onInput() will de-whitespace it

    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    try {
      this.write(await downscaleToDataUri(file, { maxEdge: this.maxEdge, maxBytes: this.maxBytes }));
    } catch {
      /* conversion failed — leave the field untouched */
    }
  }

  private write(value: string): void {
    const control = this.ngControl?.control;
    if (control) {
      control.setValue(value); // updates the DOM via the value accessor + re-runs validators
    } else {
      this.el.nativeElement.value = value;
    }
    // let existing (input) handlers (e.g. clearing an "image failed to load" flag) react
    this.el.nativeElement.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
