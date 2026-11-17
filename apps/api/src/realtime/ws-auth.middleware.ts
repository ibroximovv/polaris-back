import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { envs } from '../config/envs';
import type { AccessTokenPayload } from '../modules/auth/auth.types';
import { extractBearerToken } from '../modules/auth/guards/jwt-auth.guard';
import type { SocketData } from './ws.utils';

/** Access token from `io(url, { auth: { token } })`, or an `Authorization: Bearer` header. */
export function extractSocketToken(socket: Pick<Socket, 'handshake'>): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token !== '') return auth.token.replace(/^Bearer\s+/i, '');
  return extractBearerToken(socket.handshake.headers.authorization);
}

/**
 * Namespace middleware: a connection without a valid access token is refused before any handler
 * runs (the client gets `connect_error` with message "Unauthorized").
 */
export function createWsAuthMiddleware(jwtService: JwtService) {
  return async (socket: Socket, next: (error?: Error) => void): Promise<void> => {
    const token = extractSocketToken(socket);
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = await jwtService.verifyAsync<AccessTokenPayload>(token, { secret: envs.JWT_ACCESS_SECRET });
      if (payload.type !== 'access' || typeof payload.sub !== 'string') return next(new Error('Unauthorized'));
      (socket.data as SocketData).user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  };
}
