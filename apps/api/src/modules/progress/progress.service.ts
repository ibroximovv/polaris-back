import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CourseProgress,
  type CourseStudentProgress,
  LEARNING_WS_EVENTS,
  type LessonCompletedEvent,
  type LessonProgress,
  type LessonStatus,
  type ModuleCompletedEvent,
  type ModuleTestProgress,
  type ModuleTestResultEvent,
  type PaginatedResponse,
  type StudentProgressEvent,
  type VideoCompletedEvent,
} from '@nestjs-template/types';
import { buildPaginationMeta } from '../../common/base/base.service';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type {
  LessonProgress as LessonProgressRecord,
  ModuleProgress as ModuleProgressRecord,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import type { AuthUser } from '../auth/auth.types';
import type { RecordWatchDto } from './dto/record-watch.dto';
import {
  buildCourseProgress,
  computeCourseState,
  type CourseState,
  HEARTBEAT_TOLERANCE_SECONDS,
  hasVideo,
  isLessonRequirementsMet,
  MAX_PLAYBACK_RATE,
  MAX_SEGMENT_SECONDS,
  mergeSegment,
  moduleOrder,
  nextStep,
  type OrderedLesson,
  type OrderedModule,
  type OrderedModuleTest,
  orderedModuleSelect,
  parseSegments,
  requiredWatchSeconds,
  sumSegments,
  toLessonProgress,
  toModuleTestProgress,
  toOrderedModule,
} from './progress.utils';

/** A lesson with the user's record and status, plus the course outline it belongs to. */
export interface LessonContext {
  lesson: OrderedLesson;
  course_id: string;
  modules: OrderedModule[];
  record: LessonProgressRecord | null;
  status: LessonStatus;
}

/** A module's final test with the user's record and status. */
export interface ModuleTestContext {
  module: OrderedModule;
  test: OrderedModuleTest;
  course_id: string;
  modules: OrderedModule[];
  record: ModuleProgressRecord | null;
  status: LessonStatus;
  /** Every lesson of the module is completed. */
  lessons_completed: boolean;
}

type ProgressData = Omit<
  Prisma.LessonProgressUncheckedCreateInput,
  'id' | 'user_id' | 'lesson_id' | 'created_at' | 'updated_at'
>;

interface CourseSnapshot {
  modules: OrderedModule[];
  lessonRecords: Map<string, LessonProgressRecord>;
  moduleRecords: Map<string, ModuleProgressRecord>;
  state: CourseState;
}

const isAdmin = (user: AuthUser): boolean => user.role === 'ADMIN';

/**
 * Learning progress rules, shared by the lessons and tests modules:
 * - exact video watch tracking (unique watched seconds from merged segments),
 * - strict order: lessons of a module one by one, then the module's final test, then the next module,
 * - lesson completion = video watched (if tracked) + lesson test passed (if any),
 * - module completion = every lesson completed + final test passed (if any).
 * Every change is also pushed over socket.io to the student's devices and to admins watching the course.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Course outline in learning order: modules by position, lessons by position, module tests. */
  async getOrderedCourse(courseId: string): Promise<OrderedModule[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { modules: { orderBy: moduleOrder, select: orderedModuleSelect } },
    });
    if (!course) throw new NotFoundException(`Course #${courseId} not found`);
    return course.modules.map(toOrderedModule);
  }

  /** Lesson with the user's record and status. Students cannot see lessons of unpublished courses. */
  async getLessonContext(user: AuthUser, lessonId: string): Promise<LessonContext> {
    const found = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { course_id: true, course: { select: { is_published: true } } } } },
    });
    if (!found || (!found.module.course.is_published && !isAdmin(user))) {
      throw new NotFoundException(`Lesson #${lessonId} not found`);
    }
    const courseId = found.module.course_id;
    const snapshot = await this.loadSnapshot(user.id, courseId);
    const lesson = snapshot.modules.flatMap((module) => module.lessons).find((item) => item.id === lessonId);
    if (!lesson) throw new NotFoundException(`Lesson #${lessonId} not found`);
    return {
      lesson,
      course_id: courseId,
      modules: snapshot.modules,
      record: snapshot.lessonRecords.get(lessonId) ?? null,
      status: snapshot.state.lessons.get(lessonId) ?? 'locked',
    };
  }

  /** Same as getLessonContext, but a student gets 403 for a locked lesson. Admins may open any lesson. */
  async assertLessonOpen(user: AuthUser, lessonId: string): Promise<LessonContext> {
    const context = await this.getLessonContext(user, lessonId);
    if (context.status === 'locked' && !isAdmin(user)) {
      throw new ForbiddenException(`Lesson #${lessonId} is locked. Complete the previous lessons first`);
    }
    return context;
  }

  /** A module's final test with its status for the user. */
  async getModuleTestContext(user: AuthUser, moduleId: string): Promise<ModuleTestContext> {
    const found = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      select: { course_id: true, course: { select: { is_published: true } } },
    });
    if (!found || (!found.course.is_published && !isAdmin(user))) {
      throw new NotFoundException(`Module #${moduleId} not found`);
    }
    const snapshot = await this.loadSnapshot(user.id, found.course_id);
    const module = snapshot.modules.find((item) => item.id === moduleId);
    if (!module?.test) throw new NotFoundException(`Module #${moduleId} has no test`);
    return {
      module,
      test: module.test,
      course_id: found.course_id,
      modules: snapshot.modules,
      record: snapshot.moduleRecords.get(moduleId) ?? null,
      status: snapshot.state.moduleTests.get(moduleId) ?? 'locked',
      lessons_completed: module.lessons.every((lesson) => snapshot.state.lessons.get(lesson.id) === 'completed'),
    };
  }

  /** A student may open a module test only after every lesson of the module (and every earlier step) is done. */
  async assertModuleTestOpen(user: AuthUser, moduleId: string): Promise<ModuleTestContext> {
    const context = await this.getModuleTestContext(user, moduleId);
    if (context.status === 'locked' && !isAdmin(user)) {
      throw new ForbiddenException(`The test of module #${moduleId} is locked. Complete every lesson of the module first`);
    }
    return context;
  }

  async getLessonProgress(user: AuthUser, lessonId: string): Promise<LessonProgress> {
    const { lesson, record, status } = await this.getLessonContext(user, lessonId);
    return toLessonProgress(lesson, record, status);
  }

  /**
   * Stores one watched segment reported by the player. Only unique seconds count toward
   * `watched_seconds`; a segment longer than the real time since the previous heartbeat
   * (at max playback speed) is cut, so skipping ahead does not count as watching.
   */
  async recordWatch(user: AuthUser, lessonId: string, dto: RecordWatchDto): Promise<LessonProgress> {
    const context = await this.assertLessonOpen(user, lessonId);
    const { lesson, record } = context;
    if (!hasVideo(lesson)) throw new BadRequestException(`Lesson #${lessonId} has no video to track`);
    if (dto.to < dto.from) throw new BadRequestException('"to" must be greater than or equal to "from"');
    if (dto.to - dto.from > MAX_SEGMENT_SECONDS) {
      throw new BadRequestException(`A watch segment cannot be longer than ${MAX_SEGMENT_SECONDS} seconds`);
    }

    const duration = lesson.video_duration ?? 0;
    const now = new Date();
    const from = Math.min(Math.max(Math.floor(dto.from), 0), duration);
    let to = Math.min(Math.ceil(dto.to), duration);
    if (record?.last_watch_at) {
      const elapsed = (now.getTime() - record.last_watch_at.getTime()) / 1000;
      const maxLength = Math.floor(elapsed * MAX_PLAYBACK_RATE + HEARTBEAT_TOLERANCE_SECONDS);
      to = Math.min(to, from + Math.max(maxLength, 0));
    }

    let segments = parseSegments(record?.watched_segments);
    const length = Math.max(to - from, 0);
    if (length > 0) segments = mergeSegment(segments, [from, to]);
    const watchedSeconds = Math.min(sumSegments(segments), duration);
    const position = Math.min(Math.max(Math.round(dto.position ?? to), 0), duration);
    const videoCompletedAt =
      record?.video_completed_at ?? (watchedSeconds >= requiredWatchSeconds(duration) ? now : null);

    const saved = await this.saveRecord(user.id, lessonId, {
      watched_segments: segments as unknown as Prisma.InputJsonValue,
      watched_seconds: watchedSeconds,
      total_watch_seconds: (record?.total_watch_seconds ?? 0) + length,
      last_position: position,
      last_watch_at: now,
      video_completed_at: videoCompletedAt,
    });
    const { record: finished, status, completed } = await this.finishIfDone(lesson, saved);
    if (!record?.video_completed_at && videoCompletedAt) {
      const event: VideoCompletedEvent = { course_id: context.course_id, lesson_id: lessonId };
      this.realtime.toUser(user.id, LEARNING_WS_EVENTS.VIDEO_COMPLETED, event);
    }
    return this.publishLesson(user.id, context, finished, status, completed);
  }

  /** "Lesson finished" button: succeeds only when the video and the test requirements are met. */
  async completeLesson(user: AuthUser, lessonId: string): Promise<LessonProgress> {
    const context = await this.assertLessonOpen(user, lessonId);
    const { lesson, record, status } = context;
    if (status === 'completed' && record) return toLessonProgress(lesson, record, 'completed');
    if (!isLessonRequirementsMet(lesson, record)) {
      throw new BadRequestException(
        hasVideo(lesson) && !record?.video_completed_at ? `Watch the lesson video first` : `Pass the lesson test first`,
      );
    }
    const saved = await this.saveRecord(user.id, lessonId, { completed_at: new Date() });
    return this.publishLesson(user.id, context, saved, 'completed', true);
  }

  /** Called by the tests module after a lesson test attempt is graded. */
  async applyTestResult(
    userId: string,
    context: Pick<LessonContext, 'lesson' | 'course_id' | 'modules'>,
    percent: number,
    passed: boolean,
  ): Promise<LessonProgress> {
    const { lesson } = context;
    const record = await this.prisma.lessonProgress.findUnique({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lesson.id } },
    });
    const saved = await this.saveRecord(userId, lesson.id, {
      best_test_percent: Math.max(record?.best_test_percent ?? 0, percent),
      test_passed_at: record?.test_passed_at ?? (passed ? new Date() : null),
    });
    const { record: finished, status, completed } = await this.finishIfDone(lesson, saved);
    return this.publishLesson(userId, context, finished, status, completed);
  }

  /** Called by the tests module after a module test attempt is graded. Passing it completes the module. */
  async applyModuleTestResult(
    userId: string,
    context: Pick<ModuleTestContext, 'module' | 'test' | 'course_id' | 'modules' | 'record' | 'lessons_completed'>,
    percent: number,
    passed: boolean,
  ): Promise<ModuleTestProgress> {
    const { module, test, course_id: courseId, record } = context;
    const data = {
      best_test_percent: Math.max(record?.best_test_percent ?? 0, percent),
      test_passed_at: record?.test_passed_at ?? (passed ? new Date() : null),
    };
    const saved = await this.prisma.moduleProgress.upsert({
      where: { user_id_module_id: { user_id: userId, module_id: module.id } },
      create: { user_id: userId, module_id: module.id, ...data },
      update: data,
    });
    const progress = toModuleTestProgress(test, saved, saved.test_passed_at ? 'completed' : 'in_progress');

    const result: ModuleTestResultEvent = { course_id: courseId, module_id: module.id, test: progress };
    this.realtime.toUser(userId, LEARNING_WS_EVENTS.MODULE_TEST_RESULT, result);
    if (!record?.test_passed_at && saved.test_passed_at && context.lessons_completed) {
      const event: ModuleCompletedEvent = {
        course_id: courseId,
        module_id: module.id,
        ...nextStep(context.modules, { moduleId: module.id }),
      };
      this.realtime.toUser(userId, LEARNING_WS_EVENTS.MODULE_COMPLETED, event);
    }
    const adminEvent: StudentProgressEvent = {
      course_id: courseId,
      user_id: userId,
      lesson_id: null,
      module_id: module.id,
      progress: null,
      module_test: progress,
    };
    this.realtime.toCourseAdmins(courseId, LEARNING_WS_EVENTS.STUDENT_PROGRESS, adminEvent);
    return progress;
  }

  /** 404 for an unknown or hidden (unpublished, for students) course, or an unknown user. */
  async assertCourseAccess(viewer: AuthUser, courseId: string, userId: string = viewer.id): Promise<void> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { is_published: true } });
    if (!course || (!course.is_published && !isAdmin(viewer))) {
      throw new NotFoundException(`Course #${courseId} not found`);
    }
    if (userId !== viewer.id) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException(`User #${userId} not found`);
    }
  }

  /** Progress of `userId` in a course. Students see only published courses. */
  async getCourseProgress(viewer: AuthUser, courseId: string, userId: string = viewer.id): Promise<CourseProgress> {
    await this.assertCourseAccess(viewer, courseId, userId);
    const modules = await this.getOrderedCourse(courseId);
    const [lessonRecords, moduleRecords] = await this.findUserRecords(userId, courseId);
    const { totals, modules: moduleProgress } = buildCourseProgress(
      modules,
      [...lessonRecords.values()],
      [...moduleRecords.values()],
    );
    return { course_id: courseId, user_id: userId, ...totals, modules: moduleProgress };
  }

  /** Admin: every student who started the course, with their totals. */
  async listCourseStudents(
    courseId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<CourseStudentProgress>> {
    const { page, limit, search, sort_order: sortOrder } = query;
    if (query.sort_by !== undefined && query.sort_by !== 'full_name') {
      throw new BadRequestException(`Cannot sort students by "${query.sort_by}". Allowed: full_name`);
    }
    const modules = await this.getOrderedCourse(courseId);
    const lessonInCourse = { lesson: { module: { course_id: courseId } } };
    const moduleInCourse = { module: { course_id: courseId } };
    const where: Prisma.UserWhereInput = {
      lesson_progress: { some: lessonInCourse },
      ...(search
        ? {
            OR: [
              { full_name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { full_name: sortOrder },
        select: {
          id: true,
          full_name: true,
          phone: true,
          lesson_progress: { where: lessonInCourse },
          module_progress: { where: moduleInCourse },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: users.map(({ lesson_progress: lessonRecords, module_progress: moduleRecords, ...user }) => ({
        user,
        ...buildCourseProgress(modules, lessonRecords, moduleRecords).totals,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async loadSnapshot(userId: string, courseId: string): Promise<CourseSnapshot> {
    const modules = await this.getOrderedCourse(courseId);
    const [lessonRecords, moduleRecords] = await this.findUserRecords(userId, courseId);
    return { modules, lessonRecords, moduleRecords, state: computeCourseState(modules, lessonRecords, moduleRecords) };
  }

  private async findUserRecords(
    userId: string,
    courseId: string,
  ): Promise<[Map<string, LessonProgressRecord>, Map<string, ModuleProgressRecord>]> {
    const [lessonRecords, moduleRecords] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { user_id: userId, lesson: { module: { course_id: courseId } } } }),
      this.prisma.moduleProgress.findMany({ where: { user_id: userId, module: { course_id: courseId } } }),
    ]);
    return [
      new Map(lessonRecords.map((record) => [record.lesson_id, record])),
      new Map(moduleRecords.map((record) => [record.module_id, record])),
    ];
  }

  private saveRecord(userId: string, lessonId: string, data: ProgressData): Promise<LessonProgressRecord> {
    return this.prisma.lessonProgress.upsert({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
      create: { user_id: userId, lesson_id: lessonId, ...data },
      update: data,
    });
  }

  /** Marks the lesson completed as soon as all its requirements are met. */
  private async finishIfDone(
    lesson: OrderedLesson,
    record: LessonProgressRecord,
  ): Promise<{ record: LessonProgressRecord; status: LessonStatus; completed: boolean }> {
    if (record.completed_at) return { record, status: 'completed', completed: false };
    if (!isLessonRequirementsMet(lesson, record)) return { record, status: 'in_progress', completed: false };
    const saved = await this.prisma.lessonProgress.update({
      where: { id: record.id },
      data: { completed_at: new Date() },
    });
    return { record: saved, status: 'completed', completed: true };
  }

  /**
   * Pushes a lesson change in real time: the lesson state to every device of the user, a
   * completion event with the step that opened next, and a copy for admins watching the course.
   */
  private publishLesson(
    userId: string,
    context: Pick<LessonContext, 'lesson' | 'course_id' | 'modules'>,
    record: LessonProgressRecord,
    status: LessonStatus,
    justCompleted: boolean,
  ): LessonProgress {
    const { lesson, course_id: courseId } = context;
    const progress = toLessonProgress(lesson, record, status);
    this.realtime.toUser(userId, LEARNING_WS_EVENTS.LESSON_PROGRESS, progress);
    if (justCompleted) {
      const event: LessonCompletedEvent = {
        course_id: courseId,
        lesson_id: lesson.id,
        ...nextStep(context.modules, { lessonId: lesson.id }),
      };
      this.realtime.toUser(userId, LEARNING_WS_EVENTS.LESSON_COMPLETED, event);
    }
    const adminEvent: StudentProgressEvent = {
      course_id: courseId,
      user_id: userId,
      lesson_id: lesson.id,
      module_id: null,
      progress,
      module_test: null,
    };
    this.realtime.toCourseAdmins(courseId, LEARNING_WS_EVENTS.STUDENT_PROGRESS, adminEvent);
    return progress;
  }
}
