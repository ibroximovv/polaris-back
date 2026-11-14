import { Injectable } from '@nestjs/common';
import type { CourseModule } from '@nestjs-template/types';
import { BaseService } from '../../common/base/base.service';
import type { CrudRepository } from '../../common/base/crud-repository.interface';
import type { CourseModule as CourseModuleRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateCourseModuleDto, UpdateCourseModuleDto } from './dto/create-course-module.dto';

export type { CourseModuleRecord };

export function toCourseModuleResponse(record: CourseModuleRecord): CourseModule {
  return {
    id: record.id,
    course_id: record.course_id,
    title: record.title,
    description: record.description,
    position: record.position,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

function createCourseModuleRepository(
  prisma: PrismaService,
): CrudRepository<CourseModuleRecord, CreateCourseModuleDto, UpdateCourseModuleDto, string> {
  return {
    findMany: ({ skip, take, sortBy, sortOrder }) =>
      prisma.courseModule.findMany({ skip, take, orderBy: { [sortBy ?? 'created_at']: sortOrder } }),
    count: () => prisma.courseModule.count(),
    findById: (id) => prisma.courseModule.findUnique({ where: { id } }),
    create: (data) => prisma.courseModule.create({ data }),
    update: (id, data) => prisma.courseModule.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.courseModule.delete({ where: { id } });
    },
  };
}

/** Admin CRUD of course modules. Students read modules through the course outline. */
@Injectable()
export class CourseModulesService extends BaseService<
  CourseModuleRecord,
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
  CourseModule,
  string
> {
  protected readonly entityName = 'Module';
  protected readonly sortableFields = ['created_at', 'position', 'title'];

  constructor(prisma: PrismaService) {
    super(createCourseModuleRepository(prisma));
  }

  protected toResponse(record: CourseModuleRecord): CourseModule {
    return toCourseModuleResponse(record);
  }
}
