import { makeCourse, makeLesson, makeProgressRecord } from './progress.test-helpers';
import {
  buildCourseProgress,
  computeStatuses,
  isLessonRequirementsMet,
  mergeSegment,
  parseSegments,
  percentOf,
  requiredWatchSeconds,
  sumSegments,
  toLessonProgress,
} from './progress.utils';

const done = new Date('2026-01-05T00:00:00.000Z');

describe('progress utils', () => {
  describe('segments', () => {
    it('merges overlapping and adjacent segments', () => {
      let segments = mergeSegment([], [10, 20]);
      segments = mergeSegment(segments, [0, 5]);
      segments = mergeSegment(segments, [15, 30]);
      segments = mergeSegment(segments, [30, 40]);
      expect(segments).toEqual([
        [0, 5],
        [10, 40],
      ]);
      expect(sumSegments(segments)).toBe(35);
    });

    it('does not count rewatched seconds twice', () => {
      const segments = mergeSegment([[0, 30]], [10, 20]);
      expect(sumSegments(segments)).toBe(30);
    });

    it('drops malformed stored JSON', () => {
      expect(parseSegments('nope')).toEqual([]);
      expect(parseSegments([[0, 10], [5, 1], ['a', 2], [1]])).toEqual([[0, 10]]);
    });
  });

  it('percentOf rounds and caps at 100, 0 for empty whole', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(5, 4)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
  });

  it('requiredWatchSeconds is 95% rounded up', () => {
    expect(requiredWatchSeconds(100)).toBe(95);
    expect(requiredWatchSeconds(7)).toBe(7);
  });

  describe('isLessonRequirementsMet', () => {
    it('needs the video and the test', () => {
      const lesson = makeLesson({ has_test: true });
      expect(isLessonRequirementsMet(lesson, null)).toBe(false);
      expect(isLessonRequirementsMet(lesson, makeProgressRecord({ video_completed_at: done }))).toBe(false);
      expect(
        isLessonRequirementsMet(lesson, makeProgressRecord({ video_completed_at: done, test_passed_at: done })),
      ).toBe(true);
    });

    it('a lesson without video and test is always satisfied', () => {
      expect(isLessonRequirementsMet(makeLesson({ video_duration: null }), null)).toBe(true);
    });
  });

  describe('computeStatuses', () => {
    const lessons = makeCourse().flatMap((module) => module.lessons);

    it('opens only the first lesson for a new student', () => {
      expect([...computeStatuses(lessons, new Map()).values()]).toEqual(['available', 'locked', 'locked']);
    });

    it('opens the next lesson after the previous one is completed', () => {
      const records = new Map([
        ['l1', makeProgressRecord({ lesson_id: 'l1', completed_at: done })],
        ['l2', makeProgressRecord({ lesson_id: 'l2', watched_seconds: 10 })],
      ]);
      expect([...computeStatuses(lessons, records).values()]).toEqual(['completed', 'in_progress', 'locked']);
    });

    it('keeps completed lessons completed even if an earlier lesson is not', () => {
      const records = new Map([['l2', makeProgressRecord({ lesson_id: 'l2', completed_at: done })]]);
      expect([...computeStatuses(lessons, records).values()]).toEqual(['available', 'completed', 'locked']);
    });
  });

  it('toLessonProgress reports exact watch numbers', () => {
    const record = makeProgressRecord({
      watched_seconds: 50,
      total_watch_seconds: 80,
      last_position: 49,
      last_watch_at: done,
      best_test_percent: 60,
    });
    expect(toLessonProgress(makeLesson({ has_test: true }), record, 'in_progress')).toEqual({
      lesson_id: 'l1',
      status: 'in_progress',
      video_duration: 100,
      watched_seconds: 50,
      watched_percent: 50,
      total_watch_seconds: 80,
      last_position: 49,
      video_completed: false,
      has_test: true,
      best_test_percent: 60,
      test_passed: false,
      last_watch_at: done.toISOString(),
      completed_at: null,
    });
  });

  it('buildCourseProgress sums modules and the course', () => {
    const later = new Date('2026-01-06T00:00:00.000Z');
    const { totals, modules } = buildCourseProgress(makeCourse(), [
      makeProgressRecord({ lesson_id: 'l1', watched_seconds: 100, total_watch_seconds: 120, completed_at: done }),
      makeProgressRecord({ lesson_id: 'l2', watched_seconds: 30, total_watch_seconds: 30, updated_at: later }),
    ]);
    expect(totals).toEqual({
      total_lessons: 3,
      completed_lessons: 1,
      percent: 33,
      total_video_seconds: 300,
      watched_seconds: 130,
      total_watch_seconds: 150,
      current_lesson_id: 'l2',
      last_activity_at: later.toISOString(),
    });
    expect(modules.map((module) => [module.completed_lessons, module.total_lessons, module.percent])).toEqual([
      [1, 2, 50],
      [0, 1, 0],
    ]);
    expect(modules[0].lessons[1]).toMatchObject({ lesson_id: 'l2', title: 'Lesson 2', status: 'in_progress' });
  });
});
