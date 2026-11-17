import { Module } from '@nestjs/common';
import { createMinioClients, MINIO_CLIENTS, StorageService } from './storage.service';

/** MinIO file storage (MINIO_* envs). Import into feature modules that store files. */
@Module({
  providers: [{ provide: MINIO_CLIENTS, useFactory: () => createMinioClients() }, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
