import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from '../progress/progress.service';
import { makeLesson, makeProgressRecord } from '../progress/progress.test-helpers';
import { LessonTestsService } from './lesson-tests.service';
import { makeTest } from './lesson-tests.test-helpers';

const student: AuthUser = { id: 'u1', role: 'USER' };
const date = new Date('2026-01-01T00:00:00.000Z');
const option = (text: string, is_correct: boolean) => ({ text, is_correct });

describe('LessonTestsService', () => {
  const tx = { testQuestion: { update: jest.fn() }, testOption: { deleteMany: jest.fn(), createMany: jest.fn() } };
  const prisma = {
    lesson: { findUnique: jest.fn() },
    lessonTest: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    testQuestion: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    testAttempt: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const progress = { assertLessonOpen: jest.fn(), applyTestResult: jest.fn() };
  let service: LessonTestsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.lessonTest.findUnique.mockReset().mockResolvedValue(makeTest());
    prisma.testAttempt.count.mockReset();
    prisma.testQuestion.findUnique.mockReset();
    prisma.lesson.findUnique.mockReset();
    prisma.lessonTest.create.mockReset();
    progress.assertLessonOpen.mockReset().mockResolvedValue({
      lesson: makeLesson({ has_test: true }),
      course_id: 'c1',
      record: makeProgressRecord({ video_completed_at: date }),
      status: 'in_progress',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        LessonTestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProgressService, useValue: progress },
      ],
    }).compile();
    service = moduleRef.get(LessonTestsService);
  });

  describe('createTest', () => {
    const dto = {
      lesson_id: 'l1',
      questions: [{ text: 'Q?', options: [option('a', true), option('b', false)] }],
    };

    it('creates the test with nested questions and options', async () => {
      prisma.lesson.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.lessonTest.create.mockResolvedValue(makeTest());
      await expect(service.createTest(dto)).resolves.toMatchObject({ id: 't1' });
      expect(prisma.lessonTest.create).toHaveBeenCalledWith({
        data: {
          lesson_id: 'l1',
          questions: {
            create: [
              {
                text: 'Q?',
                points: 1,
                position: 0,
                options: {
                  create: [
                    { text: 'a', is_correct: true, position: 0 },
                    { text: 'b', is_correct: false, position: 1 },
                  ],
                },
              },
            ],
          },
        },
      });
    });

    it('throws NotFoundException for an unknown lesson', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.createTest(dto)).rejects.toThrow(NotFoundException);
    });

    it('maps a second test for the same lesson to ConflictException', async () => {
      prisma.lesson.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.lessonTest.create.mockRejectedValue({ code: 'P2002', meta: {} });
      await expect(service.createTest(dto)).rejects.toThrow(ConflictException);
    });

    it('rejects a question without a correct option', async () => {
      prisma.lesson.findUnique.mockResolvedValue({ id: 'l1' });
      await expect(
        service.createTest({ lesson_id: 'l1', questions: [{ text: 'Q', options: [option('a', false), option('b', false)] }] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTest / getAdminTest', () => {
    it('updates settings and returns the admin view', async () => {
      prisma.lessonTest.update.mockResolvedValue(makeTest());
      const result = await service.updateTest('t1', { pass_score: 80 });
      expect(prisma.lessonTest.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { pass_score: 80 } });
      expect(result.questions[0].options[0]).toHaveProperty('is_correct');
    });

    it('throws NotFoundException for an unknown test', async () => {
      prisma.lessonTest.findUnique.mockResolvedValue(null);
      await expect(service.getAdminTest('nope')).rejects.toThrow(new NotFoundException('Test #nope not found'));
    });
  });

  describe('getPublicTest', () => {
    it('checks the lesson is open and hides answers', async () => {
      const result = await service.getPublicTest(student, 't1');
      expect(progress.assertLessonOpen).toHaveBeenCalledWith(student, 'l1');
      expect(JSON.stringify(result)).not.toContain('is_correct');
    });

    it('propagates a locked lesson', async () => {
      progress.assertLessonOpen.mockRejectedValue(new ForbiddenException());
      await expect(service.getPublicTest(student, 't1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('questions', () => {
    it('adds a question at the end', async () => {
      await service.addQuestion('t1', { text: 'New', options: [option('x', true), option('y', false)] });
      expect(prisma.testQuestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ test_id: 't1', text: 'New', position: 2 }),
      });
    });

    it('updates a question and replaces its options', async () => {
      prisma.testQuestion.findUnique.mockResolvedValue({ id: 'q1', test_id: 't1' });
      await service.updateQuestion('q1', { text: 'Edited', options: [option('x', true), option('y', false)] });
      expect(tx.testQuestion.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { text: 'Edited' } });
      expect(tx.testOption.deleteMany).toHaveBeenCalledWith({ where: { question_id: 'q1' } });
      expect(tx.testOption.createMany).toHaveBeenCalledWith({
        data: [
          { text: 'x', is_correct: true, position: 0, question_id: 'q1' },
          { text: 'y', is_correct: false, position: 1, question_id: 'q1' },
        ],
      });
    });

    it('removes a question', async () => {
      prisma.testQuestion.findUnique.mockResolvedValue({ id: 'q1', test_id: 't1' });
      await service.removeQuestion('q1');
      expect(prisma.testQuestion.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
    });

    it('throws NotFoundException for an unknown question', async () => {
      prisma.testQuestion.findUnique.mockResolvedValue(null);
      await expect(service.updateQuestion('nope', { text: 'x' })).rejects.toThrow(NotFoundException);
      await expect(service.removeQuestion('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitAttempt', () => {
    const answers = { answers: [{ question_id: 'q1', option_ids: ['a'] }, { question_id: 'q2', option_ids: ['c', 'd'] }] };

    it('grades on the server, stores the attempt and updates progress', async () => {
      prisma.testAttempt.create.mockResolvedValue({
        id: 'at1',
        test_id: 't1',
        user_id: 'u1',
        score: 4,
        max_score: 4,
        percent: 100,
        passed: true,
        created_at: date,
        updated_at: date,
      });
      const result = await service.submitAttempt(student, 't1', answers);
      expect(result).toMatchObject({ id: 'at1', percent: 100, passed: true });
      expect(result.answers).toEqual([
        { question_id: 'q1', is_correct: true, points: 1 },
        { question_id: 'q2', is_correct: true, points: 3 },
      ]);
      expect(prisma.testAttempt.create.mock.calls[0][0].data).toMatchObject({ score: 4, max_score: 4, passed: true });
      expect(progress.applyTestResult).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'l1' }), 100, true);
    });

    it('requires the video to be watched first', async () => {
      progress.assertLessonOpen.mockResolvedValue({
        lesson: makeLesson({ has_test: true }),
        course_id: 'c1',
        record: null,
        status: 'available',
      });
      await expect(service.submitAttempt(student, 't1', answers)).rejects.toThrow(
        new BadRequestException('Watch the lesson video before taking the test'),
      );
    });

    it('enforces max_attempts', async () => {
      prisma.lessonTest.findUnique.mockResolvedValue(makeTest({ max_attempts: 2 }));
      prisma.testAttempt.count.mockResolvedValue(2);
      await expect(service.submitAttempt(student, 't1', answers)).rejects.toThrow(ForbiddenException);
      expect(prisma.testAttempt.create).not.toHaveBeenCalled();
    });

    it('rejects a test without questions', async () => {
      prisma.lessonTest.findUnique.mockResolvedValue(makeTest({ questions: [] }));
      await expect(service.submitAttempt(student, 't1', { answers: [] })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAttemptHistory', () => {
    it('summarizes attempts', async () => {
      prisma.lessonTest.findUnique.mockResolvedValue(makeTest({ max_attempts: 3 }));
      prisma.testAttempt.findMany.mockResolvedValue([
        { id: 'a2', score: 4, max_score: 4, percent: 100, passed: true, created_at: date },
        { id: 'a1', score: 1, max_score: 4, percent: 25, passed: false, created_at: date },
      ]);
      await expect(service.getAttemptHistory('t1', 'u1')).resolves.toMatchObject({
        attempts_used: 2,
        attempts_left: 1,
        best_percent: 100,
        passed: true,
      });
    });

    it('throws NotFoundException for an unknown test', async () => {
      prisma.lessonTest.findUnique.mockResolvedValue(null);
      await expect(service.getAttemptHistory('nope', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});
