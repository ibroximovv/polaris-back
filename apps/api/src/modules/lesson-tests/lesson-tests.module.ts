import { Module } from '@nestjs/common';
import { ProgressModule } from '../progress/progress.module';
import { LessonTestsController } from './lesson-tests.controller';
import { LessonTestsService } from './lesson-tests.service';

@Module({
  imports: [ProgressModule],
  controllers: [LessonTestsController],
  providers: [LessonTestsService],
})
export class LessonTestsModule {}
