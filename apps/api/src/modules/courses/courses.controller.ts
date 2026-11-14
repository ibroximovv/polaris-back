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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Course, CourseDetail, PaginatedResponse } from '@nestjs-template/types';
import { ApiPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CoursesService } from './courses.service';
import { CourseDetailDto, CourseDto } from './dto/course-response.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@ApiTags('courses')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List courses (students see published ones only; sort_by: created_at, title)' })
  @ApiPaginatedResponse(CourseDto)
  findAll(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto): Promise<PaginatedResponse<Course>> {
    return this.coursesService.findAllFor(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Course with its modules and lessons' })
  @ApiOkResponse({ type: CourseDetailDto })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CourseDetail> {
    return this.coursesService.findDetail(user, id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: create a course' })
  @ApiCreatedResponse({ type: CourseDto })
  create(@Body() dto: CreateCourseDto): Promise<Course> {
    return this.coursesService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update a course' })
  @ApiOkResponse({ type: CourseDto })
  @ApiNotFoundResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto): Promise<Course> {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a course with all its modules, lessons and progress' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.coursesService.remove(id);
  }
}
