import { makeMaterial, makeVideo } from './lesson-media.test-helpers';
import { toMaterialResponse, toVideoResponse } from './lesson-media.utils';

describe('lesson-media utils', () => {
  const expires = new Date('2026-01-02T00:00:00.000Z');

  it('maps an uploaded video with the file details of its upload', () => {
    expect(toVideoResponse(makeVideo(), { url: 'http://signed', expires_at: expires })).toEqual({
      id: 'v1',
      lesson_id: 'l1',
      source: 'UPLOAD',
      upload_id: 'up1',
      file_name: 'intro.mp4',
      mime_type: 'video/mp4',
      size: 1024,
      title: null,
      duration: 600,
      url: 'http://signed',
      url_expires_at: expires.toISOString(),
    });
  });

  it('maps a linked video without file details', () => {
    const video = makeVideo({ upload: null, external_url: 'https://x/v.m3u8' });
    expect(toVideoResponse(video, { url: 'https://x/v.m3u8', expires_at: null })).toMatchObject({
      source: 'LINK',
      upload_id: null,
      file_name: null,
      size: null,
      url_expires_at: null,
    });
  });

  it('maps a material', () => {
    expect(toMaterialResponse(makeMaterial(), null)).toMatchObject({
      type: 'FILE',
      source: 'UPLOAD',
      upload_id: 'doc1',
      file_name: 'konspekt.pdf',
      url: null,
    });
  });
});
