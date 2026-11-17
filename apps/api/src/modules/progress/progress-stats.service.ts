import { Injectable } from '@nestjs/common';
import type { CourseTestStats } from '@nestjs-template/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { buildCourseTestStats, type StatsModule, type StatsTest } from './progress-stats.utils';
import { ProgressService } from './progress.service';
import { moduleOrder } from './progress.utils';

const testSelect = {
  select: { id: true, title: true, total_points: true, pass_score: true, _count: { select: { questions: true } } },
};

interface TestRow {
  id: string;
  title: string | null;
  total_points: number;
  pass_score: number;
  _count: { questions: number };
}

function toStatsTest(row: TestRow, moduleId: string, lesson: { id: string; title: string } | null): StatsTest {
  return {
    id: row.id,
    kind: lesson ? 'LESSON' : 'MODULE',
    title: row.title,
    module_id: moduleId,
    lesson_id: lesson?.id ?? null,
    lesson_title: lesson?.title ?? null,
    total_points: row.total_points,
    pass_score: row.pass_score,
    question_count: row._count.questions,
  };
}

/** Test statistics of a user in a course, built from every graded attempt. */
@Injectable()
export class ProgressStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressService: ProgressService,
  ) {}

  async getCourseTestStats(viewer: AuthUser, courseId: string, userId: string = viewer.id): Promise<CourseTestStats> {
    await this.progressService.assertCourseAccess(viewer, courseId, userId);
    const rows = await this.prisma.courseModule.findMany({
      where: { course_id: courseId },
      orderBy: moduleOrder,
      select: {
        id: true,
        title: true,
        position: true,
        test: testSelect,
        lessons: { orderBy: moduleOrder, select: { id: true, title: true, test: testSelect } },
      },
    });
    const modules: StatsModule[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      position: row.position,
      tests: [
        ...row.lessons.flatMap((lesson) => (lesson.test ? [toStatsTest(lesson.test, row.id, lesson)] : [])),
        ...(row.test ? [toStatsTest(row.test, row.id, null)] : []),
      ],
    }));
    const testIds = modules.flatMap((module) => module.tests.map((test) => test.id));
    const attempts =
      testIds.length === 0
        ? []
        : await this.prisma.testAttempt.findMany({
            where: { user_id: userId, test_id: { in: testIds } },
            orderBy: { created_at: 'asc' },
            select: { test_id: true, percent: true, passed: true, created_at: true, answers: { select: { is_correct: true } } },
          });
    return buildCourseTestStats(courseId, userId, modules, attempts);
  }
}
