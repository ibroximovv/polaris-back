import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PresignedUpload, Upload, UploadStatus } from '@nestjs-template/types';

export class UploadDto implements Upload {
  @ApiProperty({ format: 'uuid', description: 'Pass it as upload_id to attach the file' }) id!: string;
  @ApiProperty() file_name!: string;
  @ApiProperty() mime_type!: string;
  @ApiProperty({ description: 'Bytes' }) size!: number;
  @ApiProperty({ enum: ['PENDING', 'READY'] }) status!: UploadStatus;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Signed link; null while PENDING' })
  url!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) url_expires_at!: string | null;
  @ApiProperty({ description: 'Already attached to a lesson video or material' }) attached!: boolean;
  @ApiProperty({ format: 'date-time' }) created_at!: string;
}

class PresignedFormDto {
  @ApiProperty({ enum: ['POST'] }) method!: 'POST';
  @ApiProperty() url!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) fields!: Record<string, string>;
  @ApiProperty({ enum: ['file'] }) file_field!: 'file';
  @ApiProperty() max_size!: number;
  @ApiProperty({ format: 'date-time' }) expires_at!: string;
}

export class PresignedUploadDto implements PresignedUpload {
  @ApiProperty({ type: UploadDto }) upload!: UploadDto;
  @ApiProperty({ type: PresignedFormDto }) form!: PresignedFormDto;
}
