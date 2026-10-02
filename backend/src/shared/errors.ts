export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

/** Срок доступа аккаунта истёк (пилотный доступ холдинга). Фронт показывает отдельный текст, не «неверный пароль». */
export class AccessExpiredError extends AppError {
  constructor(message = 'Срок доступа к кабинету истёк') {
    super(403, message, 'ACCESS_EXPIRED');
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(400, message, code);
  }
}
