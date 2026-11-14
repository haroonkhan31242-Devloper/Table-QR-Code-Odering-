export type AppErrorCode =
  | 'validation'
  | 'not_found'
  | 'permission'
  | 'business_isolation'
  | 'auth'
  | 'conflict'
  | 'storage_quota'
  | 'storage';

export class AppError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export const fail = {
  validation: (msg: string) => new AppError('validation', msg),
  notFound: (what: string) => new AppError('not_found', `${what} was not found.`),
  permission: (msg = 'You do not have permission to perform this action.') => new AppError('permission', msg),
  otherBusiness: () => new AppError('business_isolation', 'Access denied: this record belongs to another restaurant.'),
  auth: (msg: string) => new AppError('auth', msg),
  conflict: (msg: string) => new AppError('conflict', msg),
};

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException) && !(err instanceof Error)) return false;
  const e = err as DOMException;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}
