export class PoolError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string, options?: ErrorOptions) {
    super(detail ? `${code}: ${detail}` : code, options);
    this.name = "PoolError";
    this.code = code;
  }
}

export function errorCode(error: unknown, fallback = "unexpected_error"): string {
  return error instanceof PoolError ? error.code : fallback;
}
