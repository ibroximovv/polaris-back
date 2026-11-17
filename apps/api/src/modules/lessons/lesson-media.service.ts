import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LessonMaterial, LessonVideo, MaterialType } from '@nestjs-template/types';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { isImageMime, type UploadRecord } from '../uploads/uploads.utils';
import type {
  AddMaterialsDto,
  AttachMaterialDto,
  ReorderMaterialsDto,
  SetVideoDto,
  UpdateMaterialDto,
  VideoFieldsDto,
} from './dto/lesson-media.dto';
import {
  type MaterialWithUpload,
  toMaterialResponse,
  toVideoResponse,
  type VideoWithUpload,
  withUpload,
} from './lesson-media.utils';

export const materialOrder = [{ position: 'asc' as const }, { created_at: 'asc' as const }];

/** Exactly one of upload_id / url. */
function assertOneSource(dto: { upload_id?: string; url?: string }, label: string): void {
  if (Boolean(dto.upload_id) === Boolean(dto.url)) {
    throw new BadRequestException(`${label}: send exactly one of upload_id (a file from POST /uploads) or url`);
  }
}

const isUniqueViolation = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'P2002';

/**
 * The lesson's video (one) and ordered materials (guide files, images). Files are uploaded through
 * `/uploads` and attached here by `upload_id`, or given as external links. Removing a video or
 * material (or the lesson) deletes its upload and the stored file.
 */
@Injectable()
export class LessonMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  // --- Video -----------------------------------------------------------------

  /** Sets (or replaces) the lesson video. The replaced upload is deleted. */
  async setVideo(lessonId: string, dto: SetVideoDto): Promise<LessonVideo> {
    await this.assertLessonExists(lessonId);
    assertOneSource(dto, 'video');
    const previous = await this.prisma.lessonVideo.findUnique({ where: { lesson_id: lessonId } });
    let upload: UploadRecord | null = null;
    if (dto.upload_id && dto.upload_id !== previous?.upload_id) {
      upload = await this.uploads.getAttachable(dto.upload_id, 'video');
    }
    const data = {
      upload_id: dto.upload_id ?? null,
      external_url: dto.url ?? null,
      title: dto.title ?? null,
      duration: dto.duration ?? null,
    };
    let saved: VideoWithUpload;
    try {
      saved = await this.prisma.lessonVideo.upsert({
        where: { lesson_id: lessonId },
        create: { lesson_id: lessonId, ...data },
        update: data,
        include: withUpload,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Upload #${upload?.id ?? dto.upload_id} is already attached`);
      throw error;
    }
    if (previous?.upload_id && previous.upload_id !== saved.upload_id) {
      await this.uploads.deleteUploads([previous.upload_id]);
    }
    return this.toVideo(saved);
  }

  async updateVideo(lessonId: string, dto: VideoFieldsDto): Promise<LessonVideo> {
    await this.findVideoOrFail(lessonId);
    const updated = await this.prisma.lessonVideo.update({
      where: { lesson_id: lessonId },
      data: dto,
      include: withUpload,
    });
    return this.toVideo(updated);
  }

  async removeVideo(lessonId: string): Promise<void> {
    const video = await this.findVideoOrFail(lessonId);
    await this.prisma.lessonVideo.delete({ where: { lesson_id: lessonId } });
    if (video.upload_id) await this.uploads.deleteUploads([video.upload_id]);
  }

  // --- Materials ---------------------------------------------------------------

  async listMaterials(lessonId: string): Promise<LessonMaterial[]> {
    const records = await this.prisma.lessonMaterial.findMany({
      where: { lesson_id: lessonId },
      orderBy: materialOrder,
      include: withUpload,
    });
    return this.toMaterials(records);
  }

  /** Attaches uploads and/or links, appended at the end in the given order. */
  async addMaterials(lessonId: string, dto: AddMaterialsDto): Promise<LessonMaterial[]> {
    await this.assertLessonExists(lessonId);
    dto.items.forEach((item, index) => assertOneSource(item, `items[${index}]`));
    const uploadIds = dto.items.flatMap((item) => (item.upload_id ? [item.upload_id] : []));
    if (new Set(uploadIds).size !== uploadIds.length) throw new BadRequestException('An upload is listed more than once');

    const uploads = new Map<string, UploadRecord>();
    for (const id of uploadIds) uploads.set(id, await this.uploads.getAttachable(id, 'material'));

    const start = await this.nextMaterialPosition(lessonId);
    try {
      const records = await this.prisma.$transaction(
        dto.items.map((item, index) =>
          this.prisma.lessonMaterial.create({
            data: {
              lesson_id: lessonId,
              upload_id: item.upload_id ?? null,
              external_url: item.url ?? null,
              type: item.type ?? materialType(item, uploads),
              title: item.title ?? null,
              position: start + index,
            },
            include: withUpload,
          }),
        ),
      );
      return this.toMaterials(records);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('An upload is already attached');
      throw error;
    }
  }

  async updateMaterial(materialId: string, dto: UpdateMaterialDto): Promise<LessonMaterial> {
    await this.findMaterialOrFail(materialId);
    return this.toMaterial(
      await this.prisma.lessonMaterial.update({ where: { id: materialId }, data: dto, include: withUpload }),
    );
  }

  /** Sets the display order. `material_ids` must list every material of the lesson exactly once. */
  async reorderMaterials(lessonId: string, dto: ReorderMaterialsDto): Promise<LessonMaterial[]> {
    await this.assertLessonExists(lessonId);
    const existing = await this.prisma.lessonMaterial.findMany({ where: { lesson_id: lessonId }, select: { id: true } });
    const ids = new Set(existing.map((item) => item.id));
    const unknown = dto.material_ids.find((id) => !ids.has(id));
    if (unknown) throw new BadRequestException(`Material #${unknown} does not belong to lesson #${lessonId}`);
    if (dto.material_ids.length !== ids.size) {
      throw new BadRequestException(`material_ids must list all ${ids.size} materials of the lesson`);
    }
    await this.prisma.$transaction(
      dto.material_ids.map((id, position) => this.prisma.lessonMaterial.update({ where: { id }, data: { position } })),
    );
    return this.listMaterials(lessonId);
  }

  async removeMaterial(materialId: string): Promise<void> {
    const material = await this.findMaterialOrFail(materialId);
    await this.prisma.lessonMaterial.delete({ where: { id: materialId } });
    if (material.upload_id) await this.uploads.deleteUploads([material.upload_id]);
  }

  // --- Shared ----------------------------------------------------------------

  /** Upload ids of a lesson's video and materials, read before the lesson is deleted. */
  async uploadIdsOfLesson(lessonId: string): Promise<string[]> {
    const [video, materials] = await Promise.all([
      this.prisma.lessonVideo.findUnique({ where: { lesson_id: lessonId }, select: { upload_id: true } }),
      this.prisma.lessonMaterial.findMany({
        where: { lesson_id: lessonId, upload_id: { not: null } },
        select: { upload_id: true },
      }),
    ]);
    return [video, ...materials].flatMap((item) => (item?.upload_id ? [item.upload_id] : []));
  }

  /** Call after the lesson is deleted (its video/material rows are gone). */
  deleteUploads(ids: string[]): Promise<void> {
    return this.uploads.deleteUploads(ids);
  }

  async toVideo(record: VideoWithUpload): Promise<LessonVideo> {
    if (record.upload) return toVideoResponse(record, await this.uploads.signedUrl(record.upload));
    return toVideoResponse(record, record.external_url ? { url: record.external_url, expires_at: null } : null);
  }

  async toMaterial(record: MaterialWithUpload): Promise<LessonMaterial> {
    if (record.upload) return toMaterialResponse(record, await this.uploads.signedUrl(record.upload));
    return toMaterialResponse(record, record.external_url ? { url: record.external_url, expires_at: null } : null);
  }

  toMaterials(records: MaterialWithUpload[]): Promise<LessonMaterial[]> {
    return Promise.all(records.map((record) => this.toMaterial(record)));
  }

  private async nextMaterialPosition(lessonId: string): Promise<number> {
    const { _max } = await this.prisma.lessonMaterial.aggregate({
      where: { lesson_id: lessonId },
      _max: { position: true },
    });
    return _max.position === null ? 0 : _max.position + 1;
  }

  private async assertLessonExists(lessonId: string): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (!lesson) throw new NotFoundException(`Lesson #${lessonId} not found`);
  }

  private async findVideoOrFail(lessonId: string) {
    const video = await this.prisma.lessonVideo.findUnique({ where: { lesson_id: lessonId } });
    if (!video) throw new NotFoundException(`Lesson #${lessonId} has no video`);
    return video;
  }

  private async findMaterialOrFail(id: string) {
    const material = await this.prisma.lessonMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException(`Material #${id} not found`);
    return material;
  }
}

/** IMAGE for image uploads, FILE for other uploads and links. */
function materialType(item: AttachMaterialDto, uploads: Map<string, UploadRecord>): MaterialType {
  const upload = item.upload_id ? uploads.get(item.upload_id) : undefined;
  return upload && isImageMime(upload.mime_type) ? 'IMAGE' : 'FILE';
}
