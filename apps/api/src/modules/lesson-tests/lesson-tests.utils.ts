import { BadRequestException } from '@nestjs/common';
import type {
  LessonTestAdmin,
  LessonTestPublic,
  TestAnswerResult,
  TestAttemptSummary,
  TestKind,
  TestSummary,
} from '@nestjs-template/types';
import type {
  LessonTest as LessonTestRecord,
  TestAttempt as TestAttemptRecord,
  TestOption as TestOptionRecord,
  TestQuestion as TestQuestionRecord,
} from '../../generated/prisma/client';
import { percentOf } from '../progress/progress.utils';
import type { CreateOptionDto } from './dto/create-question.dto';
import type { AttemptAnswerDto } from './dto/submit-attempt.dto';

export type QuestionWithOptions = TestQuestionRecord & { options: TestOptionRecord[] };
export type TestWithQuestions = LessonTestRecord & { questions: QuestionWithOptions[] };

const byPosition = <T extends { position: number }>(a: T, b: T): number => a.position - b.position;

/** Points a new test is worth when the admin does not set `total_points`. */
export const DEFAULT_TEST_TOTAL_POINTS = 100;

export interface QuestionPointsInput {
  id: string;
  /** null = automatic share. */
  points: number | null;
  position: number;
}

/**
 * Default points rule. Questions with explicit `points` keep them; the rest of the test total is
 * split evenly between questions without points (in position order, the first ones get the
 * remainder, so the shares always add up to the total). Example: total 100, one question fixed at
 * 40, three automatic -> 20 + 20 + 20.
 *
 * Rejects (400) explicit points above the total and automatic questions that would get 0 points.
 * When every question has explicit points, the test's max score is their sum.
 */
export function resolveQuestionPoints(total: number, questions: QuestionPointsInput[]): Map<string, number> {
  const ordered = [...questions].sort(byPosition);
  const explicitSum = ordered.reduce((sum, question) => sum + (question.points ?? 0), 0);
  if (explicitSum > total) {
    throw new BadRequestException(`Question points add up to ${explicitSum}, more than the test total of ${total}`);
  }
  const auto = ordered.filter((question) => question.points === null);
  const left = total - explicitSum;
  if (auto.length > left) {
    throw new BadRequestException(
      `${auto.length} question(s) without points need at least 1 point each, but only ${left} of ${total} is left`,
    );
  }
  const share = auto.length > 0 ? Math.floor(left / auto.length) : 0;
  let remainder = auto.length > 0 ? left % auto.length : 0;
  const result = new Map<string, number>();
  for (const question of ordered) {
    if (question.points !== null) {
      result.set(question.id, question.points);
      continue;
    }
    result.set(question.id, share + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;
  }
  return result;
}

const sumPoints = (points: Map<string, number>): number => [...points.values()].reduce((a, b) => a + b, 0);

/** Questions must have at least one correct option. */
export function assertValidOptions(options: CreateOptionDto[]): void {
  if (!options.some((option) => option.is_correct)) {
    throw new BadRequestException('Every question needs at least one correct option');
  }
}

export const testKind = (test: Pick<LessonTestRecord, 'module_id'>): TestKind => (test.module_id ? 'MODULE' : 'LESSON');

/** Short info shown on a lesson page or in a course outline. */
export function toTestSummary(test: LessonTestRecord & { _count: { questions: number } }): TestSummary {
  return {
    id: test.id,
    kind: testKind(test),
    title: test.title,
    total_points: test.total_points,
    pass_score: test.pass_score,
    max_attempts: test.max_attempts,
    question_count: test._count.questions,
  };
}

/** Student view: correct answers are never included. */
export function toPublicTest(test: TestWithQuestions): LessonTestPublic {
  const points = resolveQuestionPoints(test.total_points, test.questions);
  return {
    id: test.id,
    kind: testKind(test),
    lesson_id: test.lesson_id,
    module_id: test.module_id,
    title: test.title,
    total_points: test.total_points,
    max_score: sumPoints(points),
    pass_score: test.pass_score,
    max_attempts: test.max_attempts,
    questions: [...test.questions].sort(byPosition).map((question) => ({
      id: question.id,
      text: question.text,
      points: points.get(question.id) ?? 0,
      position: question.position,
      multiple: question.options.filter((option) => option.is_correct).length > 1,
      options: [...question.options]
        .sort(byPosition)
        .map((option) => ({ id: option.id, text: option.text, position: option.position })),
    })),
  };
}

export function toAdminTest(test: TestWithQuestions): LessonTestAdmin {
  const publicTest = toPublicTest(test);
  return {
    ...publicTest,
    questions: publicTest.questions.map((question) => {
      const source = test.questions.find((item) => item.id === question.id);
      return {
        ...question,
        points_auto: source?.points == null,
        options: question.options.map((option) => ({
          ...option,
          is_correct: source?.options.find((item) => item.id === option.id)?.is_correct ?? false,
        })),
      };
    }),
    created_at: test.created_at.toISOString(),
    updated_at: test.updated_at.toISOString(),
  };
}

export interface GradedAttempt {
  score: number;
  max_score: number;
  percent: number;
  passed: boolean;
  answers: (TestAnswerResult & { selected_option_ids: string[] })[];
}

/**
 * Grades answers on the server. A question is correct only when the selected set equals the set
 * of correct options exactly; it earns its points from `resolveQuestionPoints`. Unknown
 * questions/options and duplicate answers are rejected.
 */
export function gradeAttempt(
  questions: QuestionWithOptions[],
  answers: AttemptAnswerDto[],
  passScore: number,
  totalPoints: number,
): GradedAttempt {
  const questionPoints = resolveQuestionPoints(totalPoints, questions);
  const byQuestion = new Map<string, string[]>();
  for (const answer of answers) {
    const question = questions.find((item) => item.id === answer.question_id);
    if (!question) throw new BadRequestException(`Question #${answer.question_id} is not part of this test`);
    if (byQuestion.has(answer.question_id)) {
      throw new BadRequestException(`Question #${answer.question_id} is answered more than once`);
    }
    const unknown = answer.option_ids.find((id) => !question.options.some((option) => option.id === id));
    if (unknown) throw new BadRequestException(`Option #${unknown} does not belong to question #${question.id}`);
    byQuestion.set(answer.question_id, [...new Set(answer.option_ids)]);
  }

  let score = 0;
  let maxScore = 0;
  const graded = [...questions].sort(byPosition).map((question) => {
    const selected = byQuestion.get(question.id) ?? [];
    const correct = question.options.filter((option) => option.is_correct).map((option) => option.id);
    const isCorrect = selected.length === correct.length && correct.every((id) => selected.includes(id));
    const worth = questionPoints.get(question.id) ?? 0;
    const points = isCorrect ? worth : 0;
    score += points;
    maxScore += worth;
    return { question_id: question.id, is_correct: isCorrect, points, selected_option_ids: selected };
  });

  const percent = percentOf(score, maxScore);
  return { score, max_score: maxScore, percent, passed: percent >= passScore, answers: graded };
}

export function toAttemptSummary(record: TestAttemptRecord): TestAttemptSummary {
  return {
    id: record.id,
    score: record.score,
    max_score: record.max_score,
    percent: record.percent,
    passed: record.passed,
    created_at: record.created_at.toISOString(),
  };
}
