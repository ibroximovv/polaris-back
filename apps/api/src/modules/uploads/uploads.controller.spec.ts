import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

describe('UploadsController', () => {
  const service = { upload: jest.fn(), createPresigned: jest.fn(), complete: jest.fn(), findOne: jest.fn(), remove: jest.fn() };
  const admin: AuthUser = { id: 'a1', role: 'ADMIN' };
  let controller: UploadsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(UploadsController);
    for (const fn of Object.values(service)) fn.mockResolvedValue('ok');
  });

  it('delegates every route', async () => {
    await expect(controller.upload(admin, undefined)).resolves.toBe('ok');
    expect(service.upload).toHaveBeenCalledWith(admin, []);
    const dto = { file_name: 'a.mp4', mime_type: 'video/mp4', size: 10 };
    await controller.createPresigned(admin, dto);
    await controller.complete('u1');
    await controller.findOne('u1');
    await controller.remove('u1');
    expect(service.createPresigned).toHaveBeenCalledWith(admin, dto);
    expect(service.complete).toHaveBeenCalledWith('u1');
    expect(service.findOne).toHaveBeenCalledWith('u1');
    expect(service.remove).toHaveBeenCalledWith('u1');
  });
});
