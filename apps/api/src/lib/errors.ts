// Section 7: { error: { code, message, details, request_id } }.
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details: unknown[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, 'not_found', message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, 'unauthorized', message);
  }
}

export class ConflictError extends ApiError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(
    message: string,
    public retryAfterSeconds: number,
  ) {
    super(429, 'rate_limited', message);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details: unknown[] = []) {
    super(400, 'validation_error', message, details);
  }
}
