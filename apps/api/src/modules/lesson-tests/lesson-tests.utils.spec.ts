import { BadRequestException } from '@nestjs/common';
import { makeTest } from './lesson-tests.test-helpers';
import { assertValidOptions, gradeAttempt, toAdminTest, toPublicTest } from './lesson-tests.utils';

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

  it('toAdminTest includes the correct answers', () => {
    const view = toAdminTest(test);
    expect(view.questions[1].options.map((option) => option.is_correct)).toEqual([true, true, false]);
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
      );
      expect(result).toMatchObject({ score: 1, max_score: 4, percent: 25, passed: false });
      expect(result.answers.map((answer) => [answer.question_id, answer.is_correct])).toEqual([
        ['q1', true],
        ['q2', false],
      ]);
    });

    it('passes at the pass score and counts unanswered questions as wrong', () => {
      expect(gradeAttempt(test.questions, [{ question_id: 'q2', option_ids: ['d', 'c'] }], 75)).toMatchObject({
        score: 3,
        percent: 75,
        passed: true,
      });
    });

    it('rejects unknown questions, foreign options and duplicates', () => {
      expect(() => gradeAttempt(test.questions, [{ question_id: 'x', option_ids: [] }], 70)).toThrow(BadRequestException);
      expect(() => gradeAttempt(test.questions, [{ question_id: 'q1', option_ids: ['c'] }], 70)).toThrow(
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
        ),
      ).toThrow(BadRequestException);
    });
  });
});
