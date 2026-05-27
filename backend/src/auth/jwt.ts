import { createHash, randomBytes, createHmac } from 'node:crypto';
import { env } from '../env.js';
import type { UserRole } from '../db/schema/users.js';

export interface AccessTokenPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
  teamId: string | null;
  playerId: string | null;
}

interface JwtPayload extends AccessTokenPayload {
  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const pad = (4 - (input.length % 4)) % 4;
  return Buffer.from(
    input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad),
    'base64',
  );
}

function parseTtl(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) throw new Error(`invalid ttl: ${ttl}`);
  const n = Number(m[1]);
  const unit = m[2];
  const mul = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return n * mul;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + parseTtl(env.ACCESS_TOKEN_TTL),
  };
  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encBody = base64UrlEncode(JSON.stringify(body));
  const sig = createHmac('sha256', env.JWT_SECRET)
    .update(`${encHeader}.${encBody}`)
    .digest();
  return `${encHeader}.${encBody}.${base64UrlEncode(sig)}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [encHeader, encBody, encSig] = parts as [string, string, string];
  const expected = createHmac('sha256', env.JWT_SECRET)
    .update(`${encHeader}.${encBody}`)
    .digest();
  const actual = base64UrlDecode(encSig);
  if (expected.length !== actual.length) throw new Error('bad signature');
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= (expected[i] ?? 0) ^ (actual[i] ?? 0);
  }
  if (diff !== 0) throw new Error('bad signature');
  const body = JSON.parse(base64UrlDecode(encBody).toString('utf8')) as JwtPayload;
  if (body.exp < Math.floor(Date.now() / 1000)) throw new Error('token expired');
  return {
    sub: body.sub,
    tenantId: body.tenantId,
    role: body.role,
    teamId: body.teamId,
    playerId: body.playerId,
  };
}

/**
 * Refresh token — random opaque string stored as sha256 in DB.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
