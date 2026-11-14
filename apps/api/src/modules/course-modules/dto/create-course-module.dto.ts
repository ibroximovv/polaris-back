import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCourseModuleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  course_id!: string;

  @ApiProperty({ example: '1-modul: Kirish' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Order inside the course (ascending)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

/** A module cannot be moved to another course. */
export class UpdateCourseModuleDto extends PartialType(OmitType(CreateCourseModuleDto, ['course_id'] as const)) {}
