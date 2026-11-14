// User shapes returned by the API. Never contains password or token hashes.

export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  full_name: string;
  /** E.164, e.g. +998901234567 */
  phone: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}
