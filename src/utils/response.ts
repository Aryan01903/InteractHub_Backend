export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(data: T, message?: string): ApiSuccess<T> {
  return message === undefined
    ? { success: true, data }
    : { success: true, data, message };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function page<T>(items: T[], nextCursor: string | null): Page<T> {
  return { items, nextCursor, hasMore: nextCursor !== null };
}
