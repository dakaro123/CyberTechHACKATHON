export class DomainError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new DomainError(400, code, message);
export const notFound = (code: string, message: string) => new DomainError(404, code, message);
export const conflict = (code: string, message: string) => new DomainError(409, code, message);
