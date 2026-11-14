import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CourseModule } from '@nestjs-template/types';
import { createCrudController } from '../../common/base/base.controller';
import { BEARER_AUTH } from '../../swagger/swagger.setup';
import { Roles } from '../auth/decorators/roles.decorator';
import { CourseModulesService } from './course-modules.service';
import { CourseModuleDto } from './dto/course-module-response.dto';
import { CreateCourseModuleDto, UpdateCourseModuleDto } from './dto/create-course-module.dto';

@ApiTags('course-modules')
@ApiBearerAuth(BEARER_AUTH)
@Roles('ADMIN')
@Controller()
export class CourseModulesController extends createCrudController<
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
  CourseModule,
  string
>({
  name: 'course module',
  createDto: CreateCourseModuleDto,
  updateDto: UpdateCourseModuleDto,
  responseDto: CourseModuleDto,
  idType: 'uuid',
}) {
  constructor(protected readonly service: CourseModulesService) {
    super();
  }
}
