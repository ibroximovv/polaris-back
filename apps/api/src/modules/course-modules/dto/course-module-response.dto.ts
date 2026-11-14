import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CourseModule } from '@nestjs-template/types';

export class CourseModuleDto implements CourseModule {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) course_id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}
