import { makeCourse, makeLesson, makeModuleRecord, makeProgressRecord } from './progress.test-helpers';
import {
  buildCourseProgress,
  computeCourseState,
  isLessonRequirementsMet,
  learningSteps,
  mergeSegment,
  nextStep,
  parseSegments,
  percentOf,
  pointsFromPercent,
  requiredWatchSeconds,
  sumSegments,
  toLessonOutline,
  toLessonProgress,
  toModuleTestProgress,
  toOrderedModule,
} from './progress.utils';

const done = new Date('2026-01-05T00:00:00.000Z');
const lessonRecords = (...records: ReturnType<typeof makeProgressRecord>[]) =>
  new Map(records.map((record) => [record.lesson_id, record]));
const moduleRecords = (...records: ReturnType<typeof makeModuleRecord>[]) =>
  new Map(records.map((record) => [record.module_id, record]));

describe('progress utils', () => {
  describe('segments', () => {
    it('merges overlapping and adjacent segments', () => {
      let segments = mergeSegment([], [0, 10]);
      segments = mergeSegment(segments, [20, 30]);
      segments = mergeSegment(segments, [10, 15]);
      segments = mergeSegment(segments, [25, 40]);
      expect(segments).toEqual([
        [0, 15],
        [20, 40],
      ]);
    });

    it('does not count rewatched seconds twice', () => {
      const segments = mergeSegment(mergeSegment([], [0, 60]), [30, 60]);
      expect(sumSegments(segments)).toBe(60);
    });

    it('drops malformed stored JSON', () => {
      expect(parseSegments([[0, 5], 'x', [3, 1], [1]])).toEqual([[0, 5]]);
      expect(parseSegments(null)).toEqual([]);
    });
  });

  it('percentOf rounds and caps at 100, 0 for empty whole', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(5, 4)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
  });

  it('requiredWatchSeconds is 95% rounded up', () => {
    expect(requiredWatchSeconds(100)).toBe(95);
    expect(requiredWatchSeconds(61)).toBe(58);
  });

  it('pointsFromPercent is a rounded share, 0 before any attempt', () => {
    expect(pointsFromPercent(85, 30)).toBe(26);
    expect(pointsFromPercent(null, 30)).toBe(0);
  });

  describe('toOrderedModule / toLessonOutline', () => {
    const module = toOrderedModule({
      id: 'm1',
      title: 'M',
      position: 0,
      lessons: [
        { id: 'l1', title: 'A', position: 0, video: { duration: 120 }, test: { id: 't1', total_points: 30 } },
        { id: 'l2', title: 'B', position: 1, video: { duration: null }, test: null },
        { id: 'l3', title: 'C', position: 2, video: null, test: null },
      ],
      test: { id: 'mt1', total_points: 50 },
    });

    it('maps the video, the lesson tests and the module test', () => {
      expect(module.test).toEqual({ id: 'mt1', total_points: 50 });
      expect(module.lessons.map((lesson) => [lesson.has_video, lesson.video_duration, lesson.test_points])).toEqual([
        [true, 120, 30],
        [true, null, 0],
        [false, null, 0],
      ]);
    });

    it('builds a lesson outline', () => {
      expect(toLessonOutline(module.lessons[0])).toEqual({
        id: 'l1',
        title: 'A',
        position: 0,
        has_video: true,
        video_duration: 120,
        has_test: true,
      });
    });
  });

  describe('isLessonRequirementsMet', () => {
    it('needs the tracked video and the lesson test', () => {
      const lesson = makeLesson({ has_test: true });
      expect(isLessonRequirementsMet(lesson, makeProgressRecord({ video_completed_at: done }))).toBe(false);
      expect(isLessonRequirementsMet(lesson, makeProgressRecord({ video_completed_at: done, test_passed_at: done }))).toBe(
        true,
      );
    });

    it('a lesson without a tracked video and test is always satisfied', () => {
      expect(isLessonRequirementsMet(makeLesson({ video_duration: null }), null)).toBe(true);
    });
  });

  describe('learningSteps / nextStep', () => {
    const course = makeCourse();

    it('lists lessons of each module followed by its final test', () => {
      expect(learningSteps(course).map((step) => `${step.type}:${step.id}`)).toEqual([
        'lesson:l1',
        'lesson:l2',
        'test:mt1',
        'lesson:l3',
      ]);
    });

    it('finds the step after a lesson or a module', () => {
      expect(nextStep(course, { lessonId: 'l1' })).toEqual({ next_lesson_id: 'l2', next_test_id: null });
      expect(nextStep(course, { lessonId: 'l2' })).toEqual({ next_lesson_id: null, next_test_id: 'mt1' });
      expect(nextStep(course, { moduleId: 'm1' })).toEqual({ next_lesson_id: 'l3', next_test_id: null });
      expect(nextStep(course, { moduleId: 'm2' })).toEqual({ next_lesson_id: null, next_test_id: null });
    });
  });

  describe('computeCourseState', () => {
    const course = makeCourse();

    it('opens only the first lesson for a new student', () => {
      const state = computeCourseState(course, new Map(), new Map());
      expect([...state.lessons.values()]).toEqual(['available', 'locked', 'locked']);
      expect(state.moduleTests.get('m1')).toBe('locked');
      expect(state.current).toEqual({ type: 'lesson', id: 'l1', module_id: 'm1' });
    });

    it('opens the module test after the last lesson and keeps the next module locked until it is passed', () => {
      const records = lessonRecords(
        makeProgressRecord({ lesson_id: 'l1', completed_at: done }),
        makeProgressRecord({ lesson_id: 'l2', completed_at: done }),
      );
      let state = computeCourseState(course, records, new Map());
      expect(state.moduleTests.get('m1')).toBe('available');
      expect(state.lessons.get('l3')).toBe('locked');
      expect(state.modulesCompleted.get('m1')).toBe(false);
      expect(state.current).toEqual({ type: 'test', id: 'mt1', module_id: 'm1' });

      state = computeCourseState(course, records, moduleRecords(makeModuleRecord({ best_test_percent: 40 })));
      expect(state.moduleTests.get('m1')).toBe('in_progress');
      expect(state.lessons.get('l3')).toBe('locked');

      state = computeCourseState(
        course,
        records,
        moduleRecords(makeModuleRecord({ best_test_percent: 80, test_passed_at: done })),
      );
      expect(state.moduleTests.get('m1')).toBe('completed');
      expect(state.modulesCompleted.get('m1')).toBe(true);
      expect(state.lessons.get('l3')).toBe('available');
      expect(state.current).toEqual({ type: 'lesson', id: 'l3', module_id: 'm2' });
    });

    it('keeps completed steps completed even if an earlier step is not', () => {
      const state = computeCourseState(
        course,
        lessonRecords(makeProgressRecord({ lesson_id: 'l2', completed_at: done })),
        new Map(),
      );
      expect(state.lessons.get('l2')).toBe('completed');
      expect(state.lessons.get('l1')).toBe('available');
    });

    it('a module without lessons opens its test right away', () => {
      const state = computeCourseState(
        [{ id: 'm0', title: 'Intro', position: 0, lessons: [], test: { id: 't0', total_points: 10 } }],
        new Map(),
        new Map(),
      );
      expect(state.moduleTests.get('m0')).toBe('available');
      expect(state.current).toEqual({ type: 'test', id: 't0', module_id: 'm0' });
    });

    it('reports no current step when everything is done', () => {
      const state = computeCourseState(
        course,
        lessonRecords(
          makeProgressRecord({ lesson_id: 'l1', completed_at: done }),
          makeProgressRecord({ lesson_id: 'l2', completed_at: done }),
          makeProgressRecord({ lesson_id: 'l3', completed_at: done }),
        ),
        moduleRecords(makeModuleRecord({ test_passed_at: done })),
      );
      expect(state.current).toBeNull();
    });
  });

  it('toLessonProgress reports exact watch numbers and points', () => {
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
      test_points: 100,
      earned_points: 60,
      last_watch_at: done.toISOString(),
      completed_at: null,
    });
  });

  it('toModuleTestProgress reports the best result', () => {
    expect(
      toModuleTestProgress(
        { id: 'mt1', total_points: 50 },
        makeModuleRecord({ best_test_percent: 90, test_passed_at: done }),
        'completed',
      ),
    ).toEqual({
      test_id: 'mt1',
      status: 'completed',
      best_test_percent: 90,
      test_passed: true,
      test_points: 50,
      earned_points: 45,
    });
  });

  it('buildCourseProgress sums modules, module tests and the course', () => {
    const later = new Date('2026-01-06T00:00:00.000Z');
    const { totals, modules } = buildCourseProgress(
      makeCourse(),
      [
        makeProgressRecord({
          lesson_id: 'l1',
          watched_seconds: 100,
          total_watch_seconds: 120,
          best_test_percent: 80,
          completed_at: done,
        }),
        makeProgressRecord({ lesson_id: 'l2', watched_seconds: 200, total_watch_seconds: 210, completed_at: done }),
      ],
      [makeModuleRecord({ best_test_percent: 60, updated_at: later })],
    );
    expect(totals).toEqual({
      total_modules: 2,
      completed_modules: 0,
      total_lessons: 3,
      completed_lessons: 2,
      percent: 67,
      total_video_seconds: 300,
      watched_seconds: 300,
      total_watch_seconds: 330,
      total_points: 150,
      earned_points: 110,
      current_lesson_id: null,
      current_test_id: 'mt1',
      last_activity_at: later.toISOString(),
    });
    expect(modules[0]).toMatchObject({
      completed_lessons: 2,
      percent: 100,
      completed: false,
      test: { test_id: 'mt1', status: 'in_progress', earned_points: 30 },
    });
    expect(modules[1]).toMatchObject({ completed: false, test: null });
    expect(modules[1].lessons[0].status).toBe('locked');
  });
});
