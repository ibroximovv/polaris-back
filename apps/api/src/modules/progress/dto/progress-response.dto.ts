import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CourseProgress,
  CourseStudentProgress,
  LessonProgress,
  LessonProgressItem,
  LessonStatus,
  ModuleProgress,
} from '@nestjs-template/types';

const LESSON_STATUSES: LessonStatus[] = ['locked', 'available', 'in_progress', 'completed'];

export class LessonProgressDto implements LessonProgress {
  @ApiProperty({ format: 'uuid' }) lesson_id!: string;
  @ApiProperty({ enum: LESSON_STATUSES }) status!: LessonStatus;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Seconds' }) video_duration!: number | null;
  @ApiProperty({ description: 'Unique seconds of the video watched' }) watched_seconds!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) watched_percent!: number;
  @ApiProperty({ description: 'All watch time including rewatching, seconds' }) total_watch_seconds!: number;
  @ApiProperty({ description: 'Resume point, seconds' }) last_position!: number;
  @ApiProperty() video_completed!: boolean;
  @ApiProperty() has_test!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) best_test_percent!: number | null;
  @ApiProperty() test_passed!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) last_watch_at!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) completed_at!: string | null;
}

export class LessonProgressItemDto extends LessonProgressDto implements LessonProgressItem {
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
}

export class ModuleProgressDto implements ModuleProgress {
  @ApiProperty({ format: 'uuid' }) module_id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiProperty() total_lessons!: number;
  @ApiProperty() completed_lessons!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) percent!: number;
  @ApiProperty({ type: [LessonProgressItemDto] }) lessons!: LessonProgressItemDto[];
}

class CourseProgressTotalsDto {
  @ApiProperty() total_lessons!: number;
  @ApiProperty() completed_lessons!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) percent!: number;
  @ApiProperty() total_video_seconds!: number;
  @ApiProperty() watched_seconds!: number;
  @ApiProperty() total_watch_seconds!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) current_lesson_id!: string | null;
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
