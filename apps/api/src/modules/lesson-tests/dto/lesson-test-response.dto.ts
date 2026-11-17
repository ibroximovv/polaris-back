import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  LessonTestAdmin,
  LessonTestPublic,
  TestAnswerResult,
  TestAttemptHistory,
  TestAttemptResult,
  TestAttemptSummary,
  TestOptionAdmin,
  TestOptionPublic,
  TestQuestionAdmin,
  TestKind,
  TestQuestionPublic,
} from '@nestjs-template/types';

export class TestOptionPublicDto implements TestOptionPublic {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() position!: number;
}

export class TestOptionAdminDto extends TestOptionPublicDto implements TestOptionAdmin {
  @ApiProperty() is_correct!: boolean;
}

class TestQuestionBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ description: 'Effective points (explicit or the automatic share)' }) points!: number;
  @ApiProperty() position!: number;
  @ApiProperty({ description: 'More than one option is correct' }) multiple!: boolean;
}

export class TestQuestionPublicDto extends TestQuestionBaseDto implements TestQuestionPublic {
  @ApiProperty({ type: [TestOptionPublicDto] }) options!: TestOptionPublicDto[];
}

export class TestQuestionAdminDto extends TestQuestionBaseDto implements TestQuestionAdmin {
  @ApiProperty({ description: 'points comes from the default rule (no explicit points)' }) points_auto!: boolean;
  @ApiProperty({ type: [TestOptionAdminDto] }) options!: TestOptionAdminDto[];
}

class LessonTestBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['LESSON', 'MODULE'] }) kind!: TestKind;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Set for a lesson test' })
  lesson_id!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: "Set for a module's final test" })
  module_id!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ description: 'Points the lesson is worth' }) total_points!: number;
  @ApiProperty({ description: 'Sum of effective question points' }) max_score!: number;
  @ApiProperty() pass_score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) max_attempts!: number | null;
}

export class LessonTestPublicDto extends LessonTestBaseDto implements LessonTestPublic {
  @ApiProperty({ type: [TestQuestionPublicDto] }) questions!: TestQuestionPublicDto[];
}

export class LessonTestAdminDto extends LessonTestBaseDto implements LessonTestAdmin {
  @ApiProperty({ type: [TestQuestionAdminDto] }) questions!: TestQuestionAdminDto[];
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class TestAnswerResultDto implements TestAnswerResult {
  @ApiProperty({ format: 'uuid' }) question_id!: string;
  @ApiProperty() is_correct!: boolean;
  @ApiProperty() points!: number;
}

export class TestAttemptSummaryDto implements TestAttemptSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() score!: number;
  @ApiProperty() max_score!: number;
  @ApiProperty() percent!: number;
  @ApiProperty() passed!: boolean;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
}

export class TestAttemptResultDto extends TestAttemptSummaryDto implements TestAttemptResult {
  @ApiProperty({ format: 'uuid' }) test_id!: string;
  @ApiProperty({ format: 'uuid' }) user_id!: string;
  @ApiProperty({ type: [TestAnswerResultDto] }) answers!: TestAnswerResultDto[];
}

export class TestAttemptHistoryDto implements TestAttemptHistory {
  @ApiProperty({ format: 'uuid' }) test_id!: string;
  @ApiProperty() total_points!: number;
  @ApiProperty() pass_score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) max_attempts!: number | null;
  @ApiProperty() attempts_used!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) attempts_left!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) best_percent!: number | null;
  @ApiProperty() passed!: boolean;
  @ApiProperty({ type: [TestAttemptSummaryDto] }) attempts!: TestAttemptSummaryDto[];
}
