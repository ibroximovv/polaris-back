import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { PresignedUpload, Upload } from '@nestjs-template/types';
import { envs } from '../../config/envs';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import { createMulterOptions } from '../../upload/multer.config';
import { ApiFilesUpload } from '../../upload/upload.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePresignedUploadDto } from './dto/create-presigned-upload.dto';
import { PresignedUploadDto, UploadDto } from './dto/upload-response.dto';
import { UploadsService } from './uploads.service';

const MAX_FILES = 20;

/** Media limits (MEDIA_*), not the small global upload defaults. */
const uploadMulterOptions = createMulterOptions({
  UPLOAD_DIR: envs.UPLOAD_DIR,
  UPLOAD_MAX_FILE_SIZE_MB: envs.MEDIA_MAX_FILE_SIZE_MB,
  UPLOAD_MAX_FILES: MAX_FILES,
  UPLOAD_ALLOWED_MIME_TYPES: envs.MEDIA_ALLOWED_MIME_TYPES,
});

@ApiTags('uploads')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiFilesUpload({ maxCount: MAX_FILES, multerOptions: uploadMulterOptions })
  @ApiOperation({
    summary: 'Admin: upload one or more files (video, image, document). Returns upload ids to attach elsewhere',
  })
  @ApiCreatedResponse({ type: [UploadDto] })
  @ApiPayloadTooLargeResponse()
  @ApiUnsupportedMediaTypeResponse()
  upload(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[] | undefined): Promise<Upload[]> {
    return this.uploadsService.upload(user, files ?? []);
  }

  @Post('presigned')
  @ApiOperation({
    summary: 'Admin: large file, step 1. POST the returned form (fields + file) straight to MinIO, then complete',
  })
  @ApiCreatedResponse({ type: PresignedUploadDto })
  @ApiPayloadTooLargeResponse()
  @ApiUnsupportedMediaTypeResponse()
  createPresigned(@CurrentUser() user: AuthUser, @Body() dto: CreatePresignedUploadDto): Promise<PresignedUpload> {
    return this.uploadsService.createPresigned(user, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: large file, step 2. Checks the file is in MinIO and makes the upload usable' })
  @ApiOkResponse({ type: UploadDto })
  @ApiBadRequestResponse({ description: 'The file is not in storage yet' })
  @ApiNotFoundResponse()
  complete(@Param('id', ParseUUIDPipe) id: string): Promise<Upload> {
    return this.uploadsService.complete(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin: an upload with a fresh signed link' })
  @ApiOkResponse({ type: UploadDto })
  @ApiNotFoundResponse()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Upload> {
    return this.uploadsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete an upload that is not attached, with its file' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The upload is attached' })
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.uploadsService.remove(id);
  }
}
