import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { unlink as unlinkFile } from 'node:fs/promises';
import { envs } from '../../config/envs';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import type { AuthUser } from '../auth/auth.types';
import { UploadsService } from './uploads.service';
import { makeUpload } from './uploads.test-helpers';

jest.mock('node:fs/promises', () => ({ unlink: jest.fn(() => Promise.resolve()) }));
const unlink = unlinkFile as unknown as jest.Mock;

const admin: AuthUser = { id: 'a1', role: 'ADMIN' };
const MAX_BYTES = envs.MEDIA_MAX_FILE_SIZE_MB * 1024 * 1024;
const file = (name: string, mimetype: string, size = 100): Express.Multer.File =>
  ({ originalname: name, mimetype, size, path: `/tmp/${name}` }) as Express.Multer.File;
const owners = (video: boolean, material = false) => ({
  lesson_video: video ? { id: 'v1' } : null,
  lesson_material: material ? { id: 'm1' } : null,
});

describe('UploadsService', () => {
  const prisma = {
    upload: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((items: Promise<unknown>[]) => Promise.all(items)),
  };
  const storage = {
    buildKey: jest.fn((prefix: string, name: string) => `${prefix}/${name}`),
    uploadFile: jest.fn(),
    createUploadForm: jest.fn(),
    stat: jest.fn(),
    getDownloadUrl: jest.fn(),
    remove: jest.fn(),
  };
  let service: UploadsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    unlink.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation((items: Promise<unknown>[]) => Promise.all(items));
    storage.buildKey.mockImplementation((prefix: string, name: string) => `${prefix}/${name}`);
    storage.getDownloadUrl.mockResolvedValue({ url: 'http://signed', expires_at: new Date() });
    prisma.upload.create.mockImplementation(({ data }) => Promise.resolve(makeUpload({ id: data.file_name, ...data })));
    prisma.upload.update.mockImplementation(({ where, data }) => Promise.resolve(makeUpload({ id: where.id, ...data })));
    const moduleRef = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(UploadsService);
  });

  describe('upload', () => {
    it('stores every file under uploads/<yyyy>/<mm>, records it and removes temp files', async () => {
      const result = await service.upload(admin, [file('a.mp4', 'video/mp4', 50), file('b.pdf', 'application/pdf')]);
      expect(storage.uploadFile.mock.calls[0][0]).toMatch(/^uploads\/\d{4}\/\d{2}\/a\.mp4$/);
      expect(prisma.upload.create.mock.calls[0][0].data).toMatchObject({
        file_name: 'a.mp4',
        mime_type: 'video/mp4',
        size: BigInt(50),
        uploaded_by: 'a1',
      });
      expect(result.map((item) => [item.file_name, item.status, item.url, item.attached])).toEqual([
        ['a.mp4', 'READY', 'http://signed', false],
        ['b.pdf', 'READY', 'http://signed', false],
      ]);
      expect(unlink).toHaveBeenCalledTimes(2);
    });

    it('signs documents as attachments and media inline', async () => {
      await service.upload(admin, [file('b.pdf', 'application/pdf'), file('c.png', 'image/png')]);
      expect(storage.getDownloadUrl.mock.calls[0][1]).toEqual({ attachmentName: 'b.pdf' });
      expect(storage.getDownloadUrl.mock.calls[1][1]).toEqual({});
    });

    it('rolls back stored files and answers 503 when MinIO fails midway', async () => {
      storage.uploadFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('down'));
      await expect(service.upload(admin, [file('a.mp4', 'video/mp4'), file('b.mp4', 'video/mp4')])).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(storage.remove).toHaveBeenCalledWith([expect.stringMatching(/a\.mp4$/)]);
      expect(prisma.upload.create).not.toHaveBeenCalled();
      expect(unlink).toHaveBeenCalledTimes(2);
    });

    it('rejects an empty request', async () => {
      await expect(service.upload(admin, [])).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPresigned', () => {
    it('reserves a PENDING upload and returns the MinIO form', async () => {
      const expires = new Date('2026-01-01T01:00:00.000Z');
      storage.createUploadForm.mockResolvedValue({ url: 'http://minio/turizm', fields: { key: 'k' }, expires_at: expires });
      const result = await service.createPresigned(admin, { file_name: 'big.mp4', mime_type: 'video/mp4', size: 1000 });
      expect(storage.createUploadForm).toHaveBeenCalledWith(expect.stringMatching(/big\.mp4$/), 'video/mp4', MAX_BYTES);
      expect(prisma.upload.create.mock.calls[0][0].data).toMatchObject({ status: 'PENDING', size: BigInt(1000) });
      expect(result.upload).toMatchObject({ status: 'PENDING', url: null });
      expect(result.form).toEqual({
        method: 'POST',
        url: 'http://minio/turizm',
        fields: { key: 'k' },
        file_field: 'file',
        max_size: MAX_BYTES,
        expires_at: expires.toISOString(),
      });
    });

    it('rejects disallowed types and too large files', async () => {
      await expect(
        service.createPresigned(admin, { file_name: 'x.exe', mime_type: 'application/x-msdownload', size: 1 }),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      await expect(
        service.createPresigned(admin, { file_name: 'a.mp4', mime_type: 'video/mp4', size: MAX_BYTES + 1 }),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(prisma.upload.create).not.toHaveBeenCalled();
    });

    it('answers 503 when presigning fails', async () => {
      storage.createUploadForm.mockRejectedValue(new Error('down'));
      await expect(
        service.createPresigned(admin, { file_name: 'a.mp4', mime_type: 'video/mp4', size: 1 }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('complete', () => {
    it('marks the upload READY with the stored size and type', async () => {
      prisma.upload.findUnique.mockResolvedValue({ ...makeUpload({ status: 'PENDING' }), ...owners(false) });
      storage.stat.mockResolvedValue({ size: 4096, mime_type: 'video/mp4' });
      await expect(service.complete('up1')).resolves.toMatchObject({ status: 'READY', size: 4096 });
      expect(prisma.upload.update).toHaveBeenCalledWith({
        where: { id: 'up1' },
        data: { status: 'READY', size: BigInt(4096), mime_type: 'video/mp4' },
      });
    });

    it('fails while the file is not in storage; is idempotent once READY', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({ ...makeUpload({ status: 'PENDING' }), ...owners(false) });
      storage.stat.mockResolvedValue(null);
      await expect(service.complete('up1')).rejects.toThrow(
        new BadRequestException('The file of upload #up1 has not been uploaded yet'),
      );
      prisma.upload.findUnique.mockResolvedValueOnce({ ...makeUpload(), ...owners(true) });
      await expect(service.complete('up1')).resolves.toMatchObject({ status: 'READY', attached: true });
    });

    it('404s for an unknown upload', async () => {
      prisma.upload.findUnique.mockResolvedValue(null);
      await expect(service.complete('nope')).rejects.toThrow(new NotFoundException('Upload #nope not found'));
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes an unattached upload with its file', async () => {
      prisma.upload.findUnique.mockResolvedValue({ ...makeUpload(), ...owners(false) });
      prisma.upload.findMany.mockResolvedValue([{ object_key: 'uploads/2026/01/up1.mp4' }]);
      await service.remove('up1');
      expect(prisma.upload.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['up1'] } } });
      expect(storage.remove).toHaveBeenCalledWith(['uploads/2026/01/up1.mp4']);
    });

    it('refuses an attached upload', async () => {
      prisma.upload.findUnique.mockResolvedValue({ ...makeUpload(), ...owners(false, true) });
      await expect(service.remove('up1')).rejects.toThrow(ConflictException);
      expect(prisma.upload.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getAttachable', () => {
    it('returns a READY, free upload that fits the target', async () => {
      prisma.upload.findUnique.mockResolvedValue({ ...makeUpload(), ...owners(false) });
      await expect(service.getAttachable('up1', 'video')).resolves.toMatchObject({ id: 'up1' });
    });

    it('rejects unknown, pending, attached and wrong-type uploads', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce(null);
      await expect(service.getAttachable('x', 'video')).rejects.toThrow(new BadRequestException('Upload #x not found'));
      prisma.upload.findUnique.mockResolvedValueOnce({ ...makeUpload({ status: 'PENDING' }), ...owners(false) });
      await expect(service.getAttachable('up1', 'video')).rejects.toThrow(BadRequestException);
      prisma.upload.findUnique.mockResolvedValueOnce({ ...makeUpload(), ...owners(true) });
      await expect(service.getAttachable('up1', 'video')).rejects.toThrow(ConflictException);
      prisma.upload.findUnique.mockResolvedValueOnce({ ...makeUpload({ mime_type: 'application/pdf' }), ...owners(false) });
      await expect(service.getAttachable('up1', 'video')).rejects.toThrow(UnsupportedMediaTypeException);
      prisma.upload.findUnique.mockResolvedValueOnce({ ...makeUpload(), ...owners(false) });
      await expect(service.getAttachable('up1', 'material')).rejects.toThrow(UnsupportedMediaTypeException);
    });
  });

  it('deleteUploads does nothing for an empty list', async () => {
    await service.deleteUploads([]);
    expect(prisma.upload.deleteMany).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
