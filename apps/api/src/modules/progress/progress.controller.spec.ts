import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

describe('ProgressController', () => {
  const service = {
    getLessonProgress: jest.fn(),
    recordWatch: jest.fn(),
    completeLesson: jest.fn(),
    getCourseProgress: jest.fn(),
    listCourseStudents: jest.fn(),
  };
  const user: AuthUser = { id: 'u1', role: 'USER' };
  const admin: AuthUser = { id: 'a1', role: 'ADMIN' };
  let controller: ProgressController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProgressController],
      providers: [{ provide: ProgressService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProgressController);
  });

  it('delegates lesson routes', async () => {
    service.getLessonProgress.mockResolvedValue('lesson');
    service.recordWatch.mockResolvedValue('watch');
    service.completeLesson.mockResolvedValue('complete');
    await expect(controller.lesson(user, 'l1')).resolves.toBe('lesson');
    await expect(controller.watch(user, 'l1', { from: 0, to: 10 })).resolves.toBe('watch');
    await expect(controller.complete(user, 'l1')).resolves.toBe('complete');
    expect(service.recordWatch).toHaveBeenCalledWith(user, 'l1', { from: 0, to: 10 });
  });

  it('delegates course routes', async () => {
    service.getCourseProgress.mockResolvedValue('course');
    service.listCourseStudents.mockResolvedValue('students');
    const query = { page: 1, limit: 20, sort_order: 'desc' as const };
    await expect(controller.course(user, 'c1')).resolves.toBe('course');
    await expect(controller.students('c1', query)).resolves.toBe('students');
    await expect(controller.student(admin, 'c1', 'u1')).resolves.toBe('course');
    expect(service.getCourseProgress).toHaveBeenLastCalledWith(admin, 'c1', 'u1');
  });
});
