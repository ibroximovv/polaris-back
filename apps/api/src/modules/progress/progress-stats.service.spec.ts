import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressStatsService } from './progress-stats.service';
import { ProgressService } from './progress.service';

const student: AuthUser = { id: 'u1', role: 'USER' };
const test = (id: string, points = 100) => ({ id, title: null, total_points: points, pass_score: 70, _count: { questions: 4 } });

describe('ProgressStatsService', () => {
  const prisma = { courseModule: { findMany: jest.fn() }, testAttempt: { findMany: jest.fn() } };
  const progress = { assertCourseAccess: jest.fn() };
  let service: ProgressStatsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressStatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProgressService, useValue: progress },
      ],
    }).compile();
    service = moduleRef.get(ProgressStatsService);
  });

  it('collects lesson tests then the module test, and the user attempts', async () => {
    prisma.courseModule.findMany.mockResolvedValue([
      {
        id: 'm1',
        title: 'Module 1',
        position: 0,
        test: test('mt1', 50),
        lessons: [
          { id: 'l1', title: 'Lesson 1', test: test('t1') },
          { id: 'l2', title: 'Lesson 2', test: null },
        ],
      },
    ]);
    prisma.testAttempt.findMany.mockResolvedValue([
      { test_id: 't1', percent: 80, passed: true, created_at: new Date(), answers: [{ is_correct: true }] },
    ]);
    const stats = await service.getCourseTestStats(student, 'c1');
    expect(progress.assertCourseAccess).toHaveBeenCalledWith(student, 'c1', 'u1');
    expect(prisma.testAttempt.findMany.mock.calls[0][0].where).toEqual({ user_id: 'u1', test_id: { in: ['t1', 'mt1'] } });
    expect(stats.modules[0].tests.map((item) => [item.test_id, item.kind, item.lesson_title])).toEqual([
      ['t1', 'LESSON', 'Lesson 1'],
      ['mt1', 'MODULE', null],
    ]);
    expect(stats).toMatchObject({ tests_total: 2, tests_passed: 1, total_points: 150, earned_points: 80 });
  });

  it('skips the attempts query for a course without tests', async () => {
    prisma.courseModule.findMany.mockResolvedValue([{ id: 'm1', title: 'M', position: 0, test: null, lessons: [] }]);
    await expect(service.getCourseTestStats(student, 'c1', 'u2')).resolves.toMatchObject({ user_id: 'u2', tests_total: 0 });
    expect(prisma.testAttempt.findMany).not.toHaveBeenCalled();
  });

  it('propagates a hidden course or unknown user', async () => {
    progress.assertCourseAccess.mockRejectedValue(new NotFoundException());
    await expect(service.getCourseTestStats(student, 'c1')).rejects.toThrow(NotFoundException);
    expect(prisma.courseModule.findMany).not.toHaveBeenCalled();
  });
});
