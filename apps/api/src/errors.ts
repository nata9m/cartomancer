/** Thrown by route handlers; mapped to a JSON body by the error handler. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, 'bad_request', message);
export const unauthorized = (message: string): HttpError =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message: string): HttpError => new HttpError(403, 'forbidden', message);
export const notFound = (message: string): HttpError => new HttpError(404, 'not_found', message);
export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message);
