import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { type CourseRecord, CoursesService, toCourseResponse } from './courses.service';

const date = new Date('2026-01-01T00:00:00.000Z');
const record: CourseRecord = {
  id: 'c1',
  title: 'Guide course',
  description: null,
  cover_url: null,
  is_published: true,
  created_at: date,
  updated_at: date,
};
const student: AuthUser = { id: 'u1', role: 'USER' };
const admin: AuthUser = { id: 'a1', role: 'ADMIN' };
const query = { page: 1, limit: 20, sort_order: 'desc' as const };

describe('CoursesService', () => {
  const prisma = {
    course: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: CoursesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CoursesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CoursesService);
  });

  it('toCourseResponse serializes dates', () => {
    expect(toCourseResponse(record)).toMatchObject({ id: 'c1', created_at: date.toISOString() });
  });

  describe('findAllFor', () => {
    it('shows students only published courses', async () => {
      prisma.course.findMany.mockResolvedValue([record]);
      prisma.course.count.mockResolvedValue(1);
      const result = await service.findAllFor(student, { ...query, search: 'guide' });
      expect(result.data).toHaveLength(1);
      expect(prisma.course.findMany.mock.calls[0][0].where).toEqual({
        is_published: true,
        title: { contains: 'guide', mode: 'insensitive' },
      });
    });

    it('shows admins every course', async () => {
      prisma.course.findMany.mockResolvedValue([record]);
      prisma.course.count.mockResolvedValue(1);
      await service.findAllFor(admin, query);
      expect(prisma.course.findMany.mock.calls[0][0]).not.toHaveProperty('where');
    });

    it('rejects an unsupported sort field', async () => {
      await expect(service.findAllFor(student, { ...query, sort_by: 'secret' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findDetail', () => {
    const detail = {
      ...record,
      modules: [
        {
          id: 'm1',
          course_id: 'c1',
          title: 'Module',
          description: null,
          position: 0,
          created_at: date,
          updated_at: date,
          lessons: [
            {
              id: 'l1',
              title: 'Lesson',
              position: 0,
              video: { duration: 60 },
              test: { id: 't1', total_points: 100 },
            },
          ],
          test: {
            id: 'mt1',
            lesson_id: null,
            module_id: 'm1',
            title: 'Final',
            total_points: 50,
            pass_score: 70,
            max_attempts: null,
            created_at: date,
            updated_at: date,
            _count: { questions: 10 },
          },
        },
      ],
    };

    it('returns the course outline', async () => {
      prisma.course.findUnique.mockResolvedValue(detail);
      const result = await service.findDetail(student, 'c1');
      expect(result.modules[0].lessons).toEqual([
        { id: 'l1', title: 'Lesson', position: 0, has_video: true, video_duration: 60, has_test: true },
      ]);
      expect(result.modules[0].test).toEqual({
        id: 'mt1',
        kind: 'MODULE',
        title: 'Final',
        total_points: 50,
        pass_score: 70,
        max_attempts: null,
        question_count: 10,
      });
    });

    it('hides unpublished courses from students', async () => {
      prisma.course.findUnique.mockResolvedValue({ ...detail, is_published: false });
      await expect(service.findDetail(student, 'c1')).rejects.toThrow(new NotFoundException('Course #c1 not found'));
      await expect(service.findDetail(admin, 'c1')).resolves.toMatchObject({ id: 'c1' });
    });
  });
});
