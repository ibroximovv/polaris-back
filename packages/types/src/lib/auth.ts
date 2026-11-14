import type { User } from './users';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  /** Access token lifetime in seconds. */
  expires_in: number;
  /** Refresh token lifetime in seconds. */
  refresh_expires_in: number;
}

/** Returned by register and login: the signed-in user plus a fresh token pair. */
export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}
