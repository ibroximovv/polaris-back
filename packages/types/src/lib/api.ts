// Generic API response shapes shared by every module.

export type SortOrder = 'asc' | 'desc';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Body returned for every failed request (built by the global exception filter). */
export interface ApiErrorResponse {
  status_code: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  request_id?: string;
}
