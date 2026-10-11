import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';

export function validateChunkUploadHeaders(req: Request, _res: Response, next: NextFunction): void {
  const contentType = req.headers['content-type'];
  // Allow application/octet-stream or application/binary or absent in some clients, but warn if JSON
  if (contentType && contentType.includes('application/json')) {
    next(new AppError(400, 'INVALID_CONTENT_TYPE', 'Chunk upload must not be application/json. Use application/octet-stream.'));
    return;
  }
  next();
}
