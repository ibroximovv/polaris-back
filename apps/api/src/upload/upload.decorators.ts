import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { envs } from '../config/envs';

interface FileUploadOptions {
  /** Form field name. Default `file`. */
  field?: string;
  required?: boolean;
  /** Per-route overrides merged over the module defaults (limits, fileFilter...). */
  multerOptions?: MulterOptions;
  /** Other form fields sent with the file (Swagger docs only; validate them with a body DTO). */
  fields?: Record<string, SchemaObject>;
}

/**
 * Single file endpoint (multipart/form-data) + Swagger docs.
 * Read the file with `@UploadedFile() file: Express.Multer.File`.
 * The module must import `UploadModule` so the global multer defaults apply.
 */
export function ApiFileUpload({ field = 'file', required = true, multerOptions, fields = {} }: FileUploadOptions = {}) {
  return applyDecorators(
    UseInterceptors(FileInterceptor(field, multerOptions)),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: required ? [field] : [],
        properties: { ...fields, [field]: { type: 'string', format: 'binary' } },
      },
    }),
  );
}

/** Multiple files under one field. Read with `@UploadedFiles() files: Express.Multer.File[]`. */
export function ApiFilesUpload({
  field = 'files',
  required = true,
  maxCount = envs.UPLOAD_MAX_FILES,
  multerOptions,
}: FileUploadOptions & { maxCount?: number } = {}) {
  return applyDecorators(
    UseInterceptors(FilesInterceptor(field, maxCount, multerOptions)),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: required ? [field] : [],
        properties: {
          [field]: { type: 'array', maxItems: maxCount, items: { type: 'string', format: 'binary' } },
        },
      },
    }),
  );
}
