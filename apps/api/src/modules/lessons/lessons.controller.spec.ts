import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

describe('LessonsController', () => {
  const service = {
    findDetail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addMaterial: jest.fn(),
    updateMaterial: jest.fn(),
    removeMaterial: jest.fn(),
  };
  const user: AuthUser = { id: 'u1', role: 'USER' };
  let controller: LessonsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [LessonsController],
      providers: [{ provide: LessonsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(LessonsController);
  });

  it('delegates every route to the service', async () => {
    service.findDetail.mockResolvedValue('detail');
    service.create.mockResolvedValue('created');
    service.update.mockResolvedValue('updated');
    service.addMaterial.mockResolvedValue('material');
    service.updateMaterial.mockResolvedValue('material2');
    await expect(controller.findOne(user, 'l1')).resolves.toBe('detail');
    await expect(controller.create({ module_id: 'm1', title: 'L' })).resolves.toBe('created');
    await expect(controller.update('l1', { title: 'X' })).resolves.toBe('updated');
    await expect(controller.addMaterial('l1', { title: 'PDF', url: 'https://x' })).resolves.toBe('material');
    await expect(controller.updateMaterial('mt1', { title: 'X' })).resolves.toBe('material2');
    await controller.remove('l1');
    await controller.removeMaterial('mt1');
    expect(service.remove).toHaveBeenCalledWith('l1');
    expect(service.removeMaterial).toHaveBeenCalledWith('mt1');
  });
});
