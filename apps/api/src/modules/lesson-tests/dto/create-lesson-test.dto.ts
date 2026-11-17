import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateQuestionDto } from './create-question.dto';

export class CreateLessonTestDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Lesson test: send lesson_id (a lesson has at most one test)' })
  @IsOptional()
  @IsUUID()
  lesson_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "Module final test: send module_id instead (a module has at most one). It opens after the module's lessons",
  })
  @IsOptional()
  @IsUUID()
  module_id?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10000,
    default: 100,
    description: 'Points the lesson is worth. Questions without explicit points share what is left evenly',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  total_points?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 70, description: 'Percent needed to pass' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  pass_score?: number;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, description: 'null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_attempts?: number | null;

  @ApiPropertyOptional({ type: [CreateQuestionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

/** Test settings only; questions are edited through their own routes. */
export class UpdateLessonTestDto extends PartialType(
  OmitType(CreateLessonTestDto, ['lesson_id', 'module_id', 'questions'] as const),
) {}
