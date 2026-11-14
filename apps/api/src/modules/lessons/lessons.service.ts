import { Injectable, NotFoundException } from '@nestjs/common';
import type { Lesson, LessonDetail, LessonMaterial } from '@nestjs-template/types';
import { BaseService } from '../../common/base/base.service';
import type { CrudRepository } from '../../common/base/crud-repository.interface';
import type { Lesson as LessonRecord, LessonMaterial as LessonMaterialRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from '../progress/progress.service';
import type { CreateLessonDto, UpdateLessonDto } from './dto/create-lesson.dto';
import type { CreateMaterialDto, UpdateMaterialDto } from './dto/create-material.dto';

export type { LessonMaterialRecord, LessonRecord };

export function toLessonResponse(record: LessonRecord): Lesson {
  return {
    id: record.id,
    module_id: record.module_id,
    title: record.title,
    description: record.description,
    content: record.content,
    video_url: record.video_url,
    video_duration: record.video_duration,
    position: record.position,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

export function toMaterialResponse(record: LessonMaterialRecord): LessonMaterial {
  return { id: record.id, lesson_id: record.lesson_id, title: record.title, url: record.url, position: record.position };
}

function createLessonRepository(prisma: PrismaService): CrudRepository<LessonRecord, CreateLessonDto, UpdateLessonDto, string> {
  return {
    findMany: ({ skip, take, sortBy, sortOrder }) =>
      prisma.lesson.findMany({ skip, take, orderBy: { [sortBy ?? 'created_at']: sortOrder } }),
    count: () => prisma.lesson.count(),
    findById: (id) => prisma.lesson.findUnique({ where: { id } }),
    create: (data) => prisma.lesson.create({ data }),
    update: (id, data) => prisma.lesson.update({ where: { id }, data }),
    delete: async (id) => {
      await prisma.lesson.delete({ where: { id } });
    },
  };
}

@Injectable()
export class LessonsService extends BaseService<LessonRecord, CreateLessonDto, UpdateLessonDto, Lesson, string> {
  protected readonly entityName = 'Lesson';
  protected readonly sortableFields = ['created_at', 'position', 'title'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly progressService: ProgressService,
  ) {
    super(createLessonRepository(prisma));
  }

  protected toResponse(record: LessonRecord): Lesson {
    return toLessonResponse(record);
  }

  /** Lesson page: video, guide, materials and test summary. Locked lessons return 403 to students. */
  async findDetail(user: AuthUser, id: string): Promise<LessonDetail> {
    await this.progressService.assertLessonOpen(user, id);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        materials: { orderBy: [{ position: 'asc' }, { created_at: 'asc' }] },
        test: { include: { _count: { select: { questions: true } } } },
      },
    });
    if (!lesson) throw this.notFound(id);
    const { materials, test, ...record } = lesson;
    return {
      ...toLessonResponse(record),
      materials: materials.map(toMaterialResponse),
      test: test
        ? {
            id: test.id,
            title: test.title,
            pass_score: test.pass_score,
            max_attempts: test.max_attempts,
            question_count: test._count.questions,
          }
        : null,
    };
  }

  async addMaterial(lessonId: string, dto: CreateMaterialDto): Promise<LessonMaterial> {
    await this.findEntityOrFail(lessonId);
    try {
      return toMaterialResponse(await this.prisma.lessonMaterial.create({ data: { ...dto, lesson_id: lessonId } }));
    } catch (error) {
      throw this.mapError(error, lessonId);
    }
  }

  async updateMaterial(materialId: string, dto: UpdateMaterialDto): Promise<LessonMaterial> {
    await this.findMaterialOrFail(materialId);
    return toMaterialResponse(await this.prisma.lessonMaterial.update({ where: { id: materialId }, data: dto }));
  }

  async removeMaterial(materialId: string): Promise<void> {
    await this.findMaterialOrFail(materialId);
    await this.prisma.lessonMaterial.delete({ where: { id: materialId } });
  }

  private async findMaterialOrFail(id: string): Promise<LessonMaterialRecord> {
    const material = await this.prisma.lessonMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException(`Material #${id} not found`);
    return material;
  }
}
