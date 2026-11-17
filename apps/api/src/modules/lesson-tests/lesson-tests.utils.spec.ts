import { BadRequestException } from '@nestjs/common';
import { makeQuestion, makeTest } from './lesson-tests.test-helpers';
import {
  assertValidOptions,
  gradeAttempt,
  resolveQuestionPoints,
  toAdminTest,
  toPublicTest,
  toTestSummary,
} from './lesson-tests.utils';

describe('lesson-tests utils', () => {
  const test = makeTest();

  it('toPublicTest sorts questions and never leaks is_correct', () => {
    const view = toPublicTest(test);
    expect(view.questions.map((question) => [question.id, question.multiple])).toEqual([
      ['q1', false],
      ['q2', true],
    ]);
    expect(JSON.stringify(view)).not.toContain('is_correct');
  });

  it('toPublicTest shows the kind, the total and the effective max score', () => {
    expect(toPublicTest(test)).toMatchObject({ kind: 'LESSON', lesson_id: 'l1', module_id: null, total_points: 4, max_score: 4 });
    expect(toPublicTest(makeTest({ lesson_id: null, module_id: 'm1' }))).toMatchObject({ kind: 'MODULE', module_id: 'm1' });
  });

  it('toTestSummary counts questions', () => {
    expect(toTestSummary({ ...makeTest(), _count: { questions: 2 } })).toEqual({
      id: 't1',
      kind: 'LESSON',
      title: 'Lesson 1 test',
      total_points: 4,
      pass_score: 70,
      max_attempts: null,
      question_count: 2,
    });
  });

  it('toAdminTest includes the correct answers and which points are automatic', () => {
    const view = toAdminTest(
      makeTest({
        total_points: 10,
        questions: [makeQuestion('q1', ['a'], ['a', 'b'], null, 0), makeQuestion('q2', ['c'], ['c', 'd'], 4, 1)],
      }),
    );
    expect(view.questions.map((question) => [question.points, question.points_auto])).toEqual([
      [6, true],
      [4, false],
    ]);
    expect(toAdminTest(test).questions[1].options.map((option) => option.is_correct)).toEqual([true, true, false]);
  });

  describe('resolveQuestionPoints (default rule)', () => {
    const q = (id: string, points: number | null, position: number) => ({ id, points, position });

    it('splits the total evenly when no question has points; the remainder goes to the first ones', () => {
      expect([...resolveQuestionPoints(100, [q('c', null, 2), q('a', null, 0), q('b', null, 1)])]).toEqual([
        ['a', 34],
        ['b', 33],
        ['c', 33],
      ]);
    });

    it('keeps explicit points and shares the rest between the others', () => {
      const points = resolveQuestionPoints(100, [q('a', 40, 0), q('b', null, 1), q('c', null, 2), q('d', null, 3)]);
      expect([...points.values()]).toEqual([40, 20, 20, 20]);
    });

    it('uses explicit points as they are when every question has them', () => {
      expect([...resolveQuestionPoints(100, [q('a', 10, 0), q('b', 20, 1)]).values()]).toEqual([10, 20]);
    });

    it('rejects explicit points above the total and automatic questions left with 0 points', () => {
      expect(() => resolveQuestionPoints(10, [q('a', 8, 0), q('b', 5, 1)])).toThrow(
        new BadRequestException('Question points add up to 13, more than the test total of 10'),
      );
      expect(() => resolveQuestionPoints(10, [q('a', 9, 0), q('b', null, 1), q('c', null, 2)])).toThrow(
        BadRequestException,
      );
    });

    it('handles a test without questions', () => {
      expect(resolveQuestionPoints(100, []).size).toBe(0);
    });
  });

  it('assertValidOptions requires a correct option', () => {
    expect(() => assertValidOptions([{ text: 'a', is_correct: false }, { text: 'b', is_correct: false }])).toThrow(
      BadRequestException,
    );
    expect(() => assertValidOptions([{ text: 'a', is_correct: true }, { text: 'b', is_correct: false }])).not.toThrow();
  });

  describe('gradeAttempt', () => {
    it('gives full points only for the exact set of correct options', () => {
      const result = gradeAttempt(
        test.questions,
        [
          { question_id: 'q1', option_ids: ['a'] },
          { question_id: 'q2', option_ids: ['c'] }, // partially correct -> wrong
        ],
        70,
        4,
      );
      expect(result).toMatchObject({ score: 1, max_score: 4, percent: 25, passed: false });
      expect(result.answers.map((answer) => [answer.question_id, answer.is_correct])).toEqual([
        ['q1', true],
        ['q2', false],
      ]);
    });

    it('passes at the pass score and counts unanswered questions as wrong', () => {
      expect(gradeAttempt(test.questions, [{ question_id: 'q2', option_ids: ['d', 'c'] }], 75, 4)).toMatchObject({
        score: 3,
        percent: 75,
        passed: true,
      });
    });

    it('grades with the automatic shares of the lesson total', () => {
      const dynamic = makeTest({
        total_points: 100,
        questions: [makeQuestion('q1', ['a'], ['a', 'b'], null, 0), makeQuestion('q2', ['c'], ['c', 'd'], 70, 1)],
      });
      expect(gradeAttempt(dynamic.questions, [{ question_id: 'q1', option_ids: ['a'] }], 70, 100)).toMatchObject({
        score: 30,
        max_score: 100,
        percent: 30,
        passed: false,
        answers: [
          { question_id: 'q1', points: 30 },
          { question_id: 'q2', points: 0 },
        ],
      });
    });

    it('rejects unknown questions, foreign options and duplicates', () => {
      expect(() => gradeAttempt(test.questions, [{ question_id: 'x', option_ids: [] }], 70, 4)).toThrow(BadRequestException);
      expect(() => gradeAttempt(test.questions, [{ question_id: 'q1', option_ids: ['c'] }], 70, 4)).toThrow(
        BadRequestException,
      );
      expect(() =>
        gradeAttempt(
          test.questions,
          [
            { question_id: 'q1', option_ids: ['a'] },
            { question_id: 'q1', option_ids: ['b'] },
          ],
          70,
          4,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
