import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  LessonTestAdmin,
  LessonTestPublic,
  TestAttemptHistory,
  TestAttemptResult,
} from '@nestjs-template/types';
import { BaseService } from '../../common/base/base.service';
import type { CrudRepository } from '../../common/base/crud-repository.interface';
import type { LessonTest as LessonTestRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from '../progress/progress.service';
import { hasVideo } from '../progress/progress.utils';
import type { CreateLessonTestDto, UpdateLessonTestDto } from './dto/create-lesson-test.dto';
import type { CreateOptionDto, CreateQuestionDto, UpdateQuestionDto } from './dto/create-question.dto';
import type { SubmitAttemptDto } from './dto/submit-attempt.dto';
import {
  assertValidOptions,
  gradeAttempt,
  type TestWithQuestions,
  toAdminTest,
  toAttemptSummary,
  toPublicTest,
} from './lesson-tests.utils';

const withQuestions = { questions: { include: { options: true } } } as const;

function optionsData(options: CreateOptionDto[]) {
  return options.map((option, index) => ({
    text: option.text,
    is_correct: option.is_correct,
    position: option.position ?? index,
  }));
}

function questionData(question: CreateQuestionDto, index: number) {
  assertValidOptions(question.options);
  return {
    text: question.text,
    points: question.points ?? 1,
    position: question.position ?? index,
    options: { create: optionsData(question.options) },
  };
}

function createTestRepository(
  prisma: PrismaService,
): CrudRepository<LessonTestRecord, CreateLessonTestDto, UpdateLessonTestDto, string> {
  return {
    findMany: ({ skip, take, sortBy, sortOrder }) =>
      prisma.lessonTest.findMany({ skip, take, orderBy: { [sortBy ?? 'created_at']: sortOrder } }),
    count: () => prisma.lessonTest.count(),
    findById: (id) => prisma.lessonTest.findUnique({ where: { id } }),
    create: ({ questions = [], ...data }) =>
      prisma.lessonTest.create({ data: { ...data, questions: { create: questions.map(questionData) } } }),
    update: (id, data) => prisma.lessonTest.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.lessonTest.delete({ where: { id } });
    },
  };
}

/**
 * Lesson tests: admin editing, the student view (without correct answers) and graded attempts.
 * A student may take the test only after the lesson video is watched; passing it completes the lesson.
 */
@Injectable()
export class LessonTestsService extends BaseService<
  LessonTestRecord,
  CreateLessonTestDto,
  UpdateLessonTestDto,
  LessonTestRecord,
  string
> {
  protected readonly entityName = 'Test';

  constructor(
    private readonly prisma: PrismaService,
    private readonly progressService: ProgressService,
  ) {
    super(createTestRepository(prisma));
  }

  async createTest(dto: CreateLessonTestDto): Promise<LessonTestAdmin> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: dto.lesson_id }, select: { id: true } });
    if (!lesson) throw new NotFoundException(`Lesson #${dto.lesson_id} not found`);
    const created = await this.create(dto); // P2002 (lesson already has a test) -> 409
    return this.getAdminTest(created.id);
  }

  async updateTest(id: string, dto: UpdateLessonTestDto): Promise<LessonTestAdmin> {
    await this.update(id, dto);
    return this.getAdminTest(id);
  }

  async getAdminTest(id: string): Promise<LessonTestAdmin> {
    return toAdminTest(await this.findTestOrFail(id));
  }

  /** Student view. The lesson must be open; correct answers are stripped. */
  async getPublicTest(user: AuthUser, id: string): Promise<LessonTestPublic> {
    const test = await this.findTestOrFail(id);
    await this.progressService.assertLessonOpen(user, test.lesson_id);
    return toPublicTest(test);
  }

  async addQuestion(testId: string, dto: CreateQuestionDto): Promise<LessonTestAdmin> {
    const test = await this.findTestOrFail(testId);
    await this.prisma.testQuestion.create({
      data: { test_id: testId, ...questionData(dto, test.questions.length) },
    });
    return this.getAdminTest(testId);
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto): Promise<LessonTestAdmin> {
    const question = await this.findQuestionOrFail(questionId);
    const { options, ...fields } = dto;
    if (options) assertValidOptions(options);
    await this.prisma.$transaction(async (tx) => {
      await tx.testQuestion.update({ where: { id: questionId }, data: fields });
      if (options) {
        await tx.testOption.deleteMany({ where: { question_id: questionId } });
        await tx.testOption.createMany({
          data: optionsData(options).map((option) => ({ ...option, question_id: questionId })),
        });
      }
    });
    return this.getAdminTest(question.test_id);
  }

  async removeQuestion(questionId: string): Promise<void> {
    await this.findQuestionOrFail(questionId);
    await this.prisma.testQuestion.delete({ where: { id: questionId } });
  }

  async submitAttempt(user: AuthUser, testId: string, dto: SubmitAttemptDto): Promise<TestAttemptResult> {
    const test = await this.findTestOrFail(testId);
    const { lesson, record } = await this.progressService.assertLessonOpen(user, test.lesson_id);
    if (hasVideo(lesson) && !record?.video_completed_at && user.role !== 'ADMIN') {
      throw new BadRequestException('Watch the lesson video before taking the test');
    }
    if (test.questions.length === 0) throw new BadRequestException(`Test #${testId} has no questions yet`);

    if (test.max_attempts !== null) {
      const used = await this.prisma.testAttempt.count({ where: { test_id: testId, user_id: user.id } });
      if (used >= test.max_attempts) {
        throw new ForbiddenException(`No attempts left for test #${testId} (limit ${test.max_attempts})`);
      }
    }

    const graded = gradeAttempt(test.questions, dto.answers, test.pass_score);
    const attempt = await this.prisma.testAttempt.create({
      data: {
        test_id: testId,
        user_id: user.id,
        score: graded.score,
        max_score: graded.max_score,
        percent: graded.percent,
        passed: graded.passed,
        answers: {
          create: graded.answers.map((answer) => ({
            question_id: answer.question_id,
            selected_option_ids: answer.selected_option_ids,
            is_correct: answer.is_correct,
            points: answer.points,
          })),
        },
      },
    });
    await this.progressService.applyTestResult(user.id, lesson, graded.percent, graded.passed);

    return {
      ...toAttemptSummary(attempt),
      test_id: testId,
      user_id: user.id,
      answers: graded.answers.map(({ question_id, is_correct, points }) => ({ question_id, is_correct, points })),
    };
  }

  /** Attempt history of one user (the student themself, or any student for an admin). */
  async getAttemptHistory(testId: string, userId: string): Promise<TestAttemptHistory> {
    const test = await this.findEntityOrFail(testId);
    const attempts = await this.prisma.testAttempt.findMany({
      where: { test_id: testId, user_id: userId },
      orderBy: { created_at: 'desc' },
    });
    const best = attempts.reduce<number | null>((max, item) => (max === null || item.percent > max ? item.percent : max), null);
    return {
      test_id: testId,
      pass_score: test.pass_score,
      max_attempts: test.max_attempts,
      attempts_used: attempts.length,
      attempts_left: test.max_attempts === null ? null : Math.max(test.max_attempts - attempts.length, 0),
      best_percent: best,
      passed: attempts.some((item) => item.passed),
      attempts: attempts.map(toAttemptSummary),
    };
  }

  private async findTestOrFail(id: string): Promise<TestWithQuestions> {
    const test = await this.prisma.lessonTest.findUnique({ where: { id }, include: withQuestions });
    if (!test) throw this.notFound(id);
    return test;
  }

  private async findQuestionOrFail(id: string) {
    const question = await this.prisma.testQuestion.findUnique({ where: { id } });
    if (!question) throw new NotFoundException(`Question #${id} not found`);
    return question;
  }
}
