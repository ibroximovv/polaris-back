import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { ProgressController } from './progress.controller';
import { ProgressStatsService } from './progress-stats.service';
import { ProgressGateway } from './progress.gateway';
import { ProgressService } from './progress.service';

@Module({
  imports: [RealtimeModule],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressStatsService, ProgressGateway],
  exports: [ProgressService],
})
export class ProgressModule {}
