import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ProgressService } from '../progress/progress.service';
import { type LessonRecord, LessonsService } from './lessons.service';

const date = new Date('2026-01-01T00:00:00.000Z');
const record: LessonRecord = {
  id: 'l1',
  module_id: 'm1',
  title: 'Lesson 1',
  description: null,
  content: '# Guide',
  video_url: 'https://cdn.example.com/v.m3u8',
  video_duration: 600,
  position: 0,
  created_at: date,
  updated_at: date,
};
const material = { id: 'mt1', lesson_id: 'l1', title: 'PDF', url: 'https://x/y.pdf', position: 0, created_at: date, updated_at: date };
const student: AuthUser = { id: 'u1', role: 'USER' };

describe('LessonsService', () => {
  const prisma = {
    lesson: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    lessonMaterial: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  const progress = { assertLessonOpen: jest.fn() };
  let service: LessonsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProgressService, useValue: progress },
      ],
    }).compile();
    service = moduleRef.get(LessonsService);
  });

  describe('findDetail', () => {
    it('returns the lesson with materials and a test summary', async () => {
      prisma.lesson.findUnique.mockResolvedValue({
        ...record,
        materials: [material],
        test: { id: 't1', title: null, pass_score: 70, max_attempts: null, _count: { questions: 5 } },
      });
      const result = await service.findDetail(student, 'l1');
      expect(progress.assertLessonOpen).toHaveBeenCalledWith(student, 'l1');
      expect(result.materials).toEqual([{ id: 'mt1', lesson_id: 'l1', title: 'PDF', url: 'https://x/y.pdf', position: 0 }]);
      expect(result.test).toEqual({ id: 't1', title: null, pass_score: 70, max_attempts: null, question_count: 5 });
    });

    it('propagates a locked lesson', async () => {
      progress.assertLessonOpen.mockRejectedValue(new ForbiddenException());
      await expect(service.findDetail(student, 'l2')).rejects.toThrow(ForbiddenException);
      expect(prisma.lesson.findUnique).not.toHaveBeenCalled();
    });
  });

  it('creates a lesson', async () => {
    prisma.lesson.create.mockResolvedValue(record);
    await expect(service.create({ module_id: 'm1', title: 'Lesson 1' })).resolves.toMatchObject({ id: 'l1' });
  });

  describe('materials', () => {
    it('adds a material to an existing lesson', async () => {
      prisma.lesson.findUnique.mockResolvedValue(record);
      prisma.lessonMaterial.create.mockResolvedValue(material);
      await expect(service.addMaterial('l1', { title: 'PDF', url: 'https://x/y.pdf' })).resolves.toMatchObject({ id: 'mt1' });
      expect(prisma.lessonMaterial.create).toHaveBeenCalledWith({
        data: { title: 'PDF', url: 'https://x/y.pdf', lesson_id: 'l1' },
      });
    });

    it('throws NotFoundException for an unknown lesson', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.addMaterial('nope', { title: 'PDF', url: 'https://x' })).rejects.toThrow(NotFoundException);
    });

    it('updates and removes a material', async () => {
      prisma.lessonMaterial.findUnique.mockResolvedValue(material);
      prisma.lessonMaterial.update.mockResolvedValue({ ...material, title: 'New' });
      await expect(service.updateMaterial('mt1', { title: 'New' })).resolves.toMatchObject({ title: 'New' });
      await service.removeMaterial('mt1');
      expect(prisma.lessonMaterial.delete).toHaveBeenCalledWith({ where: { id: 'mt1' } });
    });

    it('throws NotFoundException for an unknown material', async () => {
      prisma.lessonMaterial.findUnique.mockResolvedValue(null);
      await expect(service.updateMaterial('nope', {})).rejects.toThrow(new NotFoundException('Material #nope not found'));
      await expect(service.removeMaterial('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
