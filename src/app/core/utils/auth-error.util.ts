/** Maps a Firebase Auth error (Google sign-in) to an i18n key (+ params) safe to show the user. */
export function friendlyAuthErrorKey(err: unknown): { key: string; params?: Record<string, unknown> } {
  const code = (err as { code?: string })?.code ?? '';
  const known: Record<string, string> = {
    'auth/user-disabled': 'AUTH_ERROR.USER_DISABLED',
    'auth/popup-closed-by-user': 'AUTH_ERROR.POPUP_CANCELLED',
    'auth/cancelled-popup-request': 'AUTH_ERROR.POPUP_CANCELLED',
    'auth/popup-blocked': 'AUTH_ERROR.POPUP_BLOCKED',
    'auth/operation-not-allowed': 'AUTH_ERROR.OPERATION_NOT_ALLOWED',
    'auth/unauthorized-domain': 'AUTH_ERROR.UNAUTHORIZED_DOMAIN',
    'auth/internal-error': 'AUTH_ERROR.INTERNAL_ERROR',
    'auth/network-request-failed': 'AUTH_ERROR.NETWORK_ERROR',
    'auth/account-exists-with-different-credential': 'AUTH_ERROR.ACCOUNT_EXISTS',
  };
  const key = known[code];
  return key ? { key } : { key: 'AUTH_ERROR.GENERIC', params: { codeSuffix: code ? ` (${code})` : '' } };
}
