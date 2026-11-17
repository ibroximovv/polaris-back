import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { createWsAuthMiddleware, extractSocketToken } from './ws-auth.middleware';

const socketWith = (auth: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  ({ handshake: { auth, headers }, data: {} }) as unknown as Socket;

describe('ws auth middleware', () => {
  it('reads the token from auth.token or the Authorization header', () => {
    expect(extractSocketToken(socketWith({ token: 'abc' }))).toBe('abc');
    expect(extractSocketToken(socketWith({ token: 'Bearer abc' }))).toBe('abc');
    expect(extractSocketToken(socketWith({}, { authorization: 'Bearer xyz' }))).toBe('xyz');
    expect(extractSocketToken(socketWith())).toBeNull();
  });

  describe('createWsAuthMiddleware', () => {
    const jwt = { verifyAsync: jest.fn() };
    const middleware = createWsAuthMiddleware(jwt as unknown as JwtService);

    beforeEach(() => jest.resetAllMocks());

    it('attaches the user for a valid access token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'ADMIN', type: 'access' });
      const socket = socketWith({ token: 'good' });
      const next = jest.fn();
      await middleware(socket, next);
      expect(next).toHaveBeenCalledWith();
      expect(socket.data).toEqual({ user: { id: 'u1', role: 'ADMIN' } });
    });

    it('refuses missing, invalid and refresh tokens', async () => {
      const next = jest.fn();
      await middleware(socketWith(), next);
      jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'));
      await middleware(socketWith({ token: 'bad' }), next);
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'u1', type: 'refresh' });
      await middleware(socketWith({ token: 'refresh' }), next);
      expect(next).toHaveBeenCalledTimes(3);
      for (const [error] of next.mock.calls) expect(error).toEqual(new Error('Unauthorized'));
    });
  });
});
