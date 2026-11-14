import type { QuestionWithOptions, TestWithQuestions } from './lesson-tests.utils';

const date = new Date('2026-01-01T00:00:00.000Z');

export function makeQuestion(id: string, correct: string[], all: string[], points = 1, position = 0): QuestionWithOptions {
  return {
    id,
    test_id: 't1',
    text: `Question ${id}`,
    points,
    position,
    created_at: date,
    updated_at: date,
    options: all.map((optionId, index) => ({
      id: optionId,
      question_id: id,
      text: `Option ${optionId}`,
      is_correct: correct.includes(optionId),
      position: index,
      created_at: date,
      updated_at: date,
    })),
  };
}

/** q1: single answer (a), 1 point. q2: two answers (c, d), 3 points. */
export function makeTest(overrides: Partial<TestWithQuestions> = {}): TestWithQuestions {
  return {
    id: 't1',
    lesson_id: 'l1',
    title: 'Lesson 1 test',
    pass_score: 70,
    max_attempts: null,
    created_at: date,
    updated_at: date,
    questions: [makeQuestion('q2', ['c', 'd'], ['c', 'd', 'e'], 3, 1), makeQuestion('q1', ['a'], ['a', 'b'], 1, 0)],
    ...overrides,
  };
}
