import { Test } from '@nestjs/testing';
import { CourseModulesController } from './course-modules.controller';
import { CourseModulesService } from './course-modules.service';

describe('CourseModulesController', () => {
  const service = { create: jest.fn(), findOne: jest.fn() };
  let controller: CourseModulesController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CourseModulesController],
      providers: [{ provide: CourseModulesService, useValue: service }],
    }).compile();
    controller = moduleRef.get(CourseModulesController);
  });

  it('delegates CRUD to the service', async () => {
    service.create.mockResolvedValue('created');
    service.findOne.mockResolvedValue('module');
    await expect(controller.create({ course_id: 'c1', title: 'M' })).resolves.toBe('created');
    await expect(controller.findOne('m1')).resolves.toBe('module');
  });
});
