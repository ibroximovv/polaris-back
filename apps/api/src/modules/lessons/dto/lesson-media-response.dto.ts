import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LessonMaterial, LessonVideo, MaterialType, MediaSource } from '@nestjs-template/types';

export class LessonVideoDto implements LessonVideo {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) lesson_id!: string;
  @ApiProperty({ enum: ['UPLOAD', 'LINK'] }) source!: MediaSource;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Set for an uploaded file' })
  upload_id!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) file_name!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mime_type!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bytes' }) size!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Seconds; null = not tracked' })
  duration!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Signed or external link' }) url!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) url_expires_at!: string | null;
}

export class LessonMaterialDto implements LessonMaterial {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) lesson_id!: string;
  @ApiProperty({ enum: ['IMAGE', 'FILE'] }) type!: MaterialType;
  @ApiProperty({ enum: ['UPLOAD', 'LINK'] }) source!: MediaSource;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true, description: 'Set for an uploaded file' })
  upload_id!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) title!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) file_name!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mime_type!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Bytes' }) size!: number | null;
  @ApiProperty() position!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Signed or external link' }) url!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) url_expires_at!: string | null;
}
