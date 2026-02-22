export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', status = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotImplementedError extends AppError {
  constructor(message) {
    super(message, 'NOT_IMPLEMENTED', 501);
    this.name = 'NotImplementedError';
  }
}
