import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CourseProgress,
  CourseStudentProgress,
  LessonProgress,
  LessonProgressItem,
  LessonStatus,
  ModuleProgress,
  ModuleTestProgress,
} from '@nestjs-template/types';

const LESSON_STATUSES: LessonStatus[] = ['locked', 'available', 'in_progress', 'completed'];

export class LessonProgressDto implements LessonProgress {
  @ApiProperty({ format: 'uuid' }) lesson_id!: string;
  @ApiProperty({ enum: LESSON_STATUSES }) status!: LessonStatus;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Tracked video length, seconds' })
  video_duration!: number | null;
  @ApiProperty({ description: 'Unique seconds of the video watched' }) watched_seconds!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) watched_percent!: number;
  @ApiProperty({ description: 'All watch time including rewatching, seconds' }) total_watch_seconds!: number;
  @ApiProperty({ description: 'Resume point, seconds' }) last_position!: number;
  @ApiProperty() video_completed!: boolean;
  @ApiProperty() has_test!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) best_test_percent!: number | null;
  @ApiProperty() test_passed!: boolean;
  @ApiProperty({ description: 'Points the lesson test is worth' }) test_points!: number;
  @ApiProperty({ description: 'best_test_percent of test_points' }) earned_points!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) last_watch_at!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) completed_at!: string | null;
}

export class LessonProgressItemDto extends LessonProgressDto implements LessonProgressItem {
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
}

export class ModuleTestProgressDto implements ModuleTestProgress {
  @ApiProperty({ format: 'uuid' }) test_id!: string;
  @ApiProperty({ enum: LESSON_STATUSES, description: 'locked until every lesson of the module is completed' })
  status!: LessonStatus;
  @ApiPropertyOptional({ type: Number, nullable: true }) best_test_percent!: number | null;
  @ApiProperty() test_passed!: boolean;
  @ApiProperty() test_points!: number;
  @ApiProperty() earned_points!: number;
}

export class ModuleProgressDto implements ModuleProgress {
  @ApiProperty({ format: 'uuid' }) module_id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiProperty() total_lessons!: number;
  @ApiProperty() completed_lessons!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) percent!: number;
  @ApiProperty({ description: 'Every lesson completed and the final test passed' }) completed!: boolean;
  @ApiProperty({ type: [LessonProgressItemDto] }) lessons!: LessonProgressItemDto[];
  @ApiPropertyOptional({ type: ModuleTestProgressDto, nullable: true }) test!: ModuleTestProgressDto | null;
}

class CourseProgressTotalsDto {
  @ApiProperty() total_modules!: number;
  @ApiProperty() completed_modules!: number;
  @ApiProperty() total_lessons!: number;
  @ApiProperty() completed_lessons!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) percent!: number;
  @ApiProperty() total_video_seconds!: number;
  @ApiProperty() watched_seconds!: number;
  @ApiProperty() total_watch_seconds!: number;
  @ApiProperty({ description: 'Sum of lesson and module test points' }) total_points!: number;
  @ApiProperty({ description: 'Points earned from best test results' }) earned_points!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Next lesson to take' })
  current_lesson_id!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Next step is this module test' })
  current_test_id!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) last_activity_at!: string | null;
}

export class CourseProgressDto extends CourseProgressTotalsDto implements CourseProgress {
  @ApiProperty({ format: 'uuid' }) course_id!: string;
  @ApiProperty({ format: 'uuid' }) user_id!: string;
  @ApiProperty({ type: [ModuleProgressDto] }) modules!: ModuleProgressDto[];
}

class StudentRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() full_name!: string;
  @ApiProperty() phone!: string;
}

export class CourseStudentProgressDto extends CourseProgressTotalsDto implements CourseStudentProgress {
  @ApiProperty({ type: StudentRefDto }) user!: StudentRefDto;
}
