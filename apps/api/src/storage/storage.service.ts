import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import { envs, type Envs } from '../config/envs';
import { generateFileName } from '../upload/multer.config';

export const MINIO_CLIENTS = Symbol('MINIO_CLIENTS');

/**
 * `internal` talks to MinIO from the server (upload, stat, delete). `public` only signs links
 * for browsers, so it is built for MINIO_PUBLIC_URL when MinIO is reached through another host.
 * Both have the region set, so signing never needs a network round trip.
 */
export interface MinioClients {
  internal: Client;
  public: Client;
}

type StorageEnvs = Pick<
  Envs,
  | 'MINIO_ENDPOINT'
  | 'MINIO_PORT'
  | 'MINIO_USE_SSL'
  | 'MINIO_ACCESS_KEY'
  | 'MINIO_SECRET_KEY'
  | 'MINIO_REGION'
  | 'MINIO_PUBLIC_URL'
>;

export function createMinioClients(config: StorageEnvs = envs): MinioClients {
  const credentials = { accessKey: config.MINIO_ACCESS_KEY, secretKey: config.MINIO_SECRET_KEY, region: config.MINIO_REGION };
  const internal = new Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
    ...credentials,
  });
  if (!config.MINIO_PUBLIC_URL) return { internal, public: internal };
  const url = new URL(config.MINIO_PUBLIC_URL);
  const useSSL = url.protocol === 'https:';
  const publicClient = new Client({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : useSSL ? 443 : 80,
    useSSL,
    ...credentials,
  });
  return { internal, public: publicClient };
}

export interface UploadForm {
  url: string;
  fields: Record<string, string>;
  expires_at: Date;
}

export interface SignedUrl {
  url: string;
  expires_at: Date;
}

export interface StoredObject {
  size: number;
  mime_type: string | null;
}

export interface DownloadOptions {
  /** Forces a download with this file name (instead of showing it inline). */
  attachmentName?: string;
}

/** Object storage (MinIO). Files are private; browsers get short-lived signed links. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly bucket = envs.MINIO_BUCKET;

  constructor(@Inject(MINIO_CLIENTS) private readonly clients: MinioClients) {}

  /** Creates the bucket when missing. MinIO being down must not stop the API from starting. */
  async onModuleInit(): Promise<void> {
    try {
      if (!(await this.clients.internal.bucketExists(this.bucket))) {
        await this.clients.internal.makeBucket(this.bucket, envs.MINIO_REGION);
        this.logger.log(`Created bucket "${this.bucket}"`);
      }
    } catch (error) {
      this.logger.warn(`MinIO is not reachable, file storage will fail until it is: ${errorMessage(error)}`);
    }
  }

  /** `<prefix>/<random name>.<ext>`; the original name is never part of the key. */
  buildKey(prefix: string, originalName: string): string {
    return `${prefix.replace(/^\/+|\/+$/g, '')}/${generateFileName(originalName)}`;
  }

  async uploadFile(key: string, filePath: string, mimeType: string): Promise<void> {
    await this.clients.internal.fPutObject(this.bucket, key, filePath, { 'Content-Type': mimeType });
  }

  /** Presigned POST form: the browser uploads straight to MinIO, limited to this key, type and size. */
  async createUploadForm(key: string, mimeType: string, maxSize: number): Promise<UploadForm> {
    const expiresAt = new Date(Date.now() + envs.STORAGE_UPLOAD_EXPIRES_IN * 1000);
    const policy = this.clients.public.newPostPolicy();
    policy.setBucket(this.bucket);
    policy.setKey(key);
    policy.setContentType(mimeType);
    policy.setContentLengthRange(1, maxSize);
    policy.setExpires(expiresAt);
    const { postURL, formData } = await this.clients.public.presignedPostPolicy(policy);
    const fields = Object.fromEntries(Object.entries(formData).map(([name, value]) => [name, String(value)]));
    return { url: postURL, fields, expires_at: expiresAt };
  }

  /** Size and type of a stored object, or null when it does not exist. */
  async stat(key: string): Promise<StoredObject | null> {
    try {
      const stat = await this.clients.internal.statObject(this.bucket, key);
      const contentType = stat.metaData?.['content-type'];
      return { size: stat.size, mime_type: typeof contentType === 'string' ? contentType : null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Short-lived GET link. Supports HTTP range requests, so videos can seek. */
  async getDownloadUrl(key: string, options: DownloadOptions = {}): Promise<SignedUrl> {
    const expiresIn = envs.STORAGE_URL_EXPIRES_IN;
    const headers = options.attachmentName
      ? { 'response-content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(options.attachmentName)}` }
      : undefined;
    const url = await this.clients.public.presignedGetObject(this.bucket, key, expiresIn, headers);
    return { url, expires_at: new Date(Date.now() + expiresIn * 1000) };
  }

  /** Best effort: a failed delete is logged, never thrown (the DB row is already gone). */
  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.clients.internal.removeObjects(this.bucket, keys);
    } catch (error) {
      this.logger.warn(`Could not delete ${keys.length} object(s) from "${this.bucket}": ${errorMessage(error)}`);
    }
  }
}

/** Connection failures come as an AggregateError with an empty message; fall back to its code. */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  return error.message || (typeof code === 'string' ? code : error.name);
}

function isNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'NotFound' || code === 'NoSuchKey';
}
