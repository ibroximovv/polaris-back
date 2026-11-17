import type {
  CourseProgressTotals,
  LessonOutline,
  LessonProgress,
  LessonProgressItem,
  LessonStatus,
  ModuleProgress,
  ModuleTestProgress,
} from '@nestjs-template/types';
import type {
  LessonProgress as LessonProgressRecord,
  ModuleProgress as ModuleProgressRecord,
} from '../../generated/prisma/client';

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

/** best percent of a test's points, rounded; 0 before any attempt. */
export function pointsFromPercent(percent: number | null | undefined, points: number): number {
  return percent == null ? 0 : Math.round((percent * points) / 100);
}

// --- Course outline in learning order ----------------------------------------

/** Minimal lesson info the progress rules need. */
export interface OrderedLesson {
  id: string;
  title: string;
  position: number;
  has_video: boolean;
  /** Tracked video length; null = no video requirement. */
  video_duration: number | null;
  has_test: boolean;
  /** Points the lesson test is worth (0 without a test). */
  test_points: number;
}

export interface OrderedModuleTest {
  id: string;
  total_points: number;
}

export interface OrderedModule {
  id: string;
  title: string;
  position: number;
  lessons: OrderedLesson[];
  /** Final test: opens after every lesson of the module is completed. */
  test: OrderedModuleTest | null;
}

const byPositionThenCreated = [{ position: 'asc' as const }, { created_at: 'asc' as const }];

/** Prisma `select` for a lesson in course order (course outlines and progress). */
export const orderedLessonSelect = {
  id: true,
  title: true,
  position: true,
  video: { select: { duration: true } },
  test: { select: { id: true, total_points: true } },
};

/** Prisma `select` for a module in course order, with its lessons and final test. */
export const orderedModuleSelect = {
  id: true,
  title: true,
  position: true,
  lessons: { orderBy: byPositionThenCreated, select: orderedLessonSelect },
  test: { select: { id: true, total_points: true } },
};

export const moduleOrder = byPositionThenCreated;

export interface OrderedLessonRow {
  id: string;
  title: string;
  position: number;
  video: { duration: number | null } | null;
  test: { id: string; total_points: number } | null;
}

export interface OrderedModuleRow {
  id: string;
  title: string;
  position: number;
  lessons: OrderedLessonRow[];
  test: OrderedModuleTest | null;
}

export function toOrderedLesson(row: OrderedLessonRow): OrderedLesson {
  const duration = row.video?.duration ?? null;
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    has_video: row.video !== null,
    video_duration: duration && duration > 0 ? duration : null,
    has_test: row.test !== null,
    test_points: row.test?.total_points ?? 0,
  };
}

export function toOrderedModule(row: OrderedModuleRow): OrderedModule {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    lessons: row.lessons.map(toOrderedLesson),
    test: row.test ? { id: row.test.id, total_points: row.test.total_points } : null,
  };
}

export function toLessonOutline(lesson: OrderedLesson): LessonOutline {
  return {
    id: lesson.id,
    title: lesson.title,
    position: lesson.position,
    has_video: lesson.has_video,
    video_duration: lesson.video_duration,
    has_test: lesson.has_test,
  };
}

export function hasVideo(lesson: Pick<OrderedLesson, 'video_duration'>): boolean {
  return (lesson.video_duration ?? 0) > 0;
}

/** True when every requirement of the lesson is met: the video (if tracked) and the lesson test (if any). */
export function isLessonRequirementsMet(lesson: OrderedLesson, record: LessonProgressRecord | null): boolean {
  const videoDone = !hasVideo(lesson) || record?.video_completed_at != null;
  const testDone = !lesson.has_test || record?.test_passed_at != null;
  return videoDone && testDone;
}

/** One step of the course: a lesson, or a module's final test after its lessons. */
export type LearningStep =
  | { type: 'lesson'; id: string; module_id: string }
  | { type: 'test'; id: string; module_id: string };

export function learningSteps(modules: OrderedModule[]): LearningStep[] {
  return modules.flatMap((module) => [
    ...module.lessons.map((lesson): LearningStep => ({ type: 'lesson', id: lesson.id, module_id: module.id })),
    ...(module.test ? [{ type: 'test', id: module.test.id, module_id: module.id } as LearningStep] : []),
  ]);
}

/** The step right after a lesson, or after a whole module (its last lesson or its test). */
export function nextStep(
  modules: OrderedModule[],
  after: { lessonId: string } | { moduleId: string },
): { next_lesson_id: string | null; next_test_id: string | null } {
  const steps = learningSteps(modules);
  let index: number;
  if ('lessonId' in after) {
    index = steps.findIndex((step) => step.type === 'lesson' && step.id === after.lessonId);
  } else {
    index = steps.map((step) => step.module_id).lastIndexOf(after.moduleId);
  }
  const next = index >= 0 ? steps[index + 1] : undefined;
  return {
    next_lesson_id: next?.type === 'lesson' ? next.id : null,
    next_test_id: next?.type === 'test' ? next.id : null,
  };
}

export interface CourseState {
  lessons: Map<string, LessonStatus>;
  /** Status of each module's final test (only modules that have one). */
  moduleTests: Map<string, LessonStatus>;
  /** Every lesson completed and the final test (if any) passed. */
  modulesCompleted: Map<string, boolean>;
  /** First open step, null when the course is finished. */
  current: LearningStep | null;
}

/**
 * Statuses in strict course order: lessons of a module one by one, then the module's final test,
 * then the next module. A step is open when everything before it is done; completed lessons and
 * passed tests stay completed.
 */
export function computeCourseState(
  modules: OrderedModule[],
  lessonRecords: Map<string, LessonProgressRecord>,
  moduleRecords: Map<string, ModuleProgressRecord>,
): CourseState {
  const lessons = new Map<string, LessonStatus>();
  const moduleTests = new Map<string, LessonStatus>();
  const modulesCompleted = new Map<string, boolean>();
  let open = true;
  let current: LearningStep | null = null;

  for (const module of modules) {
    let allLessonsCompleted = true;
    for (const lesson of module.lessons) {
      const record = lessonRecords.get(lesson.id) ?? null;
      let status: LessonStatus;
      if (record?.completed_at) {
        status = 'completed';
      } else if (!open) {
        status = 'locked';
      } else if (record && (record.watched_seconds > 0 || record.best_test_percent !== null)) {
        status = 'in_progress';
      } else {
        status = 'available';
      }
      lessons.set(lesson.id, status);
      if (status !== 'completed') {
        allLessonsCompleted = false;
        if (open) current ??= { type: 'lesson', id: lesson.id, module_id: module.id };
        open = false;
      }
    }

    let testPassed = true;
    if (module.test) {
      const record = moduleRecords.get(module.id) ?? null;
      let status: LessonStatus;
      if (record?.test_passed_at) {
        status = 'completed';
      } else if (!open) {
        status = 'locked';
      } else if (record?.best_test_percent != null) {
        status = 'in_progress';
      } else {
        status = 'available';
      }
      moduleTests.set(module.id, status);
      testPassed = status === 'completed';
      if (!testPassed) {
        if (open) current ??= { type: 'test', id: module.test.id, module_id: module.id };
        open = false;
      }
    }
    modulesCompleted.set(module.id, allLessonsCompleted && testPassed);
  }
  return { lessons, moduleTests, modulesCompleted, current };
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
    test_points: lesson.test_points,
    earned_points: lesson.has_test ? pointsFromPercent(record?.best_test_percent, lesson.test_points) : 0,
    last_watch_at: record?.last_watch_at?.toISOString() ?? null,
    completed_at: record?.completed_at?.toISOString() ?? null,
  };
}

export function toModuleTestProgress(
  test: OrderedModuleTest,
  record: ModuleProgressRecord | null,
  status: LessonStatus,
): ModuleTestProgress {
  return {
    test_id: test.id,
    status,
    best_test_percent: record?.best_test_percent ?? null,
    test_passed: record?.test_passed_at != null,
    test_points: test.total_points,
    earned_points: pointsFromPercent(record?.best_test_percent, test.total_points),
  };
}

/** Builds per-module and course-wide numbers from the course outline and one user's records. */
export function buildCourseProgress(
  modules: OrderedModule[],
  lessonRecordList: LessonProgressRecord[],
  moduleRecordList: ModuleProgressRecord[],
): { totals: CourseProgressTotals; modules: ModuleProgress[] } {
  const lessonRecords = new Map(lessonRecordList.map((record) => [record.lesson_id, record]));
  const moduleRecords = new Map(moduleRecordList.map((record) => [record.module_id, record]));
  const state = computeCourseState(modules, lessonRecords, moduleRecords);

  const moduleProgress: ModuleProgress[] = modules.map((module) => {
    const items: LessonProgressItem[] = module.lessons.map((lesson) => ({
      ...toLessonProgress(lesson, lessonRecords.get(lesson.id) ?? null, state.lessons.get(lesson.id) ?? 'locked'),
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
      completed: state.modulesCompleted.get(module.id) ?? false,
      lessons: items,
      test: module.test
        ? toModuleTestProgress(
            module.test,
            moduleRecords.get(module.id) ?? null,
            state.moduleTests.get(module.id) ?? 'locked',
          )
        : null,
    };
  });

  const lessonItems = moduleProgress.flatMap((module) => module.lessons);
  const moduleTests = moduleProgress.flatMap((module) => (module.test ? [module.test] : []));
  const completedLessons = lessonItems.filter((item) => item.status === 'completed').length;
  const lastActivity = [...lessonRecordList, ...moduleRecordList].reduce<Date | null>(
    (latest, record) => (latest === null || record.updated_at > latest ? record.updated_at : latest),
    null,
  );
  const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

  return {
    totals: {
      total_modules: modules.length,
      completed_modules: moduleProgress.filter((module) => module.completed).length,
      total_lessons: lessonItems.length,
      completed_lessons: completedLessons,
      percent: percentOf(completedLessons, lessonItems.length),
      total_video_seconds: sum(modules.flatMap((module) => module.lessons.map((lesson) => lesson.video_duration ?? 0))),
      watched_seconds: sum(lessonRecordList.map((record) => record.watched_seconds)),
      total_watch_seconds: sum(lessonRecordList.map((record) => record.total_watch_seconds)),
      total_points: sum(lessonItems.map((item) => item.test_points)) + sum(moduleTests.map((test) => test.test_points)),
      earned_points:
        sum(lessonItems.map((item) => item.earned_points)) + sum(moduleTests.map((test) => test.earned_points)),
      current_lesson_id: state.current?.type === 'lesson' ? state.current.id : null,
      current_test_id: state.current?.type === 'test' ? state.current.id : null,
      last_activity_at: lastActivity?.toISOString() ?? null,
    },
    modules: moduleProgress,
  };
}
