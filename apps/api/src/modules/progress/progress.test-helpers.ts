import type { LessonProgress as LessonProgressRecord } from '../../generated/prisma/client';
import type { OrderedLesson, OrderedModule } from './progress.utils';

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
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<OrderedLesson> = {}): OrderedLesson {
  return { id: 'l1', title: 'Lesson 1', position: 0, video_duration: 100, has_test: false, ...overrides };
}

/** Two modules: m1 = [l1 (video+test), l2 (video)], m2 = [l3 (no video, no test)]. */
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
    },
    {
      id: 'm2',
      title: 'Module 2',
      position: 1,
      lessons: [makeLesson({ id: 'l3', title: 'Lesson 3', video_duration: null })],
    },
  ];
}
