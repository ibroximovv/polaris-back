import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { RolesGuard } from './roles.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function wsContextFor(data: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    getType: () => 'ws',
    switchToWs: () => ({ getClient: () => ({ data }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => jest.resetAllMocks());

  it('allows routes without @Roles()', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('allows a user with a required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    expect(guard.canActivate(contextFor({ user: { id: 'u1', role: 'ADMIN' } }))).toBe(true);
  });

  it('rejects a user without the role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextFor({ user: { id: 'u1', role: 'USER' } }))).toThrow(ForbiddenException);
  });

  it('rejects an anonymous request on a role-protected route', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });

  it('reads the socket user for websocket handlers', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    expect(guard.canActivate(wsContextFor({ user: { id: 'a1', role: 'ADMIN' } }))).toBe(true);
    expect(() => guard.canActivate(wsContextFor({ user: { id: 'u1', role: 'USER' } }))).toThrow(ForbiddenException);
  });
});
