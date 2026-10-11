import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/upload.service';
import { AppError } from '../middleware/error.middleware';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? param[0] : param;
}

export class UploadController {
  private uploadService: UploadService;

  constructor(uploadService: UploadService) {
    this.uploadService = uploadService;
  }

  private getBaseUrl(req: Request): string {
    const host = req.get('host') || 'localhost:3000';
    return `${req.protocol}://${host}`;
  }

  initUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.uploadService.initUpload(req.body);
      res.status(200).json({
        success: true,
        uploadId: result.uploadId,
        fileName: result.fileName,
        fileSize: result.fileSize,
        chunkSize: result.chunkSize,
        totalChunks: result.totalChunks,
        uploadedChunks: result.uploadedChunks,
        status: result.status,
      });
    } catch (err) {
      next(err);
    }
  };

  uploadChunk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uploadId = getParam(req.params.uploadId);
      const rawIndex = getParam(req.params.chunkIndex);
      const chunkIndex = parseInt(rawIndex, 10);

      if (isNaN(chunkIndex)) {
        throw new AppError(400, 'INVALID_CHUNK_INDEX', 'Chunk index must be an integer.');
      }

      const result = await this.uploadService.saveChunk(uploadId, chunkIndex, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getUploadStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uploadId = getParam(req.params.uploadId);
      const result = await this.uploadService.getStatus(uploadId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  completeUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uploadId = getParam(req.params.uploadId);
      const baseUrl = this.getBaseUrl(req);
      const result = await this.uploadService.completeUpload(uploadId, baseUrl);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  downloadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fileId = getParam(req.params.fileId);
      const fileInfo = await this.uploadService.getFile(fileId);

      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Content-Length', fileInfo.fileSize);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`
      );

      res.sendFile(fileInfo.filePath);
    } catch (err) {
      next(err);
    }
  };

  deleteUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uploadId = getParam(req.params.uploadId);
      await this.uploadService.deleteUpload(uploadId);
      res.status(200).json({
        success: true,
        message: 'Upload session deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}
