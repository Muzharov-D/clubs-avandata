// 'sporting_director' — DEPRECATED: роль слита со старшим тренером (head_coach,
// миграция 0019). Значение оставлено в union ради legacy-JWT (≤15 мин до рефреша).
export type UserRole = 'platform_admin' | 'head_coach' | 'team_coach' | 'player' | 'federation_admin' | 'sporting_director';

export interface User {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  tenantId: string | null;
  teamId: string | null;
  playerId: string | null;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
