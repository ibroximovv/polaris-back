import type { Upload } from '@nestjs-template/types';
import type { Upload as UploadRecord } from '../../generated/prisma/client';

export type { UploadRecord };

/** What an upload may be attached to; decides which file types are accepted. */
export type UploadTarget = 'video' | 'material';

export const isVideoMime = (mimeType: string): boolean => mimeType.toLowerCase().startsWith('video/');
export const isImageMime = (mimeType: string): boolean => mimeType.toLowerCase().startsWith('image/');

/** `uploads/<yyyy>/<mm>`: keeps the bucket browsable by date. */
export function uploadPrefix(now: Date = new Date()): string {
  return `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function toUploadResponse(
  record: UploadRecord,
  attached: boolean,
  link: { url: string; expires_at: Date } | null,
): Upload {
  return {
    id: record.id,
    file_name: record.file_name,
    mime_type: record.mime_type,
    size: Number(record.size),
    status: record.status,
    url: link?.url ?? null,
    url_expires_at: link?.expires_at.toISOString() ?? null,
    attached,
    created_at: record.created_at.toISOString(),
  };
}
