import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Matches, MaxLength, Min } from 'class-validator';

/** Large files: the browser uploads straight to MinIO with the returned form. */
export class CreatePresignedUploadDto {
  @ApiProperty({ example: 'samarqand-1.mp4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  file_name!: string;

  @ApiProperty({ example: 'video/mp4' })
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, { message: 'mime_type must be a MIME type like video/mp4' })
  mime_type!: string;

  @ApiProperty({ example: 524288000, description: 'File size in bytes' })
  @IsInt()
  @Min(1)
  size!: number;
}
