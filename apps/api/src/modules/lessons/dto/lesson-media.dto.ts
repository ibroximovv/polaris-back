import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { MaterialType } from '@nestjs-template/types';

export const MATERIAL_TYPES: MaterialType[] = ['IMAGE', 'FILE'];

class TitleDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Dars konspekti' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;
}

export class VideoFieldsDto extends TitleDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description: 'Video length in seconds. Required for the video to be tracked and required for completion',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number | null;
}

/** The lesson video: a file from POST /uploads or an external link, exactly one. */
export class SetVideoDto extends VideoFieldsDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'id from POST /uploads (a video file)' })
  @IsOptional()
  @IsUUID()
  upload_id?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/lesson-1.m3u8', description: 'External link instead of an upload' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;
}

/** One material: a file from POST /uploads or an external link, exactly one. */
export class AttachMaterialDto extends TitleDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'id from POST /uploads (not a video)' })
  @IsOptional()
  @IsUUID()
  upload_id?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/lesson-1.pdf' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;

  @ApiPropertyOptional({ enum: MATERIAL_TYPES, description: 'Default: IMAGE for image uploads, FILE otherwise' })
  @IsOptional()
  @IsIn(MATERIAL_TYPES)
  type?: MaterialType;
}

export class AddMaterialsDto {
  @ApiProperty({ type: [AttachMaterialDto], description: 'Appended at the end in this order' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AttachMaterialDto)
  items!: AttachMaterialDto[];
}

export class UpdateMaterialDto extends TitleDto {
  @ApiPropertyOptional({ enum: MATERIAL_TYPES })
  @IsOptional()
  @IsIn(MATERIAL_TYPES)
  type?: MaterialType;
}

export class ReorderMaterialsDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Every material id of the lesson, in the new order' })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  material_ids!: string[];
}
