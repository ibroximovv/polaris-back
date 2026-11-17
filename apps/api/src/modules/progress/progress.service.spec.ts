import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LEARNING_WS_EVENTS } from '@nestjs-template/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from './progress.service';
import { makeCourse, makeModuleRecord, makeProgressRecord } from './progress.test-helpers';
import type { OrderedModule } from './progress.utils';

const student: AuthUser = { id: 'u1', role: 'USER' };
const admin: AuthUser = { id: 'a1', role: 'ADMIN' };
const done = new Date('2026-01-05T00:00:00.000Z');

/** Raw `prisma.course.findUnique` result for getOrderedCourse, built from the shared fixture. */
function rawCourse(modules: OrderedModule[] = makeCourse()) {
  return {
    is_published: true,
    modules: modules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        position: lesson.position,
        video: lesson.has_video ? { duration: lesson.video_duration } : null,
        test: lesson.has_test ? { id: `t-${lesson.id}`, total_points: lesson.test_points } : null,
      })),
    })),
  };
}

const lessonLookup = (published = true) => ({ module: { course_id: 'c1', course: { is_published: published } } });
const moduleLookup = (published = true) => ({ course_id: 'c1', course: { is_published: published } });
const lessonsOfModule1Done = [
  makeProgressRecord({ lesson_id: 'l1', completed_at: done }),
  makeProgressRecord({ lesson_id: 'l2', completed_at: done }),
];

describe('ProgressService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    courseModule: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    lessonProgress: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    moduleProgress: { findMany: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
  const realtime = { toUser: jest.fn(), toCourseAdmins: jest.fn() };
  let service: ProgressService;

  const emitted = (event: string) =>
    realtime.toUser.mock.calls.filter(([, name]) => name === event).map(([, , payload]) => payload);

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();
    service = moduleRef.get(ProgressService);
    prisma.course.findUnique.mockResolvedValue(rawCourse());
    prisma.lesson.findUnique.mockResolvedValue(lessonLookup());
    prisma.courseModule.findUnique.mockResolvedValue(moduleLookup());
    prisma.lessonProgress.findMany.mockResolvedValue([]);
    prisma.moduleProgress.findMany.mockResolvedValue([]);
    prisma.lessonProgress.upsert.mockImplementation(({ create }) =>
      Promise.resolve(makeProgressRecord({ ...create, id: 'p1' })),
    );
    prisma.lessonProgress.update.mockImplementation(({ data }) =>
      Promise.resolve(makeProgressRecord({ lesson_id: 'l3', ...data })),
    );
    prisma.moduleProgress.upsert.mockImplementation(({ create }) => Promise.resolve(makeModuleRecord(create)));
  });

  describe('getOrderedCourse', () => {
    it('returns modules, lessons and module tests in learning order', async () => {
      const modules = await service.getOrderedCourse('c1');
      expect(modules.map((module) => module.test?.id ?? null)).toEqual(['mt1', null]);
      expect(modules[0].lessons[0]).toMatchObject({ id: 'l1', video_duration: 100, has_test: true, test_points: 100 });
    });

    it('throws NotFoundException for an unknown course', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(service.getOrderedCourse('nope')).rejects.toThrow(new NotFoundException('Course #nope not found'));
    });
  });

  describe('getLessonContext / assertLessonOpen', () => {
    it('returns the lesson with its status and the course outline', async () => {
      const context = await service.getLessonContext(student, 'l1');
      expect(context).toMatchObject({ course_id: 'c1', status: 'available', record: null });
      expect(context.modules).toHaveLength(2);
    });

    it('hides lessons of unpublished courses from students but not from admins', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lessonLookup(false));
      await expect(service.getLessonContext(student, 'l1')).rejects.toThrow(NotFoundException);
      await expect(service.getLessonContext(admin, 'l1')).resolves.toMatchObject({ status: 'available' });
    });

    it('rejects a locked lesson for a student', async () => {
      await expect(service.assertLessonOpen(student, 'l2')).rejects.toThrow(ForbiddenException);
    });

    it('keeps the next module locked until the module test is passed', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue(lessonsOfModule1Done);
      await expect(service.assertLessonOpen(student, 'l3')).rejects.toThrow(ForbiddenException);
      prisma.moduleProgress.findMany.mockResolvedValue([makeModuleRecord({ test_passed_at: done })]);
      await expect(service.assertLessonOpen(student, 'l3')).resolves.toMatchObject({ status: 'available' });
    });

    it('lets an admin open a locked lesson', async () => {
      await expect(service.assertLessonOpen(admin, 'l2')).resolves.toMatchObject({ status: 'locked' });
    });
  });

  describe('getModuleTestContext / assertModuleTestOpen', () => {
    it('is locked until every lesson of the module is completed', async () => {
      await expect(service.assertModuleTestOpen(student, 'm1')).rejects.toThrow(ForbiddenException);
      prisma.lessonProgress.findMany.mockResolvedValue(lessonsOfModule1Done);
      await expect(service.assertModuleTestOpen(student, 'm1')).resolves.toMatchObject({
        status: 'available',
        lessons_completed: true,
        test: { id: 'mt1' },
      });
    });

    it('lets an admin open it any time', async () => {
      await expect(service.assertModuleTestOpen(admin, 'm1')).resolves.toMatchObject({ status: 'locked' });
    });

    it('404s for a module without a test, an unknown module or a hidden course', async () => {
      await expect(service.getModuleTestContext(student, 'm2')).rejects.toThrow(
        new NotFoundException('Module #m2 has no test'),
      );
      prisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.getModuleTestContext(student, 'x')).rejects.toThrow(NotFoundException);
      prisma.courseModule.findUnique.mockResolvedValue(moduleLookup(false));
      await expect(service.getModuleTestContext(student, 'm1')).rejects.toThrow(NotFoundException);
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
    it('stores the first segment and the resume point and pushes the progress', async () => {
      const result = await service.recordWatch(student, 'l1', { from: 0, to: 15 });
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].create).toMatchObject({
        watched_segments: [[0, 15]],
        watched_seconds: 15,
        total_watch_seconds: 15,
        last_position: 15,
        video_completed_at: null,
      });
      expect(result).toMatchObject({ watched_seconds: 15, status: 'in_progress' });
      expect(realtime.toUser).toHaveBeenCalledWith('u1', LEARNING_WS_EVENTS.LESSON_PROGRESS, result);
      expect(realtime.toCourseAdmins).toHaveBeenCalledWith(
        'c1',
        LEARNING_WS_EVENTS.STUDENT_PROGRESS,
        expect.objectContaining({ user_id: 'u1', lesson_id: 'l1', progress: result }),
      );
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

    it('completes a lesson without a test at 95% and points to the module test as the next step', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue([
        makeProgressRecord({ lesson_id: 'l1', completed_at: done }),
        makeProgressRecord({ lesson_id: 'l2', watched_segments: [[0, 150]], watched_seconds: 150 }),
      ]);
      prisma.lessonProgress.upsert.mockImplementation(({ update }) =>
        Promise.resolve(makeProgressRecord({ lesson_id: 'l2', ...update })),
      );
      const result = await service.recordWatch(student, 'l2', { from: 150, to: 200 });
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].update.video_completed_at).toBeInstanceOf(Date);
      expect(prisma.lessonProgress.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { completed_at: expect.any(Date) } });
      expect(result.status).toBe('completed');
      expect(emitted(LEARNING_WS_EVENTS.VIDEO_COMPLETED)).toEqual([{ course_id: 'c1', lesson_id: 'l2' }]);
      expect(emitted(LEARNING_WS_EVENTS.LESSON_COMPLETED)).toEqual([
        { course_id: 'c1', lesson_id: 'l2', next_lesson_id: null, next_test_id: 'mt1' },
      ]);
    });

    it('does not complete a lesson whose test is not passed yet', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue([
        makeProgressRecord({ lesson_id: 'l1', watched_segments: [[0, 90]], watched_seconds: 90 }),
      ]);
      const result = await service.recordWatch(student, 'l1', { from: 90, to: 100 });
      expect(result).toMatchObject({ video_completed: true, test_passed: false, status: 'in_progress' });
      expect(prisma.lessonProgress.update).not.toHaveBeenCalled();
      expect(emitted(LEARNING_WS_EVENTS.LESSON_COMPLETED)).toEqual([]);
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
    const allLessonsDone = [...lessonsOfModule1Done];

    it('completes a lesson that has no requirements and announces the end of the course', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue(allLessonsDone);
      prisma.moduleProgress.findMany.mockResolvedValue([makeModuleRecord({ test_passed_at: done })]);
      prisma.lessonProgress.upsert.mockResolvedValue(makeProgressRecord({ lesson_id: 'l3', completed_at: done }));
      await expect(service.completeLesson(student, 'l3')).resolves.toMatchObject({ status: 'completed' });
      expect(emitted(LEARNING_WS_EVENTS.LESSON_COMPLETED)).toEqual([
        { course_id: 'c1', lesson_id: 'l3', next_lesson_id: null, next_test_id: null },
      ]);
    });

    it('returns an already completed lesson unchanged', async () => {
      prisma.lessonProgress.findMany.mockResolvedValue(allLessonsDone);
      await expect(service.completeLesson(student, 'l1')).resolves.toMatchObject({ status: 'completed' });
      expect(prisma.lessonProgress.upsert).not.toHaveBeenCalled();
      expect(realtime.toUser).not.toHaveBeenCalled();
    });

    it('requires the video first, then the test', async () => {
      await expect(service.completeLesson(student, 'l1')).rejects.toThrow(
        new BadRequestException('Watch the lesson video first'),
      );
      prisma.lessonProgress.findMany.mockResolvedValue([makeProgressRecord({ lesson_id: 'l1', video_completed_at: done })]);
      await expect(service.completeLesson(student, 'l1')).rejects.toThrow(
        new BadRequestException('Pass the lesson test first'),
      );
    });
  });

  describe('applyTestResult', () => {
    const context = { lesson: makeCourse()[0].lessons[0], course_id: 'c1', modules: makeCourse() };

    it('keeps the best percent and completes the lesson when passed after the video', async () => {
      prisma.lessonProgress.findUnique.mockResolvedValue(
        makeProgressRecord({ best_test_percent: 50, video_completed_at: done }),
      );
      prisma.lessonProgress.upsert.mockImplementation(({ update }) =>
        Promise.resolve(makeProgressRecord({ video_completed_at: done, ...update })),
      );
      prisma.lessonProgress.update.mockImplementation(({ data }) =>
        Promise.resolve(makeProgressRecord({ best_test_percent: 80, test_passed_at: done, ...data })),
      );
      const result = await service.applyTestResult('u1', context, 80, true);
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].update).toEqual({
        best_test_percent: 80,
        test_passed_at: expect.any(Date),
      });
      expect(result).toMatchObject({ status: 'completed', earned_points: 80 });
      expect(emitted(LEARNING_WS_EVENTS.LESSON_COMPLETED)).toEqual([
        { course_id: 'c1', lesson_id: 'l1', next_lesson_id: 'l2', next_test_id: null },
      ]);
    });

    it('a failed attempt does not lower the best percent nor pass the test', async () => {
      prisma.lessonProgress.findUnique.mockResolvedValue(makeProgressRecord({ best_test_percent: 60 }));
      prisma.lessonProgress.upsert.mockImplementation(({ update }) => Promise.resolve(makeProgressRecord(update)));
      const result = await service.applyTestResult('u1', context, 40, false);
      expect(prisma.lessonProgress.upsert.mock.calls[0][0].update).toEqual({ best_test_percent: 60, test_passed_at: null });
      expect(result).toMatchObject({ test_passed: false, status: 'in_progress', earned_points: 60 });
    });
  });

  describe('applyModuleTestResult', () => {
    const modules = makeCourse();
    const context = {
      module: modules[0],
      test: { id: 'mt1', total_points: 50 },
      course_id: 'c1',
      modules,
      record: null,
      lessons_completed: true,
    };

    it('stores a passed result, completes the module and opens the next module', async () => {
      const result = await service.applyModuleTestResult('u1', context, 90, true);
      expect(prisma.moduleProgress.upsert).toHaveBeenCalledWith({
        where: { user_id_module_id: { user_id: 'u1', module_id: 'm1' } },
        create: { user_id: 'u1', module_id: 'm1', best_test_percent: 90, test_passed_at: expect.any(Date) },
        update: { best_test_percent: 90, test_passed_at: expect.any(Date) },
      });
      expect(result).toEqual({
        test_id: 'mt1',
        status: 'completed',
        best_test_percent: 90,
        test_passed: true,
        test_points: 50,
        earned_points: 45,
      });
      expect(emitted(LEARNING_WS_EVENTS.MODULE_TEST_RESULT)).toEqual([{ course_id: 'c1', module_id: 'm1', test: result }]);
      expect(emitted(LEARNING_WS_EVENTS.MODULE_COMPLETED)).toEqual([
        { course_id: 'c1', module_id: 'm1', next_lesson_id: 'l3', next_test_id: null },
      ]);
      expect(realtime.toCourseAdmins).toHaveBeenCalledWith(
        'c1',
        LEARNING_WS_EVENTS.STUDENT_PROGRESS,
        expect.objectContaining({ module_id: 'm1', module_test: result, progress: null }),
      );
    });

    it('keeps the best percent on a failed attempt and does not complete the module', async () => {
      prisma.moduleProgress.upsert.mockImplementation(({ update }) => Promise.resolve(makeModuleRecord(update)));
      const result = await service.applyModuleTestResult(
        'u1',
        { ...context, record: makeModuleRecord({ best_test_percent: 70 }) },
        30,
        false,
      );
      expect(result).toMatchObject({ status: 'in_progress', best_test_percent: 70, test_passed: false });
      expect(emitted(LEARNING_WS_EVENTS.MODULE_COMPLETED)).toEqual([]);
    });
  });

  describe('getCourseProgress', () => {
    it("returns the viewer's own progress with module tests", async () => {
      const result = await service.getCourseProgress(student, 'c1');
      expect(result).toMatchObject({
        course_id: 'c1',
        user_id: 'u1',
        total_modules: 2,
        total_lessons: 3,
        current_lesson_id: 'l1',
        current_test_id: null,
        total_points: 150,
      });
      expect(result.modules[0].test).toMatchObject({ test_id: 'mt1', status: 'locked' });
    });

    it("lets an admin read another user's progress", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      await expect(service.getCourseProgress(admin, 'c1', 'u2')).resolves.toMatchObject({ user_id: 'u2' });
      expect(prisma.lessonProgress.findMany).toHaveBeenCalledWith({
        where: { user_id: 'u2', lesson: { module: { course_id: 'c1' } } },
      });
      expect(prisma.moduleProgress.findMany).toHaveBeenCalledWith({ where: { user_id: 'u2', module: { course_id: 'c1' } } });
    });

    it('throws NotFoundException for an unknown user or a hidden course', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getCourseProgress(admin, 'c1', 'nope')).rejects.toThrow(new NotFoundException('User #nope not found'));
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
          lesson_progress: [makeProgressRecord({ lesson_id: 'l1', watched_seconds: 100, completed_at: done })],
          module_progress: [],
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
      await expect(service.listCourseStudents('c1', { ...query, sort_by: 'phone' })).rejects.toThrow(BadRequestException);
    });
  });
});
