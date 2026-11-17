import { unlink } from 'node:fs/promises';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { PresignedUpload, Upload } from '@nestjs-template/types';
import { envs } from '../../config/envs';
import { PrismaService } from '../../prisma/prisma.service';
import { type SignedUrl, StorageService } from '../../storage/storage.service';
import { decodeOriginalName, isMimeTypeAllowed } from '../../upload/multer.config';
import type { AuthUser } from '../auth/auth.types';
import type { CreatePresignedUploadDto } from './dto/create-presigned-upload.dto';
import {
  isImageMime,
  isVideoMime,
  toUploadResponse,
  uploadPrefix,
  type UploadRecord,
  type UploadTarget,
} from './uploads.utils';

const maxUploadBytes = (): number => envs.MEDIA_MAX_FILE_SIZE_MB * 1024 * 1024;

const withOwners = { lesson_video: { select: { id: true } }, lesson_material: { select: { id: true } } } as const;
type UploadWithOwners = UploadRecord & { lesson_video: { id: string } | null; lesson_material: { id: string } | null };

const isAttached = (upload: UploadWithOwners): boolean => upload.lesson_video !== null || upload.lesson_material !== null;

/**
 * The one place files enter the system. A file is uploaded to MinIO (through the API, or straight
 * from the browser with a presigned form for large files) and gets an `upload_id`; feature
 * endpoints then attach it by id. An upload belongs to at most one owner and is deleted with it.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Multipart upload of one or more files. Multer has already checked type and size. */
  async upload(user: AuthUser, files: Express.Multer.File[]): Promise<Upload[]> {
    const stored: { key: string; file: Express.Multer.File }[] = [];
    try {
      if (files.length === 0) throw new BadRequestException('Send at least one file in the "files" field');
      for (const file of files) {
        const key = this.storage.buildKey(uploadPrefix(), decodeOriginalName(file.originalname));
        try {
          await this.storage.uploadFile(key, file.path, file.mimetype);
        } catch (error) {
          this.logger.error(`Upload to storage failed: ${error instanceof Error ? error.message : String(error)}`);
          throw new ServiceUnavailableException('File storage is unavailable, try again later');
        }
        stored.push({ key, file });
      }
      const records = await this.prisma.$transaction(
        stored.map(({ key, file }) =>
          this.prisma.upload.create({
            data: {
              object_key: key,
              file_name: decodeOriginalName(file.originalname),
              mime_type: file.mimetype,
              size: BigInt(file.size),
              uploaded_by: user.id,
            },
          }),
        ),
      );
      return Promise.all(records.map((record) => this.toResponse(record, false)));
    } catch (error) {
      await this.storage.remove(stored.map((item) => item.key));
      throw error;
    } finally {
      await Promise.all(files.map((file) => (file.path ? unlink(file.path).catch(() => undefined) : undefined)));
    }
  }

  /** Large files, step 1: reserves a PENDING upload and returns the MinIO form (limited to key, type and size). */
  async createPresigned(user: AuthUser, dto: CreatePresignedUploadDto): Promise<PresignedUpload> {
    if (!isMimeTypeAllowed(dto.mime_type, envs.MEDIA_ALLOWED_MIME_TYPES)) {
      throw new UnsupportedMediaTypeException(`File type "${dto.mime_type}" is not allowed`);
    }
    const maxSize = maxUploadBytes();
    if (dto.size > maxSize) throw new PayloadTooLargeException(`File is larger than ${envs.MEDIA_MAX_FILE_SIZE_MB} MB`);

    const key = this.storage.buildKey(uploadPrefix(), dto.file_name);
    let form;
    try {
      form = await this.storage.createUploadForm(key, dto.mime_type, maxSize);
    } catch (error) {
      this.logger.error(`Presigning failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('File storage is unavailable, try again later');
    }
    const record = await this.prisma.upload.create({
      data: {
        object_key: key,
        file_name: dto.file_name,
        mime_type: dto.mime_type,
        size: BigInt(dto.size),
        status: 'PENDING',
        uploaded_by: user.id,
      },
    });
    return {
      upload: await this.toResponse(record, false),
      form: {
        method: 'POST',
        url: form.url,
        fields: form.fields,
        file_field: 'file',
        max_size: maxSize,
        expires_at: form.expires_at.toISOString(),
      },
    };
  }

  /** Large files, step 2: checks the file is really in MinIO and makes the upload usable. */
  async complete(id: string): Promise<Upload> {
    const upload = await this.findOrFail(id);
    if (upload.status === 'READY') return this.toResponse(upload, isAttached(upload));
    const stored = await this.storage.stat(upload.object_key);
    if (!stored) throw new BadRequestException(`The file of upload #${id} has not been uploaded yet`);
    const updated = await this.prisma.upload.update({
      where: { id },
      data: { status: 'READY', size: BigInt(stored.size), mime_type: stored.mime_type ?? upload.mime_type },
    });
    return this.toResponse(updated, false);
  }

  async findOne(id: string): Promise<Upload> {
    const upload = await this.findOrFail(id);
    return this.toResponse(upload, isAttached(upload));
  }

  /** Deletes an upload that is not attached (e.g. uploaded by mistake). */
  async remove(id: string): Promise<void> {
    const upload = await this.findOrFail(id);
    if (isAttached(upload)) {
      throw new ConflictException(`Upload #${id} is attached; remove the lesson video or material instead`);
    }
    await this.deleteUploads([id]);
  }

  /**
   * An upload about to be attached: it must exist, be READY, not be attached elsewhere and fit
   * the target (a lesson video takes only videos, a material anything but videos).
   */
  async getAttachable(id: string, target: UploadTarget): Promise<UploadRecord> {
    const upload = await this.prisma.upload.findUnique({ where: { id }, include: withOwners });
    if (!upload) throw new BadRequestException(`Upload #${id} not found`);
    if (upload.status !== 'READY') throw new BadRequestException(`Upload #${id} is not completed yet`);
    if (isAttached(upload)) throw new ConflictException(`Upload #${id} is already attached`);
    if (target === 'video' && !isVideoMime(upload.mime_type)) {
      throw new UnsupportedMediaTypeException(`Upload #${id} is not a video (${upload.mime_type})`);
    }
    if (target === 'material' && isVideoMime(upload.mime_type)) {
      throw new UnsupportedMediaTypeException('A lesson has one video; attach it with PUT /lessons/:id/video');
    }
    return upload;
  }

  /** Deletes upload rows and their files. Call after the owners (video/material rows) are gone. */
  async deleteUploads(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const uploads = await this.prisma.upload.findMany({ where: { id: { in: ids } }, select: { object_key: true } });
    await this.prisma.upload.deleteMany({ where: { id: { in: ids } } });
    await this.storage.remove(uploads.map((upload) => upload.object_key));
  }

  /** Short-lived link; documents download with their original name, videos and images open inline. */
  signedUrl(upload: UploadRecord): Promise<SignedUrl> {
    const inline = isVideoMime(upload.mime_type) || isImageMime(upload.mime_type);
    return this.storage.getDownloadUrl(upload.object_key, inline ? {} : { attachmentName: upload.file_name });
  }

  private async toResponse(record: UploadRecord, attached: boolean): Promise<Upload> {
    return toUploadResponse(record, attached, record.status === 'READY' ? await this.signedUrl(record) : null);
  }

  private async findOrFail(id: string): Promise<UploadWithOwners> {
    const upload = await this.prisma.upload.findUnique({ where: { id }, include: withOwners });
    if (!upload) throw new NotFoundException(`Upload #${id} not found`);
    return upload;
  }
}
