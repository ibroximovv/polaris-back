import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Course, CourseDetail, CourseModuleOutline, LessonOutline } from '@nestjs-template/types';

export class CourseDto implements Course {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cover_url!: string | null;
  @ApiProperty() is_published!: boolean;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
}

export class LessonOutlineDto implements LessonOutline {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) video_duration!: number | null;
  @ApiProperty() has_test!: boolean;
}

export class CourseModuleOutlineDto implements CourseModuleOutline {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) course_id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
  @ApiProperty({ format: 'date-time' }) updated_at!: string;
  @ApiProperty({ type: [LessonOutlineDto] }) lessons!: LessonOutlineDto[];
}

export class CourseDetailDto extends CourseDto implements CourseDetail {
  @ApiProperty({ type: [CourseModuleOutlineDto] }) modules!: CourseModuleOutlineDto[];
}
