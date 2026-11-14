import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

describe('CoursesController', () => {
  const service = { findAllFor: jest.fn(), findDetail: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const user: AuthUser = { id: 'u1', role: 'USER' };
  let controller: CoursesController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [{ provide: CoursesService, useValue: service }],
    }).compile();
    controller = moduleRef.get(CoursesController);
  });

  it('delegates every route to the service', async () => {
    service.findAllFor.mockResolvedValue('list');
    service.findDetail.mockResolvedValue('detail');
    service.create.mockResolvedValue('created');
    service.update.mockResolvedValue('updated');
    const query = { page: 1, limit: 20, sort_order: 'desc' as const };
    await expect(controller.findAll(user, query)).resolves.toBe('list');
    await expect(controller.findOne(user, 'c1')).resolves.toBe('detail');
    await expect(controller.create({ title: 'T' })).resolves.toBe('created');
    await expect(controller.update('c1', { is_published: true })).resolves.toBe('updated');
    await controller.remove('c1');
    expect(service.remove).toHaveBeenCalledWith('c1');
  });
});
