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
  @ApiProperty() points!: number;
  @ApiProperty() position!: number;
  @ApiProperty({ description: 'More than one option is correct' }) multiple!: boolean;
}

export class TestQuestionPublicDto extends TestQuestionBaseDto implements TestQuestionPublic {
  @ApiProperty({ type: [TestOptionPublicDto] }) options!: TestOptionPublicDto[];
}

export class TestQuestionAdminDto extends TestQuestionBaseDto implements TestQuestionAdmin {
  @ApiProperty({ type: [TestOptionAdminDto] }) options!: TestOptionAdminDto[];
}

class LessonTestBaseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) lesson_id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
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
  @ApiProperty() pass_score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) max_attempts!: number | null;
  @ApiProperty() attempts_used!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) attempts_left!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) best_percent!: number | null;
  @ApiProperty() passed!: boolean;
  @ApiProperty({ type: [TestAttemptSummaryDto] }) attempts!: TestAttemptSummaryDto[];
}
