// Files: uploaded once through /uploads, then attached to a lesson video/material by `upload_id`.

/** PENDING = presigned upload issued but not completed yet. */
export type UploadStatus = 'PENDING' | 'READY';

export interface Upload {
  id: string;
  file_name: string;
  mime_type: string;
  /** Bytes. */
  size: number;
  status: UploadStatus;
  /** Signed MinIO link (valid until `url_expires_at`); null while PENDING. */
  url: string | null;
  url_expires_at: string | null;
  /** Already attached to a lesson video or material (an upload can be attached once). */
  attached: boolean;
  created_at: string;
}

/**
 * Direct browser -> MinIO upload for large files: POST a multipart form with every `form.fields`
 * entry and then the file (as `file`) to `form.url`, then call `POST /uploads/:id/complete`.
 */
export interface PresignedUpload {
  upload: Upload;
  form: {
    method: 'POST';
    url: string;
    fields: Record<string, string>;
    file_field: 'file';
    max_size: number;
    expires_at: string;
  };
}
