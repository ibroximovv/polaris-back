import { buildCourseTestStats, buildTestStats, type StatsAttempt, type StatsModule, type StatsTest } from './progress-stats.utils';

const lessonTest: StatsTest = {
  id: 't1',
  kind: 'LESSON',
  title: 'Lesson 1 test',
  module_id: 'm1',
  lesson_id: 'l1',
  lesson_title: 'Lesson 1',
  total_points: 20,
  pass_score: 70,
  question_count: 2,
};
const moduleTest: StatsTest = { ...lessonTest, id: 'mt1', kind: 'MODULE', title: 'Final', lesson_id: null, lesson_title: null, total_points: 80 };

const at = (day: number) => new Date(`2026-01-0${day}T00:00:00.000Z`);
const attempt = (test_id: string, percent: number, passed: boolean, day: number, correct: boolean[]): StatsAttempt => ({
  test_id,
  percent,
  passed,
  created_at: at(day),
  answers: correct.map((is_correct) => ({ is_correct })),
});

describe('progress stats utils', () => {
  describe('buildTestStats', () => {
    it('summarizes attempts in time order', () => {
      const stats = buildTestStats(lessonTest, [
        attempt('t1', 100, true, 3, [true, true]),
        attempt('t1', 50, false, 1, [true, false]),
        attempt('other', 0, false, 2, [false]),
      ]);
      expect(stats).toEqual({
        test_id: 't1',
        kind: 'LESSON',
        title: 'Lesson 1 test',
        module_id: 'm1',
        lesson_id: 'l1',
        lesson_title: 'Lesson 1',
        total_points: 20,
        pass_score: 70,
        question_count: 2,
        attempts: 2,
        best_percent: 100,
        last_percent: 100,
        average_percent: 75,
        first_attempt_passed: false,
        passed: true,
        passed_at: at(3).toISOString(),
        earned_points: 20,
        accuracy_percent: 75,
        last_attempt_at: at(3).toISOString(),
      });
    });

    it('reports an untouched test', () => {
      expect(buildTestStats(lessonTest, [])).toMatchObject({
        attempts: 0,
        best_percent: null,
        average_percent: null,
        first_attempt_passed: null,
        passed: false,
        earned_points: 0,
        accuracy_percent: null,
      });
    });
  });

  it('buildCourseTestStats sums modules and the course', () => {
    const modules: StatsModule[] = [
      { id: 'm1', title: 'Module 1', position: 0, tests: [lessonTest, moduleTest] },
      { id: 'm2', title: 'Module 2', position: 1, tests: [] },
    ];
    const stats = buildCourseTestStats('c1', 'u1', modules, [
      attempt('t1', 100, true, 1, [true, true]),
      attempt('mt1', 50, false, 2, [true, false]),
      attempt('mt1', 75, true, 3, [true, true, true, false]),
    ]);
    expect(stats).toMatchObject({
      course_id: 'c1',
      user_id: 'u1',
      tests_total: 2,
      tests_attempted: 2,
      tests_passed: 2,
      total_attempts: 3,
      average_best_percent: 88,
      first_try_pass_rate: 50,
      total_points: 100,
      earned_points: 80,
      score_percent: 80,
      correct_answers: 6,
      answered_questions: 8,
      accuracy_percent: 75,
    });
    expect(stats.modules[0]).toMatchObject({ total_points: 100, earned_points: 80, average_best_percent: 88 });
    expect(stats.modules[1]).toMatchObject({ total_points: 0, earned_points: 0, average_best_percent: null, tests: [] });
  });

  it('handles a course without attempts', () => {
    expect(
      buildCourseTestStats('c1', 'u1', [{ id: 'm1', title: 'M', position: 0, tests: [lessonTest] }], []),
    ).toMatchObject({ tests_attempted: 0, average_best_percent: null, first_try_pass_rate: null, score_percent: 0 });
  });
});
