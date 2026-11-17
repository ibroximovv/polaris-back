import type { CourseTestStats, ModuleTestStats, TestKind, TestStats } from '@nestjs-template/types';
import { percentOf, pointsFromPercent } from './progress.utils';

/** A test of the course with where it sits. */
export interface StatsTest {
  id: string;
  kind: TestKind;
  title: string | null;
  module_id: string;
  lesson_id: string | null;
  lesson_title: string | null;
  total_points: number;
  pass_score: number;
  question_count: number;
}

export interface StatsModule {
  id: string;
  title: string;
  position: number;
  /** Lesson tests in lesson order, then the module's final test. */
  tests: StatsTest[];
}

/** One graded attempt; `answers` holds one entry per question of the test at that time. */
export interface StatsAttempt {
  test_id: string;
  percent: number;
  passed: boolean;
  created_at: Date;
  answers: { is_correct: boolean }[];
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** Results of one test from the user's attempts (any order). */
export function buildTestStats(test: StatsTest, attemptList: StatsAttempt[]): TestStats {
  const attempts = attemptList
    .filter((attempt) => attempt.test_id === test.id)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const first = attempts[0];
  const last = attempts[attempts.length - 1];
  const firstPassed = attempts.find((attempt) => attempt.passed);
  const best = attempts.length > 0 ? Math.max(...attempts.map((attempt) => attempt.percent)) : null;
  const answers = attempts.flatMap((attempt) => attempt.answers);
  return {
    test_id: test.id,
    kind: test.kind,
    title: test.title,
    module_id: test.module_id,
    lesson_id: test.lesson_id,
    lesson_title: test.lesson_title,
    total_points: test.total_points,
    pass_score: test.pass_score,
    question_count: test.question_count,
    attempts: attempts.length,
    best_percent: best,
    last_percent: last?.percent ?? null,
    average_percent: average(attempts.map((attempt) => attempt.percent)),
    first_attempt_passed: first ? first.passed : null,
    passed: firstPassed !== undefined,
    passed_at: firstPassed?.created_at.toISOString() ?? null,
    earned_points: pointsFromPercent(best, test.total_points),
    accuracy_percent:
      answers.length > 0 ? percentOf(answers.filter((answer) => answer.is_correct).length, answers.length) : null,
    last_attempt_at: last?.created_at.toISOString() ?? null,
  };
}

/** One user's test statistics in a course, per module and in total. */
export function buildCourseTestStats(
  courseId: string,
  userId: string,
  modules: StatsModule[],
  attempts: StatsAttempt[],
): CourseTestStats {
  const moduleStats: ModuleTestStats[] = modules.map((module) => {
    const tests = module.tests.map((test) => buildTestStats(test, attempts));
    return {
      module_id: module.id,
      title: module.title,
      position: module.position,
      total_points: sum(tests.map((test) => test.total_points)),
      earned_points: sum(tests.map((test) => test.earned_points)),
      average_best_percent: average(tests.flatMap((test) => (test.best_percent === null ? [] : [test.best_percent]))),
      tests,
    };
  });

  const tests = moduleStats.flatMap((module) => module.tests);
  const attempted = tests.filter((test) => test.attempts > 0);
  const passed = tests.filter((test) => test.passed);
  const answers = attempts
    .filter((attempt) => tests.some((test) => test.test_id === attempt.test_id))
    .flatMap((attempt) => attempt.answers);
  const correct = answers.filter((answer) => answer.is_correct).length;
  const totalPoints = sum(tests.map((test) => test.total_points));
  const earnedPoints = sum(tests.map((test) => test.earned_points));

  return {
    course_id: courseId,
    user_id: userId,
    tests_total: tests.length,
    tests_attempted: attempted.length,
    tests_passed: passed.length,
    total_attempts: sum(tests.map((test) => test.attempts)),
    average_best_percent: average(attempted.map((test) => test.best_percent ?? 0)),
    first_try_pass_rate:
      passed.length > 0 ? percentOf(passed.filter((test) => test.first_attempt_passed).length, passed.length) : null,
    total_points: totalPoints,
    earned_points: earnedPoints,
    score_percent: percentOf(earnedPoints, totalPoints),
    correct_answers: correct,
    answered_questions: answers.length,
    accuracy_percent: answers.length > 0 ? percentOf(correct, answers.length) : null,
    modules: moduleStats,
  };
}
