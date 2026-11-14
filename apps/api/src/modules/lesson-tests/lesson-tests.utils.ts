import { BadRequestException } from '@nestjs/common';
import type {
  LessonTestAdmin,
  LessonTestPublic,
  TestAnswerResult,
  TestAttemptSummary,
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

/** Questions must have at least one correct option. */
export function assertValidOptions(options: CreateOptionDto[]): void {
  if (!options.some((option) => option.is_correct)) {
    throw new BadRequestException('Every question needs at least one correct option');
  }
}

/** Student view: correct answers are never included. */
export function toPublicTest(test: TestWithQuestions): LessonTestPublic {
  return {
    id: test.id,
    lesson_id: test.lesson_id,
    title: test.title,
    pass_score: test.pass_score,
    max_attempts: test.max_attempts,
    questions: [...test.questions].sort(byPosition).map((question) => ({
      id: question.id,
      text: question.text,
      points: question.points,
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
 * of correct options exactly. Unknown questions/options and duplicate answers are rejected.
 */
export function gradeAttempt(
  questions: QuestionWithOptions[],
  answers: AttemptAnswerDto[],
  passScore: number,
): GradedAttempt {
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
    const points = isCorrect ? question.points : 0;
    score += points;
    maxScore += question.points;
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
