import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Lesson, LessonDetail, TestKind, TestSummary } from '@nestjs-template/types';
import { LessonMaterialDto, LessonVideoDto } from './lesson-media-response.dto';

export class LessonDto implements Lesson {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) module_id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) content!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

/** Shared by lessons and course outlines. */
export class TestSummaryDto implements TestSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['LESSON', 'MODULE'] }) kind!: TestKind;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ description: 'Points the test is worth' }) total_points!: number;
  @ApiProperty() pass_score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) max_attempts!: number | null;
  @ApiProperty() question_count!: number;
}

export class LessonDetailDto extends LessonDto implements LessonDetail {
  @ApiPropertyOptional({ type: LessonVideoDto, nullable: true }) video!: LessonVideoDto | null;
  @ApiProperty({ type: [LessonMaterialDto], description: 'Guide files and images in display order' })
  materials!: LessonMaterialDto[];
  @ApiPropertyOptional({ type: TestSummaryDto, nullable: true }) test!: TestSummaryDto | null;
}
