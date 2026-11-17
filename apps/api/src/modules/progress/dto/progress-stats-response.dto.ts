import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CourseTestStats, ModuleTestStats, TestKind, TestStats } from '@nestjs-template/types';

const nullableInt = { type: Number, nullable: true } as const;

export class TestStatsDto implements TestStats {
  @ApiProperty({ format: 'uuid' }) test_id!: string;
  @ApiProperty({ enum: ['LESSON', 'MODULE'] }) kind!: TestKind;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ format: 'uuid' }) module_id!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) lesson_id!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lesson_title!: string | null;
  @ApiProperty() total_points!: number;
  @ApiProperty() pass_score!: number;
  @ApiProperty() question_count!: number;
  @ApiProperty() attempts!: number;
  @ApiPropertyOptional(nullableInt) best_percent!: number | null;
  @ApiPropertyOptional(nullableInt) last_percent!: number | null;
  @ApiPropertyOptional(nullableInt) average_percent!: number | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) first_attempt_passed!: boolean | null;
  @ApiProperty() passed!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) passed_at!: string | null;
  @ApiProperty({ description: 'best_percent of total_points' }) earned_points!: number;
  @ApiPropertyOptional({ ...nullableInt, description: 'Correct / answered questions over all attempts' })
  accuracy_percent!: number | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) last_attempt_at!: string | null;
}

export class ModuleTestStatsDto implements ModuleTestStats {
  @ApiProperty({ format: 'uuid' }) module_id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiProperty() total_points!: number;
  @ApiProperty() earned_points!: number;
  @ApiPropertyOptional(nullableInt) average_best_percent!: number | null;
  @ApiProperty({ type: [TestStatsDto], description: 'Lesson tests in order, then the module test' })
  tests!: TestStatsDto[];
}

export class CourseTestStatsDto implements CourseTestStats {
  @ApiProperty({ format: 'uuid' }) course_id!: string;
  @ApiProperty({ format: 'uuid' }) user_id!: string;
  @ApiProperty() tests_total!: number;
  @ApiProperty() tests_attempted!: number;
  @ApiProperty() tests_passed!: number;
  @ApiProperty() total_attempts!: number;
  @ApiPropertyOptional(nullableInt) average_best_percent!: number | null;
  @ApiPropertyOptional({ ...nullableInt, description: 'Passed tests passed on the first attempt, %' })
  first_try_pass_rate!: number | null;
  @ApiProperty() total_points!: number;
  @ApiProperty() earned_points!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) score_percent!: number;
  @ApiProperty() correct_answers!: number;
  @ApiProperty() answered_questions!: number;
  @ApiPropertyOptional(nullableInt) accuracy_percent!: number | null;
  @ApiProperty({ type: [ModuleTestStatsDto] }) modules!: ModuleTestStatsDto[];
}
