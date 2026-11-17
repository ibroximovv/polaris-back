import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { LessonTestsController } from './lesson-tests.controller';
import { LessonTestsService } from './lesson-tests.service';

describe('LessonTestsController', () => {
  const service = {
    getPublicTest: jest.fn(),
    submitAttempt: jest.fn(),
    getAttemptHistory: jest.fn(),
    getAdminTest: jest.fn(),
    createTest: jest.fn(),
    updateTest: jest.fn(),
    remove: jest.fn(),
    addQuestion: jest.fn(),
    updateQuestion: jest.fn(),
    removeQuestion: jest.fn(),
    setPoints: jest.fn(),
  };
  const user: AuthUser = { id: 'u1', role: 'USER' };
  let controller: LessonTestsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [LessonTestsController],
      providers: [{ provide: LessonTestsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(LessonTestsController);
  });

  it('delegates student routes', async () => {
    service.getPublicTest.mockResolvedValue('test');
    service.submitAttempt.mockResolvedValue('result');
    service.getAttemptHistory.mockResolvedValue('history');
    await expect(controller.findOne(user, 't1')).resolves.toBe('test');
    await expect(controller.submit(user, 't1', { answers: [] })).resolves.toBe('result');
    await expect(controller.myAttempts(user, 't1')).resolves.toBe('history');
    expect(service.getAttemptHistory).toHaveBeenCalledWith('t1', 'u1');
  });

  it('delegates admin routes', async () => {
    service.getAdminTest.mockResolvedValue('full');
    service.createTest.mockResolvedValue('created');
    service.updateTest.mockResolvedValue('updated');
    service.addQuestion.mockResolvedValue('added');
    service.updateQuestion.mockResolvedValue('edited');
    service.getAttemptHistory.mockResolvedValue('history');
    service.setPoints.mockResolvedValue('points');
    const question = { text: 'Q', options: [] };
    await expect(controller.findFull('t1')).resolves.toBe('full');
    await expect(controller.create({ lesson_id: 'l1' })).resolves.toBe('created');
    await expect(controller.update('t1', { pass_score: 50 })).resolves.toBe('updated');
    await expect(controller.addQuestion('t1', question)).resolves.toBe('added');
    await expect(controller.updateQuestion('q1', { text: 'x' })).resolves.toBe('edited');
    await expect(controller.userAttempts('t1', 'u2')).resolves.toBe('history');
    await expect(controller.setPoints('t1', { total_points: 100 })).resolves.toBe('points');
    expect(service.setPoints).toHaveBeenCalledWith('t1', { total_points: 100 });
    await controller.remove('t1');
    await controller.removeQuestion('q1');
    expect(service.remove).toHaveBeenCalledWith('t1');
    expect(service.removeQuestion).toHaveBeenCalledWith('q1');
  });
});
