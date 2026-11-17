import type {
  LessonProgress as LessonProgressRecord,
  ModuleProgress as ModuleProgressRecord,
} from '../../generated/prisma/client';
import type { OrderedLesson, OrderedModule } from './progress.utils';

const date = new Date('2026-01-01T00:00:00.000Z');

export function makeProgressRecord(overrides: Partial<LessonProgressRecord> = {}): LessonProgressRecord {
  return {
    id: 'p1',
    user_id: 'u1',
    lesson_id: 'l1',
    watched_segments: [],
    watched_seconds: 0,
    total_watch_seconds: 0,
    last_position: 0,
    last_watch_at: null,
    video_completed_at: null,
    best_test_percent: null,
    test_passed_at: null,
    completed_at: null,
    created_at: date,
    updated_at: date,
    ...overrides,
  };
}

export function makeModuleRecord(overrides: Partial<ModuleProgressRecord> = {}): ModuleProgressRecord {
  return {
    id: 'mp1',
    user_id: 'u1',
    module_id: 'm1',
    best_test_percent: null,
    test_passed_at: null,
    created_at: date,
    updated_at: date,
    ...overrides,
  };
}

/** A lesson with a tracked 100s video by default; a lesson test is worth 100 points. */
export function makeLesson(overrides: Partial<OrderedLesson> = {}): OrderedLesson {
  const duration = overrides.video_duration === undefined ? 100 : overrides.video_duration;
  return {
    id: 'l1',
    title: 'Lesson 1',
    position: 0,
    has_video: duration !== null,
    video_duration: duration,
    has_test: false,
    test_points: overrides.has_test ? 100 : 0,
    ...overrides,
  };
}

/**
 * Two modules:
 * - m1 = [l1 (video + test), l2 (video)] + final test mt1 (50 points),
 * - m2 = [l3 (no video, no test)], no final test.
 */
export function makeCourse(): OrderedModule[] {
  return [
    {
      id: 'm1',
      title: 'Module 1',
      position: 0,
      lessons: [
        makeLesson({ id: 'l1', has_test: true }),
        makeLesson({ id: 'l2', title: 'Lesson 2', position: 1, video_duration: 200 }),
      ],
      test: { id: 'mt1', total_points: 50 },
    },
    {
      id: 'm2',
      title: 'Module 2',
      position: 1,
      lessons: [makeLesson({ id: 'l3', title: 'Lesson 3', video_duration: null })],
      test: null,
    },
  ];
}
