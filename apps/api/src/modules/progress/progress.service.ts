import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseProgress,
  CourseStudentProgress,
  LessonProgress,
  LessonStatus,
  PaginatedResponse,
} from '@nestjs-template/types';
import { buildPaginationMeta } from '../../common/base/base.service';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { LessonProgress as LessonProgressRecord, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { RecordWatchDto } from './dto/record-watch.dto';
import {
  buildCourseProgress,
  computeStatuses,
  HEARTBEAT_TOLERANCE_SECONDS,
  hasVideo,
  isLessonRequirementsMet,
  MAX_PLAYBACK_RATE,
  MAX_SEGMENT_SECONDS,
  mergeSegment,
  type OrderedLesson,
  type OrderedModule,
  parseSegments,
  requiredWatchSeconds,
  sumSegments,
  toLessonProgress,
} from './progress.utils';

export interface LessonContext {
  lesson: OrderedLesson;
  course_id: string;
  record: LessonProgressRecord | null;
  status: LessonStatus;
}

type ProgressData = Omit<
  Prisma.LessonProgressUncheckedCreateInput,
  'id' | 'user_id' | 'lesson_id' | 'created_at' | 'updated_at'
>;

const isAdmin = (user: AuthUser): boolean => user.role === 'ADMIN';

/**
 * Learning progress rules, shared by the lessons and tests modules:
 * - exact video watch tracking (unique watched seconds from merged segments),
 * - strict lesson order (a lesson opens only after every previous lesson is completed),
 * - lesson completion = video watched (if any) + test passed (if any).
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** Course outline in learning order: modules by position, lessons by position. */
  async getOrderedCourse(courseId: string): Promise<OrderedModule[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        modules: {
          orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true,
            title: true,
            position: true,
            lessons: {
              orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
              select: { id: true, title: true, position: true, video_duration: true, test: { select: { id: true } } },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException(`Course #${courseId} not found`);
    return course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      position: module.position,
      lessons: module.lessons.map(({ test, ...lesson }) => ({ ...lesson, has_test: test !== null })),
    }));
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
    const lessons = (await this.getOrderedCourse(courseId)).flatMap((module) => module.lessons);
    const records = await this.findUserRecords(user.id, courseId);
    const statuses = computeStatuses(lessons, records);
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) throw new NotFoundException(`Lesson #${lessonId} not found`);
    return {
      lesson,
      course_id: courseId,
      record: records.get(lessonId) ?? null,
      status: statuses.get(lessonId) ?? 'locked',
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
    const { lesson, record } = await this.assertLessonOpen(user, lessonId);
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

    const data = {
      watched_segments: segments as unknown as Prisma.InputJsonValue,
      watched_seconds: watchedSeconds,
      total_watch_seconds: (record?.total_watch_seconds ?? 0) + length,
      last_position: position,
      last_watch_at: now,
      video_completed_at:
        record?.video_completed_at ?? (watchedSeconds >= requiredWatchSeconds(duration) ? now : null),
    };
    const saved = await this.saveRecord(user.id, lessonId, data);
    return this.finishIfDone(lesson, saved);
  }

  /** "Lesson finished" button: succeeds only when the video and the test requirements are met. */
  async completeLesson(user: AuthUser, lessonId: string): Promise<LessonProgress> {
    const { lesson, record, status } = await this.assertLessonOpen(user, lessonId);
    if (status === 'completed' && record) return toLessonProgress(lesson, record, 'completed');
    if (!isLessonRequirementsMet(lesson, record)) {
      throw new BadRequestException(
        hasVideo(lesson) && !record?.video_completed_at
          ? `Watch the lesson video first`
          : `Pass the lesson test first`,
      );
    }
    const saved = await this.saveRecord(user.id, lessonId, { completed_at: new Date() });
    return toLessonProgress(lesson, saved, 'completed');
  }

  /** Called by the tests module after an attempt is graded. */
  async applyTestResult(
    userId: string,
    lesson: OrderedLesson,
    percent: number,
    passed: boolean,
  ): Promise<LessonProgress> {
    const record = await this.prisma.lessonProgress.findUnique({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lesson.id } },
    });
    const saved = await this.saveRecord(userId, lesson.id, {
      best_test_percent: Math.max(record?.best_test_percent ?? 0, percent),
      test_passed_at: record?.test_passed_at ?? (passed ? new Date() : null),
    });
    return this.finishIfDone(lesson, saved);
  }

  /** Progress of `userId` in a course. Students see only published courses. */
  async getCourseProgress(viewer: AuthUser, courseId: string, userId: string = viewer.id): Promise<CourseProgress> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { is_published: true } });
    if (!course || (!course.is_published && !isAdmin(viewer))) {
      throw new NotFoundException(`Course #${courseId} not found`);
    }
    if (userId !== viewer.id) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException(`User #${userId} not found`);
    }
    const modules = await this.getOrderedCourse(courseId);
    const records = [...(await this.findUserRecords(userId, courseId)).values()];
    const { totals, modules: moduleProgress } = buildCourseProgress(modules, records);
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
    const inCourse = { lesson: { module: { course_id: courseId } } };
    const where: Prisma.UserWhereInput = {
      lesson_progress: { some: inCourse },
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
        select: { id: true, full_name: true, phone: true, lesson_progress: { where: inCourse } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: users.map(({ lesson_progress: records, ...user }) => {
        return { user, ...buildCourseProgress(modules, records).totals };
      }),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  private async findUserRecords(userId: string, courseId: string): Promise<Map<string, LessonProgressRecord>> {
    const records = await this.prisma.lessonProgress.findMany({
      where: { user_id: userId, lesson: { module: { course_id: courseId } } },
    });
    return new Map(records.map((record) => [record.lesson_id, record]));
  }

  private saveRecord(userId: string, lessonId: string, data: ProgressData): Promise<LessonProgressRecord> {
    return this.prisma.lessonProgress.upsert({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
      create: { user_id: userId, lesson_id: lessonId, ...data },
      update: data,
    });
  }

  /** Marks the lesson completed as soon as all its requirements are met. */
  private async finishIfDone(lesson: OrderedLesson, record: LessonProgressRecord): Promise<LessonProgress> {
    if (record.completed_at) return toLessonProgress(lesson, record, 'completed');
    if (!isLessonRequirementsMet(lesson, record)) return toLessonProgress(lesson, record, 'in_progress');
    const saved = await this.prisma.lessonProgress.update({
      where: { id: record.id },
      data: { completed_at: new Date() },
    });
    return toLessonProgress(lesson, saved, 'completed');
  }
}
