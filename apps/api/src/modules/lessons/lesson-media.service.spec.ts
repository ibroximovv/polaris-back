import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { makeUpload } from '../uploads/uploads.test-helpers';
import { LessonMediaService } from './lesson-media.service';
import { makeMaterial, makeVideo } from './lesson-media.test-helpers';

const VIDEO_UPLOAD = '11111111-1111-4111-8111-111111111111';
const PDF_UPLOAD = '22222222-2222-4222-8222-222222222222';
const PNG_UPLOAD = '33333333-3333-4333-8333-333333333333';

describe('LessonMediaService', () => {
  const prisma = {
    lesson: { findUnique: jest.fn() },
    lessonVideo: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
    lessonMaterial: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn((items: Promise<unknown>[]) => Promise.all(items)),
  };
  const uploads = { getAttachable: jest.fn(), deleteUploads: jest.fn(), signedUrl: jest.fn() };
  let service: LessonMediaService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((items: Promise<unknown>[]) => Promise.all(items));
    prisma.lesson.findUnique.mockResolvedValue({ id: 'l1' });
    prisma.lessonVideo.findUnique.mockResolvedValue(null);
    prisma.lessonMaterial.aggregate.mockResolvedValue({ _max: { position: 1 } });
    prisma.lessonVideo.upsert.mockImplementation(({ create }) =>
      Promise.resolve(makeVideo({ ...create, upload: create.upload_id ? makeUpload({ id: create.upload_id }) : null })),
    );
    prisma.lessonVideo.update.mockImplementation(({ data }) => Promise.resolve(makeVideo(data)));
    prisma.lessonMaterial.create.mockImplementation(({ data }) =>
      Promise.resolve(makeMaterial({ id: `m-${data.position}`, ...data, upload: null })),
    );
    prisma.lessonMaterial.update.mockImplementation(({ where, data }) => Promise.resolve(makeMaterial({ id: where.id, ...data })));
    uploads.signedUrl.mockResolvedValue({ url: 'http://signed', expires_at: new Date() });
    uploads.getAttachable.mockImplementation((id: string) =>
      Promise.resolve(
        makeUpload({
          id,
          mime_type: id === PNG_UPLOAD ? 'image/png' : id === PDF_UPLOAD ? 'application/pdf' : 'video/mp4',
        }),
      ),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        LessonMediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    service = moduleRef.get(LessonMediaService);
  });

  describe('setVideo', () => {
    it('attaches a video upload with its duration', async () => {
      const result = await service.setVideo('l1', { upload_id: VIDEO_UPLOAD, duration: 300, title: 'Kirish' });
      expect(uploads.getAttachable).toHaveBeenCalledWith(VIDEO_UPLOAD, 'video');
      expect(prisma.lessonVideo.upsert.mock.calls[0][0]).toMatchObject({
        where: { lesson_id: 'l1' },
        create: { lesson_id: 'l1', upload_id: VIDEO_UPLOAD, external_url: null, duration: 300, title: 'Kirish' },
      });
      expect(result).toMatchObject({ source: 'UPLOAD', upload_id: VIDEO_UPLOAD, url: 'http://signed' });
    });

    it('replaces the previous video and deletes its upload', async () => {
      prisma.lessonVideo.findUnique.mockResolvedValue(makeVideo({ upload_id: 'old' }));
      await service.setVideo('l1', { upload_id: VIDEO_UPLOAD });
      expect(uploads.deleteUploads).toHaveBeenCalledWith(['old']);
    });

    it('keeps the upload when the same one is sent again', async () => {
      prisma.lessonVideo.findUnique.mockResolvedValue(makeVideo({ upload_id: VIDEO_UPLOAD }));
      await service.setVideo('l1', { upload_id: VIDEO_UPLOAD, duration: 100 });
      expect(uploads.getAttachable).not.toHaveBeenCalled();
      expect(uploads.deleteUploads).not.toHaveBeenCalled();
    });

    it('sets an external link', async () => {
      const result = await service.setVideo('l1', { url: 'https://cdn.x/v.m3u8', duration: 120 });
      expect(result).toMatchObject({ source: 'LINK', url: 'https://cdn.x/v.m3u8', url_expires_at: null });
      expect(uploads.signedUrl).not.toHaveBeenCalled();
    });

    it('needs exactly one of upload_id and url', async () => {
      await expect(service.setVideo('l1', {})).rejects.toThrow(BadRequestException);
      await expect(service.setVideo('l1', { upload_id: VIDEO_UPLOAD, url: 'https://x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propagates upload checks and maps a concurrent attach to 409', async () => {
      uploads.getAttachable.mockRejectedValueOnce(new UnsupportedMediaTypeException());
      await expect(service.setVideo('l1', { upload_id: PDF_UPLOAD })).rejects.toThrow(UnsupportedMediaTypeException);
      prisma.lessonVideo.upsert.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.setVideo('l1', { upload_id: VIDEO_UPLOAD })).rejects.toThrow(ConflictException);
    });

    it('404s for an unknown lesson', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.setVideo('nope', { url: 'https://x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateVideo / removeVideo', () => {
    it('updates and removes the video with its upload', async () => {
      prisma.lessonVideo.findUnique.mockResolvedValue(makeVideo());
      await expect(service.updateVideo('l1', { duration: 700 })).resolves.toMatchObject({ duration: 700 });
      await service.removeVideo('l1');
      expect(prisma.lessonVideo.delete).toHaveBeenCalledWith({ where: { lesson_id: 'l1' } });
      expect(uploads.deleteUploads).toHaveBeenCalledWith(['up1']);
    });

    it('404s when the lesson has no video', async () => {
      await expect(service.updateVideo('l1', {})).rejects.toThrow(new NotFoundException('Lesson #l1 has no video'));
      await expect(service.removeVideo('l1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('materials', () => {
    it('lists materials with signed links for uploads and plain links otherwise', async () => {
      prisma.lessonMaterial.findMany.mockResolvedValue([
        makeMaterial(),
        makeMaterial({ id: 'lnk', upload: null, upload_id: null, external_url: 'https://x/a.pdf' }),
      ]);
      const result = await service.listMaterials('l1');
      expect(result.map((item) => item.url)).toEqual(['http://signed', 'https://x/a.pdf']);
    });

    it('attaches uploads and links in order, detecting the type', async () => {
      await service.addMaterials('l1', {
        items: [{ upload_id: PDF_UPLOAD }, { upload_id: PNG_UPLOAD, title: 'Xarita' }, { url: 'https://x/a.pdf' }],
      });
      expect(uploads.getAttachable).toHaveBeenCalledWith(PDF_UPLOAD, 'material');
      expect(prisma.lessonMaterial.create.mock.calls.map(([arg]) => [arg.data.type, arg.data.position])).toEqual([
        ['FILE', 2],
        ['IMAGE', 3],
        ['FILE', 4],
      ]);
    });

    it('rejects items without exactly one source and repeated uploads', async () => {
      await expect(service.addMaterials('l1', { items: [{ title: 'x' }] })).rejects.toThrow(BadRequestException);
      await expect(
        service.addMaterials('l1', { items: [{ upload_id: PDF_UPLOAD }, { upload_id: PDF_UPLOAD }] }),
      ).rejects.toThrow(new BadRequestException('An upload is listed more than once'));
      expect(prisma.lessonMaterial.create).not.toHaveBeenCalled();
    });

    it('propagates a video upload rejection', async () => {
      uploads.getAttachable.mockRejectedValueOnce(new UnsupportedMediaTypeException());
      await expect(service.addMaterials('l1', { items: [{ upload_id: VIDEO_UPLOAD }] })).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('updates and removes a material with its upload', async () => {
      prisma.lessonMaterial.findUnique.mockResolvedValue(makeMaterial());
      await expect(service.updateMaterial('mt1', { title: 'New' })).resolves.toMatchObject({ title: 'New' });
      await service.removeMaterial('mt1');
      expect(prisma.lessonMaterial.delete).toHaveBeenCalledWith({ where: { id: 'mt1' } });
      expect(uploads.deleteUploads).toHaveBeenCalledWith(['doc1']);
    });

    it('404s for an unknown material', async () => {
      prisma.lessonMaterial.findUnique.mockResolvedValue(null);
      await expect(service.updateMaterial('nope', {})).rejects.toThrow(new NotFoundException('Material #nope not found'));
      await expect(service.removeMaterial('nope')).rejects.toThrow(NotFoundException);
    });

    describe('reorderMaterials', () => {
      beforeEach(() => {
        prisma.lessonMaterial.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]).mockResolvedValueOnce([]);
      });

      it('writes the new positions', async () => {
        await service.reorderMaterials('l1', { material_ids: ['b', 'a'] });
        expect(prisma.lessonMaterial.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { position: 0 } });
        expect(prisma.lessonMaterial.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { position: 1 } });
      });

      it('requires exactly the materials of the lesson', async () => {
        await expect(service.reorderMaterials('l1', { material_ids: ['a', 'x'] })).rejects.toThrow(
          new BadRequestException('Material #x does not belong to lesson #l1'),
        );
      });

      it('rejects a partial list', async () => {
        await expect(service.reorderMaterials('l1', { material_ids: ['a'] })).rejects.toThrow(
          new BadRequestException('material_ids must list all 2 materials of the lesson'),
        );
      });
    });
  });

  it('uploadIdsOfLesson lists the video and material uploads', async () => {
    prisma.lessonVideo.findUnique.mockResolvedValue({ upload_id: 'v' });
    prisma.lessonMaterial.findMany.mockResolvedValue([{ upload_id: 'a' }, { upload_id: null }]);
    await expect(service.uploadIdsOfLesson('l1')).resolves.toEqual(['v', 'a']);
  });
});
