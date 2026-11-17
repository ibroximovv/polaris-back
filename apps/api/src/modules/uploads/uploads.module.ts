import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { UploadModule } from '../../upload/upload.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/** Route `/uploads`: every file enters here; other modules attach uploads by id via UploadsService. */
@Module({
  imports: [StorageModule, UploadModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
