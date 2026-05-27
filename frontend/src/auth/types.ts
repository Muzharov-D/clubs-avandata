export type UserRole = 'platform_admin' | 'head_coach' | 'team_coach' | 'player';

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
