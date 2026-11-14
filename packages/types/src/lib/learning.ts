// Learning shapes: course -> modules -> lessons -> test, plus per-user progress.

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

export interface LessonMaterial {
  id: string;
  lesson_id: string;
  title: string;
  url: string;
  position: number;
}

/** Short test info shown on a lesson (no questions). */
export interface LessonTestSummary {
  id: string;
  title: string | null;
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
  video_url: string | null;
  video_duration: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface LessonDetail extends Lesson {
  materials: LessonMaterial[];
  test: LessonTestSummary | null;
}

/** Lesson without heavy fields, used in course outlines. */
export interface LessonOutline {
  id: string;
  title: string;
  position: number;
  video_duration: number | null;
  has_test: boolean;
}

export interface CourseModuleOutline extends CourseModule {
  lessons: LessonOutline[];
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
  points: number;
  position: number;
  /** True when more than one option is correct (the student may pick several). */
  multiple: boolean;
  options: TestOptionPublic[];
}

export interface TestQuestionAdmin extends Omit<TestQuestionPublic, 'options'> {
  options: TestOptionAdmin[];
}

export interface LessonTestPublic {
  id: string;
  lesson_id: string;
  title: string | null;
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
  last_watch_at: string | null;
  completed_at: string | null;
}

export interface LessonProgressItem extends LessonProgress {
  title: string;
  position: number;
}

export interface ModuleProgress {
  module_id: string;
  title: string;
  position: number;
  total_lessons: number;
  completed_lessons: number;
  percent: number;
  lessons: LessonProgressItem[];
}

export interface CourseProgressTotals {
  total_lessons: number;
  completed_lessons: number;
  /** completed_lessons / total_lessons, 0-100. */
  percent: number;
  /** Sum of all lesson video durations. */
  total_video_seconds: number;
  watched_seconds: number;
  total_watch_seconds: number;
  /** The lesson to continue with, null when the course is finished. */
  current_lesson_id: string | null;
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
