import { Match } from '../../../models/match.model';
import { Team, teamGroup } from '../../../models/team.model';
import { playerLabel } from '../../../shared/utils/player-label.util';

export interface ExportRow {
  round: string;
  home: string;
  homeClub: string;
  score: string;
  awayClub: string;
  away: string;
  status: string;
}

/** "Team 1 (13DTH17)" — the player label used everywhere else in the app. */
function labelOf(team: Team | undefined, fallback: string | undefined): string {
  if (!team) return fallback ?? '?';
  return playerLabel(team.teamName, team.manager);
}

/** One row per match, in schedule order, Group A on the left. */
export function buildExportRows(matches: Match[], teams: Team[]): ExportRow[] {
  const byId = new Map(teams.map((t) => [t.id, t] as const));
  return [...matches]
    .sort((a, b) => a.matchDate - b.matchDate || a.round.localeCompare(b.round))
    .map((m) => {
      const home = byId.get(m.homeTeamId);
      const away = byId.get(m.awayTeamId);
      const played = m.homeScore != null && m.awayScore != null;
      return {
        round: m.round,
        home: labelOf(home, m.homeTeamName),
        homeClub: m.homeClub ?? '',
        score: played ? m.homeScore + ' - ' + m.awayScore : '- : -',
        awayClub: m.awayClub ?? '',
        away: labelOf(away, m.awayTeamName),
        status: m.status,
      };
    });
}

/** The score card shown above the match list (same numbers as the on-screen Team A / Team B card). */
export interface ExportSummary {
  leftLabel: string; // "TEAM A"
  leftPoints: number;
  leftRecord: string; // "0T 2H 1B · HS -1"
  rightLabel: string;
  rightPoints: number;
  rightRecord: string;
  progress: string; // "3/25"
  verdict: string | null; // "Team B đang dẫn điểm"
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the results as a dark, chat-friendly PNG, with the score card on top when given. */
export function renderPng(title: string, rows: ExportRow[], summary?: ExportSummary): Promise<Blob | null> {
  const width = 1100;
  const rowH = 44;
  const titleH = 84;
  const cardH = summary ? 170 : 0;
  const headH = titleH + (summary ? cardH + 24 : 0);
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = (headH + rows.length * rowH + 24) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#1a2431';
  ctx.fillRect(0, 0, width, canvas.height / scale);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, 24, 42);

  if (summary) {
    const cy0 = titleH - 14;
    ctx.fillStyle = '#212d3d';
    roundRect(ctx, 24, cy0, width - 48, cardH, 18);
    ctx.fill();

    const colX = [width * 0.2, width / 2, width * 0.8];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const side = (x: number, label: string, pts: number, rec: string, color: string) => {
      ctx.font = '800 14px Inter, Arial, sans-serif';
      const pw = ctx.measureText(label).width + 28;
      ctx.fillStyle = color;
      roundRect(ctx, x - pw / 2, cy0 + 14, pw, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, cy0 + 28);
      ctx.fillStyle = color === '#3b82f6' ? '#60a5fa' : '#f472b6';
      ctx.font = '900 54px Inter, Arial, sans-serif';
      ctx.fillText(String(pts), x, cy0 + 70);
      ctx.fillStyle = '#9aa7b8';
      ctx.font = '500 15px Inter, Arial, sans-serif';
      ctx.fillText(rec, x, cy0 + 108);
    };
    side(colX[0], summary.leftLabel, summary.leftPoints, summary.leftRecord, '#3b82f6');
    side(colX[2], summary.rightLabel, summary.rightPoints, summary.rightRecord, '#ec4899');

    // centre: ball icon + played/total
    ctx.strokeStyle = '#7b8798';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(colX[1], cy0 + 50, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7b8798';
    ctx.beginPath();
    ctx.arc(colX[1], cy0 + 50, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 15px Inter, Arial, sans-serif';
    ctx.fillText(summary.progress, colX[1], cy0 + 84);

    if (summary.verdict) {
      ctx.strokeStyle = '#33414f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, cy0 + 126);
      ctx.lineTo(width - 48, cy0 + 126);
      ctx.stroke();
      ctx.fillStyle = '#34d27b';
      ctx.font = '700 17px Inter, Arial, sans-serif';
      ctx.fillText('\u{1F3C6} ' + summary.verdict, width / 2, cy0 + 150);
    }
    ctx.textAlign = 'left';
  }

  const mid = width / 2;
  rows.forEach((r, i) => {
    const y = headH + i * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = '#212d3d';
      ctx.fillRect(12, y, width - 24, rowH - 4);
    }
    const cy = y + (rowH - 4) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 17px Inter, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(r.home, mid - 70, cy - (r.homeClub ? 8 : 0));
    ctx.textAlign = 'left';
    ctx.fillText(r.away, mid + 70, cy - (r.awayClub ? 8 : 0));

    ctx.fillStyle = '#9aa7b8';
    ctx.font = '13px Inter, Arial, sans-serif';
    if (r.homeClub) {
      ctx.textAlign = 'right';
      ctx.fillText(r.homeClub, mid - 70, cy + 11);
    }
    if (r.awayClub) {
      ctx.textAlign = 'left';
      ctx.fillText(r.awayClub, mid + 70, cy + 11);
    }

    ctx.fillStyle = '#34d27b';
    ctx.font = 'bold 20px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.score, mid, cy);
  });

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'copied-no-group' | 'failed';

/**
 * Share a results image to a Facebook group. A web page can't post into Facebook on the user's
 * behalf, so: on a phone, hand the image to the native share sheet; on a desktop, copy it to the
 * clipboard and (if a group link is known) open that group in a new tab for a Ctrl+V paste.
 */
export async function shareImage(png: Promise<Blob>, title: string, groupUrl: string | null | undefined): Promise<ShareResult> {
  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (phone && typeof navigator.share === 'function') {
    try {
      const file = new File([await png], title + '.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch {
    const blob = await png.catch(() => null);
    if (blob) downloadBlob(blob, title + '.png');
    return 'failed';
  }

  if (groupUrl) {
    window.open(groupUrl, '_blank', 'noopener');
    return 'copied';
  }
  return 'copied-no-group';
}

export interface StandingsTableRow {
  pos: number;
  name: string;
  played: string;
  wdl: string;
  gd: string;
  points: string;
}

export interface StandingsTable {
  title: string;
  color: string; // accent for the section title
  head: { name: string; played: string; wdl: string; gd: string; points: string };
  rows: StandingsTableRow[];
}

/** Draws the standings tables (Team A vs B, overall, per team) as a dark, chat-friendly PNG. */
export function renderStandingsPng(title: string, tables: StandingsTable[]): Promise<Blob | null> {
  const width = 1100;
  const rowH = 40;
  const headH = 84;
  const sectionTitleH = 46;
  const colHeadH = 36;
  const gap = 22;
  const height = headH + tables.reduce((h, t) => h + sectionTitleH + colHeadH + t.rows.length * rowH + gap, 0) + 10;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#1a2431';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, 24, 42);

  const colPlayed = 650;
  const colWdl = 770;
  const colGd = 900;
  const colPts = 1030;
  let y = headH - 14;

  for (const t of tables) {
    ctx.textAlign = 'left';
    ctx.fillStyle = t.color;
    ctx.font = '800 19px Inter, Arial, sans-serif';
    ctx.fillText(t.title.toUpperCase(), 28, y + sectionTitleH / 2);
    y += sectionTitleH;

    ctx.fillStyle = '#212d3d';
    roundRect(ctx, 20, y, width - 40, colHeadH + t.rows.length * rowH, 14);
    ctx.fill();

    ctx.fillStyle = '#7b8798';
    ctx.font = '700 13px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('#', 40, y + colHeadH / 2);
    ctx.fillText(t.head.name, 84, y + colHeadH / 2);
    ctx.textAlign = 'center';
    ctx.fillText(t.head.played, colPlayed, y + colHeadH / 2);
    ctx.fillText(t.head.wdl, colWdl, y + colHeadH / 2);
    ctx.fillText(t.head.gd, colGd, y + colHeadH / 2);
    ctx.fillText(t.head.points, colPts, y + colHeadH / 2);
    y += colHeadH;

    t.rows.forEach((r, i) => {
      const cy = y + i * rowH + rowH / 2;
      if (i === 0) {
        ctx.fillStyle = 'rgba(245, 166, 35, 0.14)';
        ctx.fillRect(20, y + i * rowH, width - 40, rowH);
      } else if (i > 0) {
        ctx.fillStyle = '#2b384a';
        ctx.fillRect(40, y + i * rowH, width - 80, 1);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = i === 0 ? '#f5a623' : '#9aa7b8';
      ctx.font = '800 16px Inter, Arial, sans-serif';
      ctx.fillText(String(r.pos), 40, cy);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 17px Inter, Arial, sans-serif';
      ctx.fillText(r.name, 84, cy);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c1cad2';
      ctx.font = '500 16px Inter, Arial, sans-serif';
      ctx.fillText(r.played, colPlayed, cy);
      ctx.fillText(r.wdl, colWdl, cy);
      ctx.fillText(r.gd, colGd, cy);
      ctx.fillStyle = '#34d27b';
      ctx.font = '800 20px Inter, Arial, sans-serif';
      ctx.fillText(r.points, colPts, cy);
    });
    y += t.rows.length * rowH + gap;
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export interface RosterMember {
  name: string;
  sub: string;
  /** Football clubs assigned to this member (shown as a third line when present). */
  clubs?: string[];
  avatar: { src: string | null; bg: string; fg: string; initials: string };
}

export interface RosterColumn {
  label: string;
  color: string;
  members: RosterMember[];
}

/** Loads an image for the canvas; null when it can't be read cross-origin (the avatar then falls back to initials). */
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

/** Draws the roster (Team A | Team B members with their avatars) as a dark, chat-friendly PNG. */
export async function renderRosterPng(title: string, columns: RosterColumn[]): Promise<Blob | null> {
  const width = 1100;
  const hasClubs = columns.some((c) => c.members.some((m) => (m.clubs?.length ?? 0) > 0));
  const rowH = hasClubs ? 92 : 70;
  const headH = 84;
  const colHeadH = 56;
  const pad = 24;
  const gap = 24;
  const colW = (width - pad * 2 - gap * (columns.length - 1)) / columns.length;
  const maxRows = Math.max(1, ...columns.map((c) => c.members.length));
  const height = headH + colHeadH + maxRows * rowH + 36;

  // Load every avatar picture first (in parallel); failures just fall back to initials.
  const images = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    columns
      .flatMap((c) => c.members)
      .map(async (m) => {
        if (m.avatar.src) images.set(m.avatar.src, await loadImage(m.avatar.src));
      })
  );

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#1a2431';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(title, pad, 42);

  columns.forEach((col, ci) => {
    const x = pad + ci * (colW + gap);
    const top = headH - 14;

    // column header pill
    ctx.font = '800 20px Inter, Arial, sans-serif';
    const label = col.label.toUpperCase() + '  ' + col.members.length;
    const pw = ctx.measureText(label).width + 36;
    ctx.fillStyle = col.color;
    roundRect(ctx, x, top, pw, 38, 19);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 18, top + 20);

    col.members.forEach((m, i) => {
      const y = top + colHeadH + i * rowH;
      ctx.fillStyle = '#212d3d';
      roundRect(ctx, x, y, colW, rowH - 8, 14);
      ctx.fill();
      ctx.fillStyle = col.color;
      roundRect(ctx, x, y, 6, rowH - 8, 3);
      ctx.fill();

      const cx = x + 44;
      const cy = y + (rowH - 8) / 2;
      const r = 24;
      const img = m.avatar.src ? images.get(m.avatar.src) : null;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      if (img) {
        const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
        const w = img.width * s;
        const h = img.height * s;
        ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      } else {
        ctx.fillStyle = m.avatar.bg;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = m.avatar.fg;
        ctx.font = '700 17px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.avatar.initials, cx, cy + 1);
      }
      ctx.restore();
      ctx.strokeStyle = col.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 19px Inter, Arial, sans-serif';
      const hasMemberClubs = (m.clubs?.length ?? 0) > 0;
      const nameY = hasMemberClubs ? cy - 20 : cy - (m.sub ? 10 : 0);
      ctx.fillText(m.name, x + 84, nameY);
      if (m.sub) {
        ctx.fillStyle = '#9aa7b8';
        ctx.font = '500 15px Inter, Arial, sans-serif';
        ctx.fillText(m.sub, x + 84, hasMemberClubs ? cy + 1 : cy + 13);
      }
      if (hasMemberClubs) {
        const maxW = colW - 84 - 16;
        let text = m.clubs!.join(' \u00B7 ');
        ctx.fillStyle = '#34d27b';
        ctx.font = '600 14px Inter, Arial, sans-serif';
        while (text.length > 3 && ctx.measureText(text).width > maxW) text = text.slice(0, -2);
        if (text !== m.clubs!.join(' \u00B7 ')) text = text.trimEnd() + '\u2026';
        ctx.fillText(text, x + 84, cy + 22);
      }
    });
  });

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

// Re-exported so callers needing the group of a team don't import the model twice.
export { teamGroup };
