import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  CourseTestStats,
  CourseProgress,
  CourseStudentProgress,
  LessonProgress,
  PaginatedResponse,
} from '@nestjs-template/types';
import { ApiPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CourseProgressDto, CourseStudentProgressDto, LessonProgressDto } from './dto/progress-response.dto';
import { CourseTestStatsDto } from './dto/progress-stats-response.dto';
import { RecordWatchDto } from './dto/record-watch.dto';
import { ProgressStatsService } from './progress-stats.service';
import { ProgressService } from './progress.service';

@ApiTags('progress')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class ProgressController {
  constructor(
    private readonly progressService: ProgressService,
    private readonly statsService: ProgressStatsService,
  ) {}

  @Get('lessons/:lessonId')
  @ApiOperation({ summary: 'My progress in a lesson' })
  @ApiOkResponse({ type: LessonProgressDto })
  @ApiNotFoundResponse()
  lesson(@CurrentUser() user: AuthUser, @Param('lessonId', ParseUUIDPipe) lessonId: string): Promise<LessonProgress> {
    return this.progressService.getLessonProgress(user, lessonId);
  }

  @Post('lessons/:lessonId/watch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a watched video segment (player heartbeat). Prefer the socket.io progress:watch event' })
  @ApiOkResponse({ type: LessonProgressDto })
  @ApiForbiddenResponse({ description: 'Lesson is locked' })
  watch(
    @CurrentUser() user: AuthUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: RecordWatchDto,
  ): Promise<LessonProgress> {
    return this.progressService.recordWatch(user, lessonId, dto);
  }

  @Post('lessons/:lessonId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish a lesson (video watched and test passed)' })
  @ApiOkResponse({ type: LessonProgressDto })
  @ApiForbiddenResponse({ description: 'Lesson is locked' })
  complete(@CurrentUser() user: AuthUser, @Param('lessonId', ParseUUIDPipe) lessonId: string): Promise<LessonProgress> {
    return this.progressService.completeLesson(user, lessonId);
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'My progress in a course: modules, lessons, percentages' })
  @ApiOkResponse({ type: CourseProgressDto })
  @ApiNotFoundResponse()
  course(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string): Promise<CourseProgress> {
    return this.progressService.getCourseProgress(user, courseId);
  }

  @Get('courses/:courseId/stats')
  @ApiOperation({ summary: 'My test statistics in a course: per test, per module and totals' })
  @ApiOkResponse({ type: CourseTestStatsDto })
  @ApiNotFoundResponse()
  stats(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string): Promise<CourseTestStats> {
    return this.statsService.getCourseTestStats(user, courseId);
  }

  @Get('courses/:courseId/students/:userId/stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: "Admin: a student's test statistics in a course" })
  @ApiOkResponse({ type: CourseTestStatsDto })
  @ApiNotFoundResponse()
  studentStats(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<CourseTestStats> {
    return this.statsService.getCourseTestStats(user, courseId, userId);
  }

  @Get('courses/:courseId/students')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: progress of every student in a course (sort_by: full_name)' })
  @ApiPaginatedResponse(CourseStudentProgressDto)
  students(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<CourseStudentProgress>> {
    return this.progressService.listCourseStudents(courseId, query);
  }

  @Get('courses/:courseId/students/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: "Admin: one student's detailed progress in a course" })
  @ApiOkResponse({ type: CourseProgressDto })
  @ApiNotFoundResponse()
  student(
    @CurrentUser() user: AuthUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<CourseProgress> {
    return this.progressService.getCourseProgress(user, courseId, userId);
  }
}
