import { makeUpload } from '../uploads/uploads.test-helpers';
import type { MaterialWithUpload, VideoWithUpload } from './lesson-media.utils';

const date = new Date('2026-01-01T00:00:00.000Z');

/** A 600s video of lesson l1 from upload `up1`. */
export function makeVideo(overrides: Partial<VideoWithUpload> = {}): VideoWithUpload {
  const upload = overrides.upload === undefined ? makeUpload() : overrides.upload;
  return {
    id: 'v1',
    lesson_id: 'l1',
    upload_id: upload?.id ?? null,
    external_url: null,
    title: null,
    duration: 600,
    created_at: date,
    updated_at: date,
    upload,
    ...overrides,
  };
}

/** A PDF material of lesson l1 from upload `doc1`. */
export function makeMaterial(overrides: Partial<MaterialWithUpload> = {}): MaterialWithUpload {
  const upload =
    overrides.upload === undefined
      ? makeUpload({ id: 'doc1', file_name: 'konspekt.pdf', mime_type: 'application/pdf' })
      : overrides.upload;
  return {
    id: 'mt1',
    lesson_id: 'l1',
    upload_id: upload?.id ?? null,
    external_url: null,
    type: 'FILE',
    title: null,
    position: 0,
    created_at: date,
    updated_at: date,
    upload,
    ...overrides,
  };
}
