import { Directive, ElementRef, EventEmitter, OnDestroy, Output, inject } from '@angular/core';

/**
 * Lightweight touch-swipe detector (left/right) used to swipe between tournament detail tabs.
 * Deliberately avoids HammerJS (unmaintained, heavy) — plain touchstart/touchend delta is enough
 * for a single-axis horizontal gesture and keeps the bundle smaller.
 */
@Directive({
  selector: '[appSwipe]',
  standalone: true,
})
export class SwipeDirective implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private startX = 0;
  private startY = 0;
  private readonly threshold = 40; // px
  private readonly restraint = 60; // max vertical drift allowed

  @Output() swipeLeft = new EventEmitter<void>();
  @Output() swipeRight = new EventEmitter<void>();

  private onStart = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    this.startX = t.clientX;
    this.startY = t.clientY;
  };

  private onEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - this.startX;
    const dy = t.clientY - this.startY;
    if (Math.abs(dx) >= this.threshold && Math.abs(dy) <= this.restraint) {
      if (dx < 0) this.swipeLeft.emit();
      else this.swipeRight.emit();
    }
  };

  constructor() {
    const node = this.el.nativeElement;
    node.addEventListener('touchstart', this.onStart, { passive: true });
    node.addEventListener('touchend', this.onEnd, { passive: true });
  }

  ngOnDestroy(): void {
    const node = this.el.nativeElement;
    node.removeEventListener('touchstart', this.onStart);
    node.removeEventListener('touchend', this.onEnd);
  }
}
