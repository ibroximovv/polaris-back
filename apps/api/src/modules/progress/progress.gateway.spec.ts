import { Test } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { ProgressGateway } from './progress.gateway';
import { ProgressService } from './progress.service';

const LESSON_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const socket = { data: { user: { id: 'u1', role: 'USER' } } } as unknown as Socket;

describe('ProgressGateway', () => {
  const service = { recordWatch: jest.fn(), getLessonProgress: jest.fn() };
  let gateway: ProgressGateway;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ProgressGateway, { provide: ProgressService, useValue: service }],
    }).compile();
    gateway = moduleRef.get(ProgressGateway);
  });

  it('records a heartbeat and acks the lesson progress', async () => {
    service.recordWatch.mockResolvedValue('progress');
    await expect(
      gateway.watch(socket, { lesson_id: LESSON_ID, from: 0, to: 10, position: 10 }),
    ).resolves.toEqual({ ok: true, data: 'progress' });
    expect(service.recordWatch).toHaveBeenCalledWith({ id: 'u1', role: 'USER' }, LESSON_ID, {
      from: 0,
      to: 10,
      position: 10,
    });
  });

  it('acks validation errors without calling the service', async () => {
    await expect(gateway.watch(socket, { lesson_id: LESSON_ID, from: -1, to: 10 })).resolves.toMatchObject({
      ok: false,
      error: { status_code: 400 },
    });
    expect(service.recordWatch).not.toHaveBeenCalled();
  });

  it('returns the current lesson progress', async () => {
    service.getLessonProgress.mockResolvedValue('detail');
    await expect(gateway.getLesson(socket, { lesson_id: LESSON_ID })).resolves.toEqual({ ok: true, data: 'detail' });
  });
});
