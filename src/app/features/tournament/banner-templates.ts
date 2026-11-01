/** Ready-made tournament banners (1920 × 480, 4:1) shipped in `src/assets/banners/`. */
export interface BannerTemplate {
  /** Path stored as the tournament's `image`, relative to the app root. */
  src: string;
  /** i18n key for the short display name. */
  label: string;
}

export const BANNER_TEMPLATES: BannerTemplate[] = [
  { src: 'assets/banners/pitch-night.svg', label: 'TOURNAMENT_FORM.BANNER_PITCH_NIGHT' },
  { src: 'assets/banners/emerald-stripes.svg', label: 'TOURNAMENT_FORM.BANNER_EMERALD' },
  { src: 'assets/banners/gold-trophy.svg', label: 'TOURNAMENT_FORM.BANNER_GOLD_TROPHY' },
  { src: 'assets/banners/neon-blue.svg', label: 'TOURNAMENT_FORM.BANNER_NEON_BLUE' },
  { src: 'assets/banners/red-fire.svg', label: 'TOURNAMENT_FORM.BANNER_RED_FIRE' },
  { src: 'assets/banners/stadium-lights.svg', label: 'TOURNAMENT_FORM.BANNER_STADIUM' },
  { src: 'assets/banners/anime-sunset-strike.svg', label: 'TOURNAMENT_FORM.BANNER_ANIME_SUNSET' },
  { src: 'assets/banners/anime-lightning-duel.svg', label: 'TOURNAMENT_FORM.BANNER_ANIME_LIGHTNING' },
  { src: 'assets/banners/anime-sakura-night.svg', label: 'TOURNAMENT_FORM.BANNER_ANIME_SAKURA' },
  { src: 'assets/banners/anime-fire-shot.svg', label: 'TOURNAMENT_FORM.BANNER_ANIME_FIRE' },
  { src: 'assets/banners/anime-ice-keeper.svg', label: 'TOURNAMENT_FORM.BANNER_ANIME_ICE' },
  { src: 'assets/banners/anime-victory.svg', label: 'TOURNAMENT_FORM.BANNER_ANIME_VICTORY' },
];
