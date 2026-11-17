import type { Namespace } from 'socket.io';
import { courseAdminsRoom, RealtimeService, userRoom } from './realtime.service';

describe('RealtimeService', () => {
  it('is a no-op until the gateway binds the namespace', () => {
    expect(() => new RealtimeService().toUser('u1', 'e', {})).not.toThrow();
  });

  it('emits to the user and course-admin rooms', () => {
    const emit = jest.fn();
    const server = { to: jest.fn(() => ({ emit })) };
    const service = new RealtimeService();
    service.bind(server as unknown as Namespace);
    service.toUser('u1', 'progress:lesson', { a: 1 });
    service.toCourseAdmins('c1', 'admin:student-progress', { b: 2 });
    expect(server.to).toHaveBeenNthCalledWith(1, userRoom('u1'));
    expect(server.to).toHaveBeenNthCalledWith(2, courseAdminsRoom('c1'));
    expect(emit).toHaveBeenNthCalledWith(1, 'progress:lesson', { a: 1 });
    expect(emit).toHaveBeenNthCalledWith(2, 'admin:student-progress', { b: 2 });
  });
});
