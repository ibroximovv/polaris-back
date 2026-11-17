import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateLessonDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  module_id!: string;

  @ApiProperty({ example: 'Samarqand tarixi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Written guide (markdown)' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  content?: string | null;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Order inside the module (ascending)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

/** A lesson cannot be moved to another module. */
export class UpdateLessonDto extends PartialType(OmitType(CreateLessonDto, ['module_id'] as const)) {}
