import type {
  CourseProgressTotals,
  LessonProgress,
  LessonProgressItem,
  LessonStatus,
  ModuleProgress,
} from '@nestjs-template/types';
import type { LessonProgress as LessonProgressRecord } from '../../generated/prisma/client';

/** Share of the video (unique seconds) that counts as "watched". */
export const VIDEO_COMPLETION_RATIO = 0.95;
/** Longest segment one heartbeat may report. Clients send a heartbeat every ~10-15s. */
export const MAX_SEGMENT_SECONDS = 60;
/** Fastest playback speed the player allows; used to reject skipped-over segments. */
export const MAX_PLAYBACK_RATE = 2;
/** Slack for network delay between heartbeats. */
export const HEARTBEAT_TOLERANCE_SECONDS = 5;

export type Segment = [number, number];

/** Reads `watched_segments` JSON defensively; anything malformed is dropped. */
export function parseSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Segment =>
      Array.isArray(item) &&
      item.length === 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number' &&
      item[1] > item[0],
  );
}

/** Adds a segment and merges overlapping/adjacent ones. Result is sorted and non-overlapping. */
export function mergeSegment(segments: Segment[], segment: Segment): Segment[] {
  const all = [...segments, segment].sort((a, b) => a[0] - b[0]);
  const merged: Segment[] = [];
  for (const [start, end] of all) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function sumSegments(segments: Segment[]): number {
  return segments.reduce((total, [start, end]) => total + (end - start), 0);
}

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

/** Seconds of unique watching needed to complete a video of the given length. */
export function requiredWatchSeconds(duration: number): number {
  return Math.ceil(duration * VIDEO_COMPLETION_RATIO);
}

/** Minimal lesson info the progress rules need. */
export interface OrderedLesson {
  id: string;
  title: string;
  position: number;
  video_duration: number | null;
  has_test: boolean;
}

export interface OrderedModule {
  id: string;
  title: string;
  position: number;
  lessons: OrderedLesson[];
}

export function hasVideo(lesson: Pick<OrderedLesson, 'video_duration'>): boolean {
  return (lesson.video_duration ?? 0) > 0;
}

/** True when every requirement of the lesson is met: the video (if any) and the test (if any). */
export function isLessonRequirementsMet(lesson: OrderedLesson, record: LessonProgressRecord | null): boolean {
  const videoDone = !hasVideo(lesson) || record?.video_completed_at != null;
  const testDone = !lesson.has_test || record?.test_passed_at != null;
  return videoDone && testDone;
}

/**
 * Status of every lesson in course order. A lesson is open when it is already completed or every
 * lesson before it is completed, so the student moves strictly one lesson at a time.
 */
export function computeStatuses(
  lessons: OrderedLesson[],
  records: Map<string, LessonProgressRecord>,
): Map<string, LessonStatus> {
  const statuses = new Map<string, LessonStatus>();
  let allPreviousCompleted = true;
  for (const lesson of lessons) {
    const record = records.get(lesson.id) ?? null;
    let status: LessonStatus;
    if (record?.completed_at) {
      status = 'completed';
    } else if (!allPreviousCompleted) {
      status = 'locked';
    } else if (record && (record.watched_seconds > 0 || record.best_test_percent !== null)) {
      status = 'in_progress';
    } else {
      status = 'available';
    }
    statuses.set(lesson.id, status);
    if (status !== 'completed') allPreviousCompleted = false;
  }
  return statuses;
}

export function toLessonProgress(
  lesson: OrderedLesson,
  record: LessonProgressRecord | null,
  status: LessonStatus,
): LessonProgress {
  const watched = record?.watched_seconds ?? 0;
  return {
    lesson_id: lesson.id,
    status,
    video_duration: lesson.video_duration,
    watched_seconds: watched,
    watched_percent: hasVideo(lesson) ? percentOf(watched, lesson.video_duration ?? 0) : 0,
    total_watch_seconds: record?.total_watch_seconds ?? 0,
    last_position: record?.last_position ?? 0,
    video_completed: hasVideo(lesson) ? record?.video_completed_at != null : true,
    has_test: lesson.has_test,
    best_test_percent: record?.best_test_percent ?? null,
    test_passed: record?.test_passed_at != null,
    last_watch_at: record?.last_watch_at?.toISOString() ?? null,
    completed_at: record?.completed_at?.toISOString() ?? null,
  };
}

/** Builds per-module and course-wide numbers from the course outline and one user's records. */
export function buildCourseProgress(
  modules: OrderedModule[],
  recordList: LessonProgressRecord[],
): { totals: CourseProgressTotals; modules: ModuleProgress[] } {
  const records = new Map(recordList.map((record) => [record.lesson_id, record]));
  const lessons = modules.flatMap((module) => module.lessons);
  const statuses = computeStatuses(lessons, records);

  const moduleProgress: ModuleProgress[] = modules.map((module) => {
    const items: LessonProgressItem[] = module.lessons.map((lesson) => ({
      ...toLessonProgress(lesson, records.get(lesson.id) ?? null, statuses.get(lesson.id) ?? 'locked'),
      title: lesson.title,
      position: lesson.position,
    }));
    const completed = items.filter((item) => item.status === 'completed').length;
    return {
      module_id: module.id,
      title: module.title,
      position: module.position,
      total_lessons: items.length,
      completed_lessons: completed,
      percent: percentOf(completed, items.length),
      lessons: items,
    };
  });

  const completedLessons = lessons.filter((lesson) => statuses.get(lesson.id) === 'completed').length;
  const lastActivity = recordList.reduce<Date | null>(
    (latest, record) => (latest === null || record.updated_at > latest ? record.updated_at : latest),
    null,
  );
  const current = lessons.find((lesson) => {
    const status = statuses.get(lesson.id);
    return status === 'available' || status === 'in_progress';
  });

  return {
    totals: {
      total_lessons: lessons.length,
      completed_lessons: completedLessons,
      percent: percentOf(completedLessons, lessons.length),
      total_video_seconds: lessons.reduce(
        (sum, lesson) => sum + (hasVideo(lesson) ? (lesson.video_duration ?? 0) : 0),
        0,
      ),
      watched_seconds: recordList.reduce((sum, record) => sum + record.watched_seconds, 0),
      total_watch_seconds: recordList.reduce((sum, record) => sum + record.total_watch_seconds, 0),
      current_lesson_id: current?.id ?? null,
      last_activity_at: lastActivity?.toISOString() ?? null,
    },
    modules: moduleProgress,
  };
}
