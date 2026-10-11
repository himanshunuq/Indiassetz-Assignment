import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { loadConfig } from './config';
import { AppConfig } from './types/upload.types';
import { UploadService } from './services/upload.service';
import { UploadController } from './controllers/upload.controller';
import { createUploadRoutes, createFileRoutes } from './routes/upload.routes';
import { errorHandler, AppError } from './middleware/error.middleware';

export interface AppInstance {
  app: Express;
  uploadService: UploadService;
  config: AppConfig;
}

export function createApp(configOverrides?: Partial<AppConfig>): AppInstance {
  const cfg = loadConfig(configOverrides);
  const uploadService = new UploadService(cfg);
  const uploadController = new UploadController(uploadService);

  const app = express();

  app.use(cors());

  // Skip JSON parsing for raw binary chunk upload requests so streams remain unconsumed
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'PUT' && req.path.includes('/chunks/')) {
      next();
      return;
    }
    express.json({ limit: '1mb' })(req, res, next);
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'ChunkFlow-API',
      timestamp: new Date().toISOString(),
    });
  });

  // API endpoints
  app.use('/api/uploads', createUploadRoutes(uploadController));
  app.use('/files', createFileRoutes(uploadController));

  // Catch-all for undefined routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found.`));
  });

  // Centralized error handler
  app.use(errorHandler);

  return { app, uploadService, config: cfg };
}

const defaultInstance = createApp();
export const app = defaultInstance.app;
export const uploadService = defaultInstance.uploadService;
export default app;
