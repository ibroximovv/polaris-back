import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class QuestionPointsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  question_id!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 10000,
    description: 'Omit or null = automatic share',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  points?: number | null;
}

/** Sets the lesson's total and any question's points in one validated step. */
export class SetTestPointsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 10000, description: 'Points the lesson is worth' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  total_points?: number;

  @ApiPropertyOptional({ type: [QuestionPointsDto], description: 'Questions not listed keep their points' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuestionPointsDto)
  questions?: QuestionPointsDto[];
}
