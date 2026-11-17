import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { LessonMaterial, LessonVideo } from '@nestjs-template/types';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AddMaterialsDto,
  ReorderMaterialsDto,
  SetVideoDto,
  UpdateMaterialDto,
  VideoFieldsDto,
} from './dto/lesson-media.dto';
import { LessonMaterialDto, LessonVideoDto } from './dto/lesson-media-response.dto';
import { LessonMediaService } from './lesson-media.service';
import { LessonsService } from './lessons.service';

/** Files are uploaded through POST /uploads first; these routes attach them by upload_id. */
@ApiTags('lesson media')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class LessonMediaController {
  constructor(
    private readonly mediaService: LessonMediaService,
    private readonly lessonsService: LessonsService,
  ) {}

  // --- Video (one per lesson) -----------------------------------------------

  @Put(':id/video')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: set the lesson video from an upload_id or an external url (replaces the current one)' })
  @ApiOkResponse({ type: LessonVideoDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse({ description: 'The upload is already attached' })
  @ApiUnsupportedMediaTypeResponse({ description: 'The upload is not a video' })
  @ApiNotFoundResponse()
  setVideo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetVideoDto): Promise<LessonVideo> {
    return this.mediaService.setVideo(id, dto);
  }

  @Patch(':id/video')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update the video title or duration' })
  @ApiOkResponse({ type: LessonVideoDto })
  @ApiNotFoundResponse()
  updateVideo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VideoFieldsDto): Promise<LessonVideo> {
    return this.mediaService.updateVideo(id, dto);
  }

  @Delete(':id/video')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: remove the lesson video (and its uploaded file)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removeVideo(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.mediaService.removeVideo(id);
  }

  // --- Materials (guide files, images) -----------------------------------------

  @Get(':id/materials')
  @ApiOperation({ summary: 'Lesson materials in display order, with signed links' })
  @ApiOkResponse({ type: [LessonMaterialDto] })
  @ApiForbiddenResponse({ description: 'Lesson is locked' })
  @ApiNotFoundResponse()
  listMaterials(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<LessonMaterial[]> {
    return this.lessonsService.listMaterials(user, id);
  }

  @Post(':id/materials')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: attach uploads and/or links as materials (appended in the given order; no videos)' })
  @ApiCreatedResponse({ type: [LessonMaterialDto] })
  @ApiBadRequestResponse()
  @ApiConflictResponse({ description: 'An upload is already attached' })
  @ApiUnsupportedMediaTypeResponse({ description: 'A video upload' })
  @ApiNotFoundResponse()
  addMaterials(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMaterialsDto): Promise<LessonMaterial[]> {
    return this.mediaService.addMaterials(id, dto);
  }

  @Put(':id/materials/order')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: reorder materials (all ids, new order)' })
  @ApiOkResponse({ type: [LessonMaterialDto] })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  reorderMaterials(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderMaterialsDto): Promise<LessonMaterial[]> {
    return this.mediaService.reorderMaterials(id, dto);
  }

  @Patch('materials/:materialId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update a material title or type' })
  @ApiOkResponse({ type: LessonMaterialDto })
  @ApiNotFoundResponse()
  updateMaterial(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<LessonMaterial> {
    return this.mediaService.updateMaterial(materialId, dto);
  }

  @Delete('materials/:materialId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a material (and its uploaded file)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removeMaterial(@Param('materialId', ParseUUIDPipe) materialId: string): Promise<void> {
    return this.mediaService.removeMaterial(materialId);
  }
}
