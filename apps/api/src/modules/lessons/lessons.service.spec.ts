import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from '../progress/progress.service';
import { LessonMediaService } from './lesson-media.service';
import { makeMaterial, makeVideo } from './lesson-media.test-helpers';
import { type LessonRecord, LessonsService } from './lessons.service';

const date = new Date('2026-01-01T00:00:00.000Z');
const record: LessonRecord = {
  id: 'l1',
  module_id: 'm1',
  title: 'Lesson 1',
  description: null,
  content: '# Guide',
  position: 0,
  created_at: date,
  updated_at: date,
};
const student: AuthUser = { id: 'u1', role: 'USER' };
const admin: AuthUser = { id: 'a1', role: 'ADMIN' };

describe('LessonsService', () => {
  const prisma = {
    lesson: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  const progress = { assertLessonOpen: jest.fn() };
  const media = {
    toVideo: jest.fn(),
    toMaterials: jest.fn(),
    listMaterials: jest.fn(),
    uploadIdsOfLesson: jest.fn(),
    deleteUploads: jest.fn(),
  };
  let service: LessonsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProgressService, useValue: progress },
        { provide: LessonMediaService, useValue: media },
      ],
    }).compile();
    service = moduleRef.get(LessonsService);
  });

  describe('findDetail', () => {
    it('returns the video, ordered materials with signed links and a test summary', async () => {
      const video = makeVideo();
      const materials = [makeMaterial(), makeMaterial({ id: 'mt2', type: 'IMAGE', position: 1 })];
      prisma.lesson.findUnique.mockResolvedValue({
        ...record,
        video,
        materials,
        test: {
          id: 't1',
          lesson_id: 'l1',
          module_id: null,
          title: null,
          total_points: 100,
          pass_score: 70,
          max_attempts: null,
          created_at: date,
          updated_at: date,
          _count: { questions: 5 },
        },
      });
      media.toVideo.mockResolvedValue('video');
      media.toMaterials.mockResolvedValue(['mt1', 'mt2']);
      const result = await service.findDetail(student, 'l1');
      expect(progress.assertLessonOpen).toHaveBeenCalledWith(student, 'l1');
      expect(media.toVideo).toHaveBeenCalledWith(video);
      expect(media.toMaterials).toHaveBeenCalledWith(materials);
      expect(result).toMatchObject({ video: 'video', materials: ['mt1', 'mt2'] });
      expect(result.test).toEqual({
        id: 't1',
        kind: 'LESSON',
        title: null,
        total_points: 100,
        pass_score: 70,
        max_attempts: null,
        question_count: 5,
      });
    });

    it('returns null video and test when the lesson has none', async () => {
      prisma.lesson.findUnique.mockResolvedValue({ ...record, video: null, materials: [], test: null });
      media.toMaterials.mockResolvedValue([]);
      await expect(service.findDetail(admin, 'l1')).resolves.toMatchObject({ video: null, materials: [], test: null });
      expect(media.toVideo).not.toHaveBeenCalled();
    });

    it('propagates a locked lesson', async () => {
      progress.assertLessonOpen.mockRejectedValue(new ForbiddenException());
      await expect(service.findDetail(student, 'l2')).rejects.toThrow(ForbiddenException);
      expect(prisma.lesson.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a lesson removed meanwhile', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.findDetail(admin, 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMaterials', () => {
    it('checks the lesson is open', async () => {
      media.listMaterials.mockResolvedValue(['m']);
      await expect(service.listMaterials(student, 'l1')).resolves.toEqual(['m']);
      expect(media.listMaterials).toHaveBeenCalledWith('l1');
    });

    it('propagates a locked lesson', async () => {
      progress.assertLessonOpen.mockRejectedValue(new ForbiddenException());
      await expect(service.listMaterials(student, 'l2')).rejects.toThrow(ForbiddenException);
    });
  });

  it('creates a lesson', async () => {
    prisma.lesson.create.mockResolvedValue(record);
    await expect(service.create({ module_id: 'm1', title: 'Lesson 1' })).resolves.toMatchObject({ id: 'l1' });
  });

  describe('remove', () => {
    it('deletes the lesson and then its uploads', async () => {
      prisma.lesson.findUnique.mockResolvedValue(record);
      media.uploadIdsOfLesson.mockResolvedValue(['up1']);
      await service.remove('l1');
      expect(prisma.lesson.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
      expect(media.deleteUploads).toHaveBeenCalledWith(['up1']);
    });

    it('keeps the uploads when the lesson does not exist', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      media.uploadIdsOfLesson.mockResolvedValue([]);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
      expect(media.deleteUploads).not.toHaveBeenCalled();
    });
  });
});
