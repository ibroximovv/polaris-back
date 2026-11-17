import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Namespace, Socket } from 'socket.io';
import { RealtimeGateway } from './realtime.gateway';
import { courseAdminsRoom, RealtimeService, userRoom } from './realtime.service';

const COURSE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const socketFor = (role: 'USER' | 'ADMIN') =>
  ({ data: { user: { id: 'u1', role } }, join: jest.fn(), leave: jest.fn() }) as unknown as Socket & {
    join: jest.Mock;
    leave: jest.Mock;
  };

describe('RealtimeGateway', () => {
  const realtime = { bind: jest.fn() };
  let gateway: RealtimeGateway;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: RealtimeService, useValue: realtime },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
      ],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
  });

  it('installs the auth middleware and binds the namespace', () => {
    const server = { use: jest.fn() };
    gateway.afterInit(server as unknown as Namespace);
    expect(server.use).toHaveBeenCalledWith(expect.any(Function));
    expect(realtime.bind).toHaveBeenCalledWith(server);
  });

  it("joins the user's room on connect", async () => {
    const socket = socketFor('USER');
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith(userRoom('u1'));
  });

  it('lets admins watch and unwatch a course', async () => {
    const socket = socketFor('ADMIN');
    await expect(gateway.watchCourse(socket, { course_id: COURSE_ID })).resolves.toEqual({
      ok: true,
      data: { course_id: COURSE_ID },
    });
    expect(socket.join).toHaveBeenCalledWith(courseAdminsRoom(COURSE_ID));
    await gateway.unwatchCourse(socket, { course_id: COURSE_ID });
    expect(socket.leave).toHaveBeenCalledWith(courseAdminsRoom(COURSE_ID));
  });

  it('refuses students and invalid payloads', async () => {
    const student = socketFor('USER');
    await expect(gateway.watchCourse(student, { course_id: COURSE_ID })).resolves.toMatchObject({
      ok: false,
      error: { status_code: 403 },
    });
    await expect(gateway.watchCourse(socketFor('ADMIN'), { course_id: 'x' })).resolves.toMatchObject({
      ok: false,
      error: { status_code: 400 },
    });
    expect(student.join).not.toHaveBeenCalled();
  });
});
