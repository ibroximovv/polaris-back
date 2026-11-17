import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOptionDto {
  @ApiProperty({ example: 'Registon' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  is_correct!: boolean;

  @ApiPropertyOptional({ minimum: 0, description: 'Defaults to the index in the list' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 'Samarqanddagi qaysi ansambl uchta madrasadan iborat?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 10000,
    description: 'Explicit points. Omit or null = an even share of what the test total leaves (default rule)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  points?: number | null;

  @ApiPropertyOptional({ minimum: 0, description: 'Defaults to the index in the list' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiProperty({ type: [CreateOptionDto], description: 'At least 2 options, at least one correct' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options!: CreateOptionDto[];
}

/** When `options` is sent, the question's options are replaced entirely. */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}
