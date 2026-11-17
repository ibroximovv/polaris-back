import { Test } from '@nestjs/testing';
import { createMinioClients, MINIO_CLIENTS, StorageService } from './storage.service';

describe('StorageService', () => {
  const policy = {
    setBucket: jest.fn(),
    setKey: jest.fn(),
    setContentType: jest.fn(),
    setContentLengthRange: jest.fn(),
    setExpires: jest.fn(),
  };
  const client = {
    bucketExists: jest.fn(),
    makeBucket: jest.fn(),
    fPutObject: jest.fn(),
    newPostPolicy: jest.fn(() => policy),
    presignedPostPolicy: jest.fn(),
    statObject: jest.fn(),
    presignedGetObject: jest.fn(),
    removeObjects: jest.fn(),
  };
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [StorageService, { provide: MINIO_CLIENTS, useValue: { internal: client, public: client } }],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  describe('onModuleInit', () => {
    it('creates a missing bucket', async () => {
      client.bucketExists.mockResolvedValue(false);
      await service.onModuleInit();
      expect(client.makeBucket).toHaveBeenCalledWith(service.bucket, expect.any(String));
    });

    it('does not throw when MinIO is down', async () => {
      client.bucketExists.mockRejectedValue(Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' }));
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  it('builds a random key under the prefix keeping only the extension', () => {
    expect(service.buildKey('/lessons/l1/', 'My Video.MP4')).toMatch(/^lessons\/l1\/\d+-[0-9a-f-]{36}\.mp4$/);
  });

  it('uploads a local file with its content type', async () => {
    await service.uploadFile('k', '/tmp/f', 'video/mp4');
    expect(client.fPutObject).toHaveBeenCalledWith(service.bucket, 'k', '/tmp/f', { 'Content-Type': 'video/mp4' });
  });

  it('creates a presigned upload form limited to key, type and size', async () => {
    client.presignedPostPolicy.mockResolvedValue({ postURL: 'http://minio/turizm', formData: { key: 'k', policy: 'p' } });
    const form = await service.createUploadForm('k', 'video/mp4', 1000);
    expect(policy.setKey).toHaveBeenCalledWith('k');
    expect(policy.setContentType).toHaveBeenCalledWith('video/mp4');
    expect(policy.setContentLengthRange).toHaveBeenCalledWith(1, 1000);
    expect(form).toMatchObject({ url: 'http://minio/turizm', fields: { key: 'k', policy: 'p' } });
    expect(form.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  describe('stat', () => {
    it('returns size and type', async () => {
      client.statObject.mockResolvedValue({ size: 42, metaData: { 'content-type': 'video/mp4' } });
      await expect(service.stat('k')).resolves.toEqual({ size: 42, mime_type: 'video/mp4' });
    });

    it('returns null for a missing object and rethrows other errors', async () => {
      client.statObject.mockRejectedValueOnce(Object.assign(new Error('nf'), { code: 'NotFound' }));
      await expect(service.stat('k')).resolves.toBeNull();
      client.statObject.mockRejectedValueOnce(new Error('boom'));
      await expect(service.stat('k')).rejects.toThrow('boom');
    });
  });

  it('signs download links, as an attachment when a name is given', async () => {
    client.presignedGetObject.mockResolvedValue('http://signed');
    await expect(service.getDownloadUrl('k')).resolves.toMatchObject({ url: 'http://signed' });
    expect(client.presignedGetObject).toHaveBeenLastCalledWith(service.bucket, 'k', expect.any(Number), undefined);
    await service.getDownloadUrl('k', { attachmentName: 'Dars 1.pdf' });
    expect(client.presignedGetObject).toHaveBeenLastCalledWith(service.bucket, 'k', expect.any(Number), {
      'response-content-disposition': "attachment; filename*=UTF-8''Dars%201.pdf",
    });
  });

  it('removes objects and swallows storage errors', async () => {
    await service.remove([]);
    expect(client.removeObjects).not.toHaveBeenCalled();
    client.removeObjects.mockRejectedValue(new Error('down'));
    await expect(service.remove(['a', 'b'])).resolves.toBeUndefined();
    expect(client.removeObjects).toHaveBeenCalledWith(service.bucket, ['a', 'b']);
  });
});

describe('createMinioClients', () => {
  const base = {
    MINIO_ENDPOINT: 'minio',
    MINIO_PORT: 9000,
    MINIO_USE_SSL: false,
    MINIO_ACCESS_KEY: 'k',
    MINIO_SECRET_KEY: 's',
    MINIO_REGION: 'us-east-1',
    MINIO_PUBLIC_URL: undefined,
  };

  it('uses one client without a public URL', () => {
    const clients = createMinioClients(base);
    expect(clients.public).toBe(clients.internal);
  });

  it('builds a separate signing client for the public URL', () => {
    const clients = createMinioClients({ ...base, MINIO_PUBLIC_URL: 'https://media.example.com' });
    expect(clients.public).not.toBe(clients.internal);
  });
});
