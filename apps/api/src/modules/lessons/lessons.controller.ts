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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Lesson, LessonDetail, LessonMaterial } from '@nestjs-template/types';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateLessonDto, UpdateLessonDto } from './dto/create-lesson.dto';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/create-material.dto';
import { LessonDetailDto, LessonDto, LessonMaterialDto } from './dto/lesson-response.dto';
import { LessonsService } from './lessons.service';

@ApiTags('lessons')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Lesson page: video, guide, materials, test summary' })
  @ApiOkResponse({ type: LessonDetailDto })
  @ApiForbiddenResponse({ description: 'Lesson is locked' })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<LessonDetail> {
    return this.lessonsService.findDetail(user, id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: create a lesson' })
  @ApiCreatedResponse({ type: LessonDto })
  create(@Body() dto: CreateLessonDto): Promise<Lesson> {
    return this.lessonsService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update a lesson' })
  @ApiOkResponse({ type: LessonDto })
  @ApiNotFoundResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonDto): Promise<Lesson> {
    return this.lessonsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a lesson' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.lessonsService.remove(id);
  }

  @Post(':id/materials')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: add a material (guide file) to a lesson' })
  @ApiCreatedResponse({ type: LessonMaterialDto })
  @ApiNotFoundResponse()
  addMaterial(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMaterialDto): Promise<LessonMaterial> {
    return this.lessonsService.addMaterial(id, dto);
  }

  @Patch('materials/:materialId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update a material' })
  @ApiOkResponse({ type: LessonMaterialDto })
  @ApiNotFoundResponse()
  updateMaterial(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<LessonMaterial> {
    return this.lessonsService.updateMaterial(materialId, dto);
  }

  @Delete('materials/:materialId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a material' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removeMaterial(@Param('materialId', ParseUUIDPipe) materialId: string): Promise<void> {
    return this.lessonsService.removeMaterial(materialId);
  }
}
