/** One side of the result card. */
export interface ResultCardSide {
  name: string;
  /** Manager / player name under the team name. */
  sub: string | null;
  club: string | null;
  avatar: { src: string | null; bg: string; fg: string; initials: string };
  /** Ring / accent colour for this side. */
  color: string;
  won: boolean;
}

export interface ResultCard {
  tournament: string;
  round: string;
  home: ResultCardSide;
  away: ResultCardSide;
  score: string; // "3 - 1"
  penalties: string | null; // "(4-3 pen)"
  footer: string; // site domain
}

const W = 1200;
const H = 675;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** Shrinks `text` with an ellipsis until it fits `maxWidth` in the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, bg: string, fg: string): void {
  ctx.font = '700 22px Inter, Arial, sans-serif';
  const w = Math.min(ctx.measureText(text).width + 40, 340);
  const h = 40;
  ctx.fillStyle = bg;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rr = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(fit(ctx, text, w - 32), cx, cy + 1);
}

/** A chat-sized (1200×675, 16:9) PNG of a single match result, for sharing into a group chat. */
export async function renderResultCard(card: ResultCard): Promise<Blob | null> {
  const [homeImg, awayImg, logo] = await Promise.all([
    card.home.avatar.src ? loadImage(card.home.avatar.src) : null,
    card.away.avatar.src ? loadImage(card.away.avatar.src) : null,
    loadImage('/assets/images/logo-mark.png'),
  ]);
  await document.fonts?.ready;

  // 1.5× (1800×1012) stays sharp on a phone while keeping a photo-heavy PNG small enough to send.
  const scale = 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Background: dark base with each side's colour bleeding in from its edge.
  ctx.fillStyle = '#0f1720';
  ctx.fillRect(0, 0, W, H);
  for (const [side, x0, x1] of [
    [card.home, 0, W / 2],
    [card.away, W, W / 2],
  ] as const) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, side.color + '55');
    g.addColorStop(1, side.color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), 0, W / 2, H);
  }

  // Header: tournament + round.
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px Inter, Arial, sans-serif';
  ctx.fillText(fit(ctx, card.tournament, W - 120), W / 2, 64);
  if (card.round) {
    ctx.fillStyle = '#9aa7b8';
    ctx.font = '700 20px Inter, Arial, sans-serif';
    ctx.fillText(card.round.toUpperCase(), W / 2, 104);
  }

  // Sides.
  const cy = 300;
  const r = 92;
  for (const [side, cx, img] of [
    [card.home, W * 0.22, homeImg],
    [card.away, W * 0.78, awayImg],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
    } else {
      ctx.fillStyle = side.avatar.bg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = side.avatar.fg;
      ctx.font = '800 56px Inter, Arial, sans-serif';
      ctx.fillText(side.avatar.initials, cx, cy + 2);
    }
    ctx.restore();
    ctx.lineWidth = 7;
    ctx.strokeStyle = side.won ? '#f5a623' : side.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    if (side.won) {
      ctx.font = '40px Arial, sans-serif';
      ctx.fillText('\u{1F3C6}', cx + r * 0.78, cy - r * 0.78);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px Inter, Arial, sans-serif';
    ctx.fillText(fit(ctx, side.name, 380), cx, cy + r + 52);
    if (side.sub) {
      ctx.fillStyle = '#9aa7b8';
      ctx.font = '600 22px Inter, Arial, sans-serif';
      ctx.fillText(fit(ctx, side.sub, 380), cx, cy + r + 90);
    }
    if (side.club) pill(ctx, cx, cy + r + (side.sub ? 136 : 100), side.club, 'rgba(52,210,123,0.16)', '#34d27b');
  }

  // Score.
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 128px Inter, Arial, sans-serif';
  ctx.fillText(card.score, W / 2, cy + 6);
  if (card.penalties) {
    ctx.fillStyle = '#f5a623';
    ctx.font = '800 30px Inter, Arial, sans-serif';
    ctx.fillText(card.penalties, W / 2, cy + 92);
  }

  // Footer: logo + domain.
  ctx.font = '700 22px Inter, Arial, sans-serif';
  const fw = ctx.measureText(card.footer).width;
  const fx = W / 2 + (logo ? 18 : 0);
  if (logo) ctx.drawImage(logo, fx - fw / 2 - 44, H - 52, 28, 28);
  ctx.fillStyle = '#6b7a8c';
  ctx.fillText(card.footer, fx, H - 37);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
