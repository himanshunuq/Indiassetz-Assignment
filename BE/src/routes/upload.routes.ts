import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller';
import { validateChunkUploadHeaders } from '../middleware/upload.middleware';

export function createUploadRoutes(uploadController: UploadController): Router {
  const router = Router();

  router.post('/init', uploadController.initUpload);
  router.put(
    '/:uploadId/chunks/:chunkIndex',
    validateChunkUploadHeaders,
    uploadController.uploadChunk
  );
  router.get('/:uploadId/status', uploadController.getUploadStatus);
  router.post('/:uploadId/complete', uploadController.completeUpload);
  router.delete('/:uploadId', uploadController.deleteUpload);

  return router;
}

export function createFileRoutes(uploadController: UploadController): Router {
  const router = Router();
  router.get('/:fileId', uploadController.downloadFile);
  return router;
}
