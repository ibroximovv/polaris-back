import type { UploadRecord } from './uploads.utils';

const date = new Date('2026-01-01T00:00:00.000Z');

/** A READY uploaded mp4 by default. */
export function makeUpload(overrides: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: 'up1',
    object_key: `uploads/2026/01/${overrides.id ?? 'up1'}.mp4`,
    file_name: 'intro.mp4',
    mime_type: 'video/mp4',
    size: BigInt(1024),
    status: 'READY',
    uploaded_by: 'a1',
    created_at: date,
    updated_at: date,
    ...overrides,
  };
}
