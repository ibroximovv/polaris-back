import { BadRequestException, Injectable } from '@nestjs/common';
import type { Course, CourseDetail, PaginatedResponse } from '@nestjs-template/types';
import { BaseService, buildPaginationMeta } from '../../common/base/base.service';
import type { CrudRepository } from '../../common/base/crud-repository.interface';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Course as CourseRecord, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { toTestSummary } from '../lesson-tests/lesson-tests.utils';
import { orderedLessonSelect, toLessonOutline, toOrderedLesson } from '../progress/progress.utils';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';

export type { CourseRecord };

export function toCourseResponse(record: CourseRecord): Course {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    cover_url: record.cover_url,
    is_published: record.is_published,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

function createCourseRepository(prisma: PrismaService): CrudRepository<CourseRecord, CreateCourseDto, UpdateCourseDto, string> {
  return {
    findMany: ({ skip, take, sortBy, sortOrder }) =>
      prisma.course.findMany({ skip, take, orderBy: { [sortBy ?? 'created_at']: sortOrder } }),
    count: () => prisma.course.count(),
    findById: (id) => prisma.course.findUnique({ where: { id } }),
    create: (data) => prisma.course.create({ data }),
    update: (id, data) => prisma.course.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.course.delete({ where: { id } });
    },
  };
}

@Injectable()
export class CoursesService extends BaseService<CourseRecord, CreateCourseDto, UpdateCourseDto, Course, string> {
  protected readonly entityName = 'Course';
  protected readonly sortableFields = ['created_at', 'title'];

  constructor(private readonly prisma: PrismaService) {
    super(createCourseRepository(prisma));
  }

  protected toResponse(record: CourseRecord): Course {
    return toCourseResponse(record);
  }

  /** Admins see every course, students only published ones. */
  async findAllFor(user: AuthUser, query: PaginationQueryDto): Promise<PaginatedResponse<Course>> {
    if (user.role === 'ADMIN') return this.findAll(query);
    const { page, limit, sort_by: sortBy, sort_order: sortOrder, search } = query;
    if (sortBy !== undefined && !this.sortableFields.includes(sortBy)) {
      throw new BadRequestException(`Cannot sort Course by "${sortBy}". Allowed: ${this.sortableFields.join(', ')}`);
    }
    const where: Prisma.CourseWhereInput = {
      is_published: true,
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy ?? 'created_at']: sortOrder },
      }),
      this.prisma.course.count({ where }),
    ]);
    return { data: items.map(toCourseResponse), meta: buildPaginationMeta(page, limit, total) };
  }

  /** Course with its modules and lessons in learning order. Unpublished courses are hidden from students. */
  async findDetail(user: AuthUser, id: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
          include: {
            lessons: {
              orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
              select: orderedLessonSelect,
            },
            test: { include: { _count: { select: { questions: true } } } },
          },
        },
      },
    });
    if (!course || (!course.is_published && user.role !== 'ADMIN')) throw this.notFound(id);
    return {
      ...toCourseResponse(course),
      modules: course.modules.map((module) => ({
        id: module.id,
        course_id: module.course_id,
        title: module.title,
        description: module.description,
        position: module.position,
        created_at: module.created_at.toISOString(),
        updated_at: module.updated_at.toISOString(),
        lessons: module.lessons.map((lesson) => toLessonOutline(toOrderedLesson(lesson))),
        test: module.test ? toTestSummary(module.test) : null,
      })),
    };
  }
}
