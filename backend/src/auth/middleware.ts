import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type AccessTokenPayload } from './jwt.js';
import { UnauthorizedError, ForbiddenError } from '../shared/errors.js';
import type { UserRole } from '../db/schema/users.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('missing bearer token');
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('invalid or expired token');
  }
}

export function authorize(...roles: UserRole[]) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`requires role: ${roles.join(' | ')}`);
    }
  };
}
