// Learning shapes: course -> modules (final test) -> lessons (video, materials, optional test), plus progress and stats.

export interface Course {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** UPLOAD = a file from /uploads (signed `url`), LINK = external URL. */
export type MediaSource = 'UPLOAD' | 'LINK';
export type MaterialType = 'IMAGE' | 'FILE';

/** The single video of a lesson. */
export interface LessonVideo {
  id: string;
  lesson_id: string;
  source: MediaSource;
  /** Set when source = UPLOAD. */
  upload_id: string | null;
  title: string | null;
  file_name: string | null;
  mime_type: string | null;
  /** Bytes. */
  size: number | null;
  /** Length in seconds; null = the video is not tracked nor required. */
  duration: number | null;
  /** Signed MinIO link (valid until `url_expires_at`) or the external link. */
  url: string | null;
  url_expires_at: string | null;
}

/** A guide file or image of a lesson. */
export interface LessonMaterial {
  id: string;
  lesson_id: string;
  type: MaterialType;
  source: MediaSource;
  upload_id: string | null;
  title: string | null;
  file_name: string | null;
  mime_type: string | null;
  size: number | null;
  position: number;
  url: string | null;
  url_expires_at: string | null;
}

export type TestKind = 'LESSON' | 'MODULE';

/** Short test info (no questions), shown on a lesson or a module. */
export interface TestSummary {
  id: string;
  kind: TestKind;
  title: string | null;
  /** Points the test is worth. */
  total_points: number;
  pass_score: number;
  max_attempts: number | null;
  question_count: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  content: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface LessonDetail extends Lesson {
  video: LessonVideo | null;
  /** Guide files and images in display order. */
  materials: LessonMaterial[];
  test: TestSummary | null;
}

/** Lesson without heavy fields, used in course outlines. */
export interface LessonOutline {
  id: string;
  title: string;
  position: number;
  has_video: boolean;
  /** Video length in seconds when it is tracked. */
  video_duration: number | null;
  has_test: boolean;
}

export interface CourseModuleOutline extends CourseModule {
  lessons: LessonOutline[];
  /** The module's final test. */
  test: TestSummary | null;
}

export interface CourseDetail extends Course {
  modules: CourseModuleOutline[];
}

// --- Tests -----------------------------------------------------------------

/** Option as students see it: no `is_correct`. */
export interface TestOptionPublic {
  id: string;
  text: string;
  position: number;
}

export interface TestOptionAdmin extends TestOptionPublic {
  is_correct: boolean;
}

export interface TestQuestionPublic {
  id: string;
  text: string;
  /** Effective points: explicit, or an even share of what the test total leaves. */
  points: number;
  position: number;
  /** True when more than one option is correct (the student may pick several). */
  multiple: boolean;
  options: TestOptionPublic[];
}

export interface TestQuestionAdmin extends Omit<TestQuestionPublic, 'options'> {
  /** True when `points` is computed by the default rule (no explicit points set). */
  points_auto: boolean;
  options: TestOptionAdmin[];
}

export interface LessonTestPublic {
  id: string;
  kind: TestKind;
  /** Set for a lesson test. */
  lesson_id: string | null;
  /** Set for a module's final test. */
  module_id: string | null;
  title: string | null;
  /** Points the test is worth. */
  total_points: number;
  /** Sum of the questions' effective points (equals total_points unless every question has explicit points). */
  max_score: number;
  pass_score: number;
  max_attempts: number | null;
  questions: TestQuestionPublic[];
}

export interface LessonTestAdmin extends Omit<LessonTestPublic, 'questions'> {
  questions: TestQuestionAdmin[];
  created_at: string;
  updated_at: string;
}

export interface TestAnswerResult {
  question_id: string;
  is_correct: boolean;
  points: number;
}

export interface TestAttemptResult {
  id: string;
  test_id: string;
  user_id: string;
  score: number;
  max_score: number;
  percent: number;
  passed: boolean;
  created_at: string;
  /** Per-question result. Correct options are never revealed. */
  answers: TestAnswerResult[];
}

export interface TestAttemptSummary {
  id: string;
  score: number;
  max_score: number;
  percent: number;
  passed: boolean;
  created_at: string;
}

export interface TestAttemptHistory {
  test_id: string;
  total_points: number;
  pass_score: number;
  max_attempts: number | null;
  attempts_used: number;
  /** null = unlimited. */
  attempts_left: number | null;
  best_percent: number | null;
  passed: boolean;
  attempts: TestAttemptSummary[];
}

// --- Progress --------------------------------------------------------------

export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface LessonProgress {
  lesson_id: string;
  status: LessonStatus;
  video_duration: number | null;
  /** Unique seconds of the video watched. */
  watched_seconds: number;
  /** watched_seconds / video_duration, 0-100. */
  watched_percent: number;
  /** All watch time including rewatching. */
  total_watch_seconds: number;
  /** Resume point in seconds. */
  last_position: number;
  video_completed: boolean;
  has_test: boolean;
  best_test_percent: number | null;
  test_passed: boolean;
  /** Points the lesson test is worth (0 without a test). */
  test_points: number;
  /** best_test_percent of test_points, rounded. */
  earned_points: number;
  last_watch_at: string | null;
  completed_at: string | null;
}

export interface LessonProgressItem extends LessonProgress {
  title: string;
  position: number;
}

/** State of a module's final test for one user. `locked` until every lesson of the module is completed. */
export interface ModuleTestProgress {
  test_id: string;
  status: LessonStatus;
  best_test_percent: number | null;
  test_passed: boolean;
  test_points: number;
  earned_points: number;
}

export interface ModuleProgress {
  module_id: string;
  title: string;
  position: number;
  total_lessons: number;
  completed_lessons: number;
  /** completed_lessons / total_lessons, 0-100. */
  percent: number;
  /** Every lesson completed and the final test (if any) passed. */
  completed: boolean;
  lessons: LessonProgressItem[];
  test: ModuleTestProgress | null;
}

export interface CourseProgressTotals {
  total_modules: number;
  completed_modules: number;
  total_lessons: number;
  completed_lessons: number;
  /** completed_lessons / total_lessons, 0-100. */
  percent: number;
  /** Sum of all lesson video durations. */
  total_video_seconds: number;
  watched_seconds: number;
  total_watch_seconds: number;
  /** Sum of all test points in the course (lesson and module tests). */
  total_points: number;
  /** Points earned from the best test results. */
  earned_points: number;
  /** The next step: a lesson, or a module's final test. Both null when the course is finished. */
  current_lesson_id: string | null;
  current_test_id: string | null;
  last_activity_at: string | null;
}

export interface CourseProgress extends CourseProgressTotals {
  course_id: string;
  user_id: string;
  modules: ModuleProgress[];
}

/** Admin list row: one student's progress in a course. */
export interface CourseStudentProgress extends CourseProgressTotals {
  user: { id: string; full_name: string; phone: string };
}

// --- Test statistics -------------------------------------------------------

/** One user's results in one test. */
export interface TestStats {
  test_id: string;
  kind: TestKind;
  title: string | null;
  module_id: string;
  /** null for a module test. */
  lesson_id: string | null;
  lesson_title: string | null;
  total_points: number;
  pass_score: number;
  question_count: number;
  attempts: number;
  best_percent: number | null;
  last_percent: number | null;
  average_percent: number | null;
  /** null when not attempted yet. */
  first_attempt_passed: boolean | null;
  passed: boolean;
  passed_at: string | null;
  earned_points: number;
  /** Correct answers / answered questions over all attempts, 0-100. */
  accuracy_percent: number | null;
  last_attempt_at: string | null;
}

export interface ModuleTestStats {
  module_id: string;
  title: string;
  position: number;
  total_points: number;
  earned_points: number;
  /** Average best percent of the attempted tests of the module. */
  average_best_percent: number | null;
  tests: TestStats[];
}

/** One user's test statistics in a course. */
export interface CourseTestStats {
  course_id: string;
  user_id: string;
  tests_total: number;
  tests_attempted: number;
  tests_passed: number;
  total_attempts: number;
  /** Average best percent of the attempted tests. */
  average_best_percent: number | null;
  /** Share of passed tests that were passed on the first attempt, 0-100. */
  first_try_pass_rate: number | null;
  total_points: number;
  earned_points: number;
  /** earned_points / total_points, 0-100. */
  score_percent: number;
  correct_answers: number;
  answered_questions: number;
  accuracy_percent: number | null;
  modules: ModuleTestStats[];
}

// --- Real-time (socket.io, namespace `/learning`) -----------------------------

/** Ack of every client -> server event. */
export type WsAck<T> = { ok: true; data: T } | { ok: false; error: { status_code: number; message: string } };

export interface VideoCompletedEvent {
  course_id: string;
  lesson_id: string;
}

export interface LessonCompletedEvent {
  course_id: string;
  lesson_id: string;
  /** The lesson that opened next (null when the next step is a module test or the course is finished). */
  next_lesson_id: string | null;
  /** The module test that opened next. */
  next_test_id: string | null;
}

export interface ModuleTestResultEvent {
  course_id: string;
  module_id: string;
  test: ModuleTestProgress;
}

export interface ModuleCompletedEvent {
  course_id: string;
  module_id: string;
  /** First lesson of the next module; null when the course is finished. */
  next_lesson_id: string | null;
  next_test_id: string | null;
}

/** Sent to admins watching a course: a lesson changed (`progress`) or a module test was graded (`module_test`). */
export interface StudentProgressEvent {
  course_id: string;
  user_id: string;
  lesson_id: string | null;
  module_id: string | null;
  progress: LessonProgress | null;
  module_test: ModuleTestProgress | null;
}

export const LEARNING_WS_NAMESPACE = '/learning';

/** socket.io event names of the `/learning` namespace. */
export const LEARNING_WS_EVENTS = {
  // client -> server (every one answers through the ack callback with WsAck<T>)
  /** Player heartbeat: { lesson_id, from, to, position? } -> LessonProgress. */
  WATCH: 'progress:watch',
  /** { lesson_id } -> LessonProgress. Use on (re)connect to resume. */
  GET_LESSON: 'progress:get',
  /** Admin: { course_id } -> start/stop receiving STUDENT_PROGRESS of that course. */
  ADMIN_WATCH_COURSE: 'admin:watch-course',
  ADMIN_UNWATCH_COURSE: 'admin:unwatch-course',
  // server -> client
  /** LessonProgress, after every change (watch, test, completion; also from other tabs/devices). */
  LESSON_PROGRESS: 'progress:lesson',
  VIDEO_COMPLETED: 'progress:video-completed',
  LESSON_COMPLETED: 'progress:lesson-completed',
  MODULE_TEST_RESULT: 'progress:module-test',
  MODULE_COMPLETED: 'progress:module-completed',
  STUDENT_PROGRESS: 'admin:student-progress',
} as const;
