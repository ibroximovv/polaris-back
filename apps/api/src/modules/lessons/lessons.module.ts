import { Module } from '@nestjs/common';
import { ProgressModule } from '../progress/progress.module';
import { UploadsModule } from '../uploads/uploads.module';
import { LessonMediaController } from './lesson-media.controller';
import { LessonMediaService } from './lesson-media.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [ProgressModule, UploadsModule],
  controllers: [LessonsController, LessonMediaController],
  providers: [LessonsService, LessonMediaService],
})
export class LessonsModule {}
