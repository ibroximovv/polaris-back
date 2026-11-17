import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { LessonMediaController } from './lesson-media.controller';
import { LessonMediaService } from './lesson-media.service';
import { LessonsService } from './lessons.service';

describe('LessonMediaController', () => {
  const media = {
    setVideo: jest.fn(),
    updateVideo: jest.fn(),
    removeVideo: jest.fn(),
    addMaterials: jest.fn(),
    reorderMaterials: jest.fn(),
    updateMaterial: jest.fn(),
    removeMaterial: jest.fn(),
  };
  const lessons = { listMaterials: jest.fn() };
  const user: AuthUser = { id: 'u1', role: 'USER' };
  let controller: LessonMediaController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [LessonMediaController],
      providers: [
        { provide: LessonMediaService, useValue: media },
        { provide: LessonsService, useValue: lessons },
      ],
    }).compile();
    controller = moduleRef.get(LessonMediaController);
    for (const fn of Object.values(media)) fn.mockResolvedValue('ok');
    lessons.listMaterials.mockResolvedValue('list');
  });

  it('delegates video routes', async () => {
    await expect(controller.setVideo('l1', { upload_id: 'u', duration: 60 })).resolves.toBe('ok');
    await controller.updateVideo('l1', { title: 'T' });
    await controller.removeVideo('l1');
    expect(media.setVideo).toHaveBeenCalledWith('l1', { upload_id: 'u', duration: 60 });
    expect(media.updateVideo).toHaveBeenCalledWith('l1', { title: 'T' });
    expect(media.removeVideo).toHaveBeenCalledWith('l1');
  });

  it('delegates material routes', async () => {
    await expect(controller.listMaterials(user, 'l1')).resolves.toBe('list');
    await controller.addMaterials('l1', { items: [{ url: 'https://x/a.pdf' }] });
    await controller.reorderMaterials('l1', { material_ids: ['m1'] });
    await controller.updateMaterial('m1', { title: 'T' });
    await controller.removeMaterial('m1');
    expect(media.addMaterials).toHaveBeenCalledWith('l1', { items: [{ url: 'https://x/a.pdf' }] });
    expect(media.reorderMaterials).toHaveBeenCalledWith('l1', { material_ids: ['m1'] });
    expect(media.removeMaterial).toHaveBeenCalledWith('m1');
  });
});
