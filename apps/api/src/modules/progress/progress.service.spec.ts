import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from './progress.service';
import { makeCourse, makeProgressRecord } from './progress.test-helpers';

const student: AuthUser = { id: 'u1', role: 'USER' };
const admin: AuthUser = { id: 'a1', role: 'ADMIN' };

/** Raw `prisma.course.findUnique` result for getOrderedCourse, built from the shared fixture. */
function rawCourse() {
  return {
    is_published: true,
    modules: makeCourse().map((module) => ({
      ...module,
      lessons: module.lessons.map(({ has_test, ...lesson }) => ({ ...lesson, test: has_test ? { id: 't1' } : null })),
    })),
  };
}

const lessonLookup = (published = true) => ({ module: { course_id: 'c1', course: { is_published: published } } });

describe('ProgressService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    lessonProgress: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
  let service: ProgressService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ProgressService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ProgressService);
    prisma.course.findUnique.mockResolvedValue(rawCourse());
    prisma.lesson.findUnique.mockResolvedValue(lessonLookup());
    prisma.lessonProgress.findMany.mockResolvedValue([]);
    prisma.lessonProgress.upsert.mockImplementation(({ create }) =>
      Promise.resolve(makeProgressRecord({ ...create, id: 'p1' })),
    );
    prisma.lessonProgress.update.mockImplementation(({ data }) =>
      Promise.resolve(makeProgressRecord({ lesson_id: 'l3', ...data })),
    );
  });

  describe('getOrderedCourse', () => {
    it('returns modules and lessons in learning order', async () => {
      const modules = await service.getOrderedCourse('c1');
      expect(modules.flatMap((module) => module.lessons.map((lesson) => [lesson.id, lesson.has_test]))).toEqual([
        ['l1', true],
        ['l2', false],
        ['l3', false],
      ]);
    });

    it('throws NotFoundException for an unknown course', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(service.getOrderedCourse('nope')).rejects.toThrow(new NotFoundException('Course #nope not found'));
    });
  });

  describe('getLessonContext / assertLessonOpen', () => {
    it('returns the lesson with its status', async () => {
      const context = await service.getLessonContext(student, 'l1');
      expect(context).toMatchObject({ course_id: 'c1', status: 'available', record: null });
    });

    it('hides lessons of unpublished courses from students but not from admins', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lessonLookup(false));
      await expect(service.getLessonContext(student, 'l1')).rejects.toThrow(NotFoundException);
      await expect(service.getLessonContext(admin, 'l1')).resolves.toMatchObject({ status: 'available' });
    });

    it('rejects a locked lesson for a student', async () => {
      await expect(service.assertLessonOpen(student, 'l2')).rejects.toThrow(ForbiddenException);
    });

    it('lets an admin open a locked lesson', async () => {
      await expect(service.assertLessonOpen(admin, 'l2')).resolves.toMatchObject({ status: 'locked' });
    });
  });

  describe('getLessonProgress', () => {
    it('maps the record', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue([makeProgressRecord({ lesson_id: 'l1', watched_seconds: 40 })]);
      await expect(service.getLessonProgress(student, 'l1')).resolves.toMatchObject({
        status: 'in_progress',
        watched_seconds: 40,
        watched_percent: 40,
      });
    });

    it('throws NotFoundException for an unknown lesson', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.getLessonProgress(student, 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordWatch', () => {
    it('stores the first segment and the resume point', async () => {
      const result = await service.recordWatch(student, 'l1', { from: 0, to: 15 });
      expect(prisma.lessonProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            watched_segments: [[0, 15]],
            watched_seconds: 15,
            total_watch_seconds: 15,
            last_position: 15,
            video_completed_at: null,
          }),
        }),
      );
      expect(result).toMatchObject({ watched_seconds: 15, status: 'in_progress' });
    });

    it('cuts a segment longer than the real time since the previous heartbeat', async () => {
      const lastWatch = new Date(Date.now() - 10_000); // 10s ago -> at most 10*2+5 = 25s
      prisma.lessonProgress.findMany.mockResolvedValue([
        makeProgressRecord({ lesson_id: 'l1', watched_segments: [[0, 10]], watched_seconds: 10, last_watch_at: lastWatch }),
      ]);
      await service.recordWatch(student, 'l1', { from: 10, to: 70 });
      const { update } = prisma.lessonProgress.upsert.mock.calls[0][0];
      expect(update.watched_segments).toEqual([[0, 35]]);
      expect(update.watched_seconds).toBe(35);
    });

    it('marks the video watched at 95% and completes a lesson without a test', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue([
        makeProgressRecord({ lesson_id: 'l1', completed_at: new Date() }),
        makeProgressRecord({ lesson_id: 'l2', watched_segments: [[0, 150]], watched_seconds: 150 }),
      ]);
      prisma.lessonProgress.upsert.mockImplementation(({ update }) =>
        Promise.resolve(makeProgressRecord({ lesson_id: 'l2', ...update })),
      );
      const result = await service.recordWatch(student, 'l2', { from: 150, to: 200 });
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].update.video_completed_at).toBeInstanceOf(Date);
      expect(prisma.lessonProgress.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { completed_at: expect.any(Date) },
      });
      expect(result.status).toBe('completed');
    });

    it('does not complete a lesson whose test is not passed yet', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue([
        makeProgressRecord({ lesson_id: 'l1', watched_segments: [[0, 90]], watched_seconds: 90 }),
      ]);
      const result = await service.recordWatch(student, 'l1', { from: 90, to: 100 });
      expect(result).toMatchObject({ video_completed: true, test_passed: false, status: 'in_progress' });
      expect(prisma.lessonProgress.update).not.toHaveBeenCalled();
    });

    it('rejects too long or reversed segments', async () => {
      await expect(service.recordWatch(student, 'l1', { from: 0, to: 61 })).rejects.toThrow(BadRequestException);
      await expect(service.recordWatch(student, 'l1', { from: 20, to: 10 })).rejects.toThrow(BadRequestException);
    });

    it('rejects a lesson without a video', async () => {
      await expect(service.recordWatch(admin, 'l3', { from: 0, to: 10 })).rejects.toThrow(
        new BadRequestException('Lesson #l3 has no video to track'),
      );
    });

    it('rejects a locked lesson', async () => {
      await expect(service.recordWatch(student, 'l2', { from: 0, to: 10 })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('completeLesson', () => {
    const allDone = [
      makeProgressRecord({ lesson_id: 'l1', completed_at: new Date() }),
      makeProgressRecord({ lesson_id: 'l2', completed_at: new Date() }),
    ];

    it('completes a lesson that has no requirements', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue(allDone);
      prisma.lessonProgress.upsert.mockResolvedValue(makeProgressRecord({ lesson_id: 'l3', completed_at: new Date() }));
      await expect(service.completeLesson(student, 'l3')).resolves.toMatchObject({ status: 'completed' });
    });

    it('returns an already completed lesson unchanged', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue(allDone);
      await expect(service.completeLesson(student, 'l1')).resolves.toMatchObject({ status: 'completed' });
      expect(prisma.lessonProgress.upsert).not.toHaveBeenCalled();
    });

    it('requires the video first, then the test', async () => {
      await expect(service.completeLesson(student, 'l1')).rejects.toThrow(
        new BadRequestException('Watch the lesson video first'),
      );
      prisma.lessonProgress.findMany.mockResolvedValue([
        makeProgressRecord({ lesson_id: 'l1', video_completed_at: new Date() }),
      ]);
      await expect(service.completeLesson(student, 'l1')).rejects.toThrow(
        new BadRequestException('Pass the lesson test first'),
      );
    });
  });

  describe('applyTestResult', () => {
    const lesson = makeCourse()[0].lessons[0];

    it('keeps the best percent and completes the lesson when passed after the video', async () => {
      prisma.lessonProgress.findUnique.mockResolvedValue(
        makeProgressRecord({ best_test_percent: 50, video_completed_at: new Date() }),
      );
      prisma.lessonProgress.upsert.mockImplementation(({ update }) =>
        Promise.resolve(makeProgressRecord({ video_completed_at: new Date(), ...update })),
      );
      const result = await service.applyTestResult('u1', lesson, 80, true);
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].update).toEqual({
        best_test_percent: 80,
        test_passed_at: expect.any(Date),
      });
      expect(result.status).toBe('completed');
    });

    it('a failed attempt does not lower the best percent nor pass the test', async () => {
      prisma.lessonProgress.findUnique.mockResolvedValue(makeProgressRecord({ best_test_percent: 60 }));
      prisma.lessonProgress.upsert.mockImplementation(({ update }) => Promise.resolve(makeProgressRecord(update)));
      const result = await service.applyTestResult('u1', lesson, 40, false);
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].update).toEqual({
        best_test_percent: 60,
        test_passed_at: null,
      });
      expect(result).toMatchObject({ test_passed: false, status: 'in_progress' });
    });
  });

  describe('getCourseProgress', () => {
    it("returns the viewer's own progress", async () => {
      const result = await service.getCourseProgress(student, 'c1');
      expect(result).toMatchObject({ course_id: 'c1', user_id: 'u1', total_lessons: 3, current_lesson_id: 'l1' });
      expect(result.modules).toHaveLength(2);
    });

    it("lets an admin read another user's progress", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      await expect(service.getCourseProgress(admin, 'c1', 'u2')).resolves.toMatchObject({ user_id: 'u2' });
      expect(prisma.lessonProgress.findMany).toHaveBeenCalledWith({
        where: { user_id: 'u2', lesson: { module: { course_id: 'c1' } } },
      });
    });

    it('throws NotFoundException for an unknown user or a hidden course', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getCourseProgress(admin, 'c1', 'nope')).rejects.toThrow(
        new NotFoundException('User #nope not found'),
      );
      prisma.course.findUnique.mockResolvedValue({ ...rawCourse(), is_published: false });
      await expect(service.getCourseProgress(student, 'c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listCourseStudents', () => {
    const query = { page: 1, limit: 20, sort_order: 'asc' as const };

    it('returns students with their totals', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          full_name: 'Aziz',
          phone: '+998901234567',
          lesson_progress: [makeProgressRecord({ lesson_id: 'l1', watched_seconds: 100, completed_at: new Date() })],
        },
      ]);
      prisma.user.count.mockResolvedValue(1);
      const result = await service.listCourseStudents('c1', { ...query, search: 'az' });
      expect(result.data).toEqual([
        expect.objectContaining({
          user: { id: 'u1', full_name: 'Aziz', phone: '+998901234567' },
          completed_lessons: 1,
          watched_seconds: 100,
        }),
      ]);
      expect(result.data[0]).not.toHaveProperty('modules');
      expect(result.meta.total).toBe(1);
      expect(prisma.user.findMany.mock.calls[0][0].where.OR).toHaveLength(2);
    });

    it('rejects an unsupported sort field', async () => {
      await expect(service.listCourseStudents('c1', { ...query, sort_by: 'phone' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
