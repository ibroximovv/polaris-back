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
} from '@nestjs/swagger';
import type {
  LessonTestAdmin,
  LessonTestPublic,
  TestAttemptHistory,
  TestAttemptResult,
} from '@nestjs-template/types';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateLessonTestDto, UpdateLessonTestDto } from './dto/create-lesson-test.dto';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/create-question.dto';
import {
  LessonTestAdminDto,
  LessonTestPublicDto,
  TestAttemptHistoryDto,
  TestAttemptResultDto,
} from './dto/lesson-test-response.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { LessonTestsService } from './lesson-tests.service';

@ApiTags('tests')
@ApiBearerAuth(BEARER_AUTH)
@Controller()
export class LessonTestsController {
  constructor(private readonly testsService: LessonTestsService) {}

  // --- Student --------------------------------------------------------------

  @Get(':id')
  @ApiOperation({ summary: 'Test questions (without correct answers)' })
  @ApiOkResponse({ type: LessonTestPublicDto })
  @ApiForbiddenResponse({ description: 'Lesson is locked' })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<LessonTestPublic> {
    return this.testsService.getPublicTest(user, id);
  }

  @Post(':id/attempts')
  @ApiOperation({ summary: 'Submit answers; graded on the server. Requires the lesson video to be watched' })
  @ApiCreatedResponse({ type: TestAttemptResultDto })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse({ description: 'Lesson is locked or no attempts left' })
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAttemptDto,
  ): Promise<TestAttemptResult> {
    return this.testsService.submitAttempt(user, id, dto);
  }

  @Get(':id/attempts/me')
  @ApiOperation({ summary: 'My attempts of a test' })
  @ApiOkResponse({ type: TestAttemptHistoryDto })
  @ApiNotFoundResponse()
  myAttempts(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TestAttemptHistory> {
    return this.testsService.getAttemptHistory(id, user.id);
  }

  // --- Admin ----------------------------------------------------------------

  @Get(':id/attempts/users/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: "Admin: a student's attempts of a test" })
  @ApiOkResponse({ type: TestAttemptHistoryDto })
  @ApiNotFoundResponse()
  userAttempts(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<TestAttemptHistory> {
    return this.testsService.getAttemptHistory(id, userId);
  }

  @Get(':id/full')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: test with correct answers' })
  @ApiOkResponse({ type: LessonTestAdminDto })
  @ApiNotFoundResponse()
  findFull(@Param('id', ParseUUIDPipe) id: string): Promise<LessonTestAdmin> {
    return this.testsService.getAdminTest(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: create the test of a lesson (questions may be included)' })
  @ApiCreatedResponse({ type: LessonTestAdminDto })
  @ApiConflictResponse({ description: 'The lesson already has a test' })
  create(@Body() dto: CreateLessonTestDto): Promise<LessonTestAdmin> {
    return this.testsService.createTest(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update test settings (title, pass_score, max_attempts)' })
  @ApiOkResponse({ type: LessonTestAdminDto })
  @ApiNotFoundResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonTestDto): Promise<LessonTestAdmin> {
    return this.testsService.updateTest(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a test with its questions and attempts' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.testsService.remove(id);
  }

  @Post(':id/questions')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: add a question' })
  @ApiCreatedResponse({ type: LessonTestAdminDto })
  @ApiNotFoundResponse()
  addQuestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateQuestionDto): Promise<LessonTestAdmin> {
    return this.testsService.addQuestion(id, dto);
  }

  @Patch('questions/:questionId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: update a question (sending options replaces them all)' })
  @ApiOkResponse({ type: LessonTestAdminDto })
  @ApiNotFoundResponse()
  updateQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: UpdateQuestionDto,
  ): Promise<LessonTestAdmin> {
    return this.testsService.updateQuestion(questionId, dto);
  }

  @Delete('questions/:questionId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: delete a question' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removeQuestion(@Param('questionId', ParseUUIDPipe) questionId: string): Promise<void> {
    return this.testsService.removeQuestion(questionId);
  }
}
