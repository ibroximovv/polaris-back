import { Injectable } from '@nestjs/common';
import type { Lesson, LessonDetail, LessonMaterial } from '@nestjs-template/types';
import { BaseService } from '../../common/base/base.service';
import type { CrudRepository } from '../../common/base/crud-repository.interface';
import type { Lesson as LessonRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { toTestSummary } from '../lesson-tests/lesson-tests.utils';
import { ProgressService } from '../progress/progress.service';
import type { CreateLessonDto, UpdateLessonDto } from './dto/create-lesson.dto';
import { LessonMediaService, materialOrder } from './lesson-media.service';
import { withUpload } from './lesson-media.utils';

export type { LessonRecord };

export function toLessonResponse(record: LessonRecord): Lesson {
  return {
    id: record.id,
    module_id: record.module_id,
    title: record.title,
    description: record.description,
    content: record.content,
    position: record.position,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
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
    private readonly mediaService: LessonMediaService,
  ) {
    super(createLessonRepository(prisma));
  }

  protected toResponse(record: LessonRecord): Lesson {
    return toLessonResponse(record);
  }

  /** Lesson page: video, guide, ordered materials and test summary. Locked lessons return 403 to students. */
  async findDetail(user: AuthUser, id: string): Promise<LessonDetail> {
    await this.progressService.assertLessonOpen(user, id);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        video: { include: withUpload },
        materials: { orderBy: materialOrder, include: withUpload },
        test: { include: { _count: { select: { questions: true } } } },
      },
    });
    if (!lesson) throw this.notFound(id);
    const { video, materials, test, ...record } = lesson;
    return {
      ...toLessonResponse(record),
      video: video ? await this.mediaService.toVideo(video) : null,
      materials: await this.mediaService.toMaterials(materials),
      test: test ? toTestSummary(test) : null,
    };
  }

  /** Materials of an open lesson. */
  async listMaterials(user: AuthUser, id: string): Promise<LessonMaterial[]> {
    await this.progressService.assertLessonOpen(user, id);
    return this.mediaService.listMaterials(id);
  }

  /** Deletes the lesson (video and material rows cascade) and then their uploads and files. */
  async remove(id: string): Promise<void> {
    const uploadIds = await this.mediaService.uploadIdsOfLesson(id);
    await super.remove(id);
    await this.mediaService.deleteUploads(uploadIds);
  }
}
