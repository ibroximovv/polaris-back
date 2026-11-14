import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Lesson, LessonDetail, LessonMaterial, LessonTestSummary } from '@nestjs-template/types';

export class LessonDto implements Lesson {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) module_id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) content!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) video_url!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) video_duration!: number | null;
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class LessonMaterialDto implements LessonMaterial {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) lesson_id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() url!: string;
  @ApiProperty() position!: number;
}

export class LessonTestSummaryDto implements LessonTestSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiProperty() pass_score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) max_attempts!: number | null;
  @ApiProperty() question_count!: number;
}

export class LessonDetailDto extends LessonDto implements LessonDetail {
  @ApiProperty({ type: [LessonMaterialDto] }) materials!: LessonMaterialDto[];
  @ApiPropertyOptional({ type: LessonTestSummaryDto, nullable: true }) test!: LessonTestSummaryDto | null;
}
