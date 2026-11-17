import type { LessonMaterial, LessonVideo } from '@nestjs-template/types';
import type {
  LessonMaterial as LessonMaterialRecord,
  LessonVideo as LessonVideoRecord,
} from '../../generated/prisma/client';
import type { UploadRecord } from '../uploads/uploads.utils';

export type VideoWithUpload = LessonVideoRecord & { upload: UploadRecord | null };
export type MaterialWithUpload = LessonMaterialRecord & { upload: UploadRecord | null };

/** Prisma include for media rows: the attached upload carries the file details. */
export const withUpload = { upload: true } as const;

export interface MediaLink {
  url: string;
  expires_at: Date | null;
}

function fileFields(upload: UploadRecord | null) {
  return {
    source: upload ? ('UPLOAD' as const) : ('LINK' as const),
    upload_id: upload?.id ?? null,
    file_name: upload?.file_name ?? null,
    mime_type: upload?.mime_type ?? null,
    size: upload ? Number(upload.size) : null,
  };
}

const linkFields = (link: MediaLink | null) => ({
  url: link?.url ?? null,
  url_expires_at: link?.expires_at?.toISOString() ?? null,
});

export function toVideoResponse(record: VideoWithUpload, link: MediaLink | null): LessonVideo {
  return {
    id: record.id,
    lesson_id: record.lesson_id,
    ...fileFields(record.upload),
    title: record.title,
    duration: record.duration,
    ...linkFields(link),
  };
}

export function toMaterialResponse(record: MaterialWithUpload, link: MediaLink | null): LessonMaterial {
  return {
    id: record.id,
    lesson_id: record.lesson_id,
    type: record.type,
    ...fileFields(record.upload),
    title: record.title,
    position: record.position,
    ...linkFields(link),
  };
}
