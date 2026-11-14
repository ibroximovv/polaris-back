import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { type CourseModuleRecord, CourseModulesService } from './course-modules.service';

const date = new Date('2026-01-01T00:00:00.000Z');
const record: CourseModuleRecord = {
  id: 'm1',
  course_id: 'c1',
  title: 'Module 1',
  description: null,
  position: 0,
  created_at: date,
  updated_at: date,
};

describe('CourseModulesService', () => {
  const prisma = {
    courseModule: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  let service: CourseModulesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CourseModulesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CourseModulesService);
  });

  it('creates a module', async () => {
    prisma.courseModule.create.mockResolvedValue(record);
    await expect(service.create({ course_id: 'c1', title: 'Module 1' })).resolves.toMatchObject({
      id: 'm1',
      created_at: date.toISOString(),
    });
  });

  it('maps an unknown course (P2003) to BadRequestException', async () => {
    prisma.courseModule.create.mockRejectedValue({ code: 'P2003' });
    await expect(service.create({ course_id: 'nope', title: 'X' })).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when updating a missing module', async () => {
    prisma.courseModule.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { title: 'X' })).rejects.toThrow(new NotFoundException('Module #nope not found'));
  });
});
