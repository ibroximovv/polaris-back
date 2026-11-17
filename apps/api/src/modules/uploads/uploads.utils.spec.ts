import { makeUpload } from './uploads.test-helpers';
import { isImageMime, isVideoMime, toUploadResponse, uploadPrefix } from './uploads.utils';

describe('uploads utils', () => {
  it('detects videos and images', () => {
    expect(isVideoMime('VIDEO/MP4')).toBe(true);
    expect(isImageMime('image/png')).toBe(true);
    expect(isVideoMime('application/pdf')).toBe(false);
  });

  it('groups keys by year and month', () => {
    expect(uploadPrefix(new Date('2026-03-09T12:00:00.000Z'))).toBe('uploads/2026/03');
  });

  it('maps an upload', () => {
    const expires = new Date('2026-01-02T00:00:00.000Z');
    expect(toUploadResponse(makeUpload(), true, { url: 'http://signed', expires_at: expires })).toEqual({
      id: 'up1',
      file_name: 'intro.mp4',
      mime_type: 'video/mp4',
      size: 1024,
      status: 'READY',
      url: 'http://signed',
      url_expires_at: expires.toISOString(),
      attached: true,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(toUploadResponse(makeUpload({ status: 'PENDING' }), false, null)).toMatchObject({ url: null, attached: false });
  });
});
