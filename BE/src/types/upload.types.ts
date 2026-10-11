export type UploadStatus = 'uploading' | 'completed';

export interface UploadMetadata {
  uploadId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  status: UploadStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  fileId?: string;
  fileUrl?: string;
}

export interface InitUploadDto {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  chunkSize?: number;
}

export interface InitUploadResponse {
  success: true;
  uploadId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  status: UploadStatus;
}

export interface ChunkUploadResponse {
  success: true;
  uploadId: string;
  chunkIndex: number;
  uploadedChunks: number[];
  totalChunks: number;
  message: string;
}

export interface UploadStatusResponse {
  success: true;
  uploadId: string;
  status: UploadStatus;
  totalChunks: number;
  uploadedChunks: number[];
  missingChunks: number[];
  progress: number;
}

export interface CompleteUploadResponse {
  success: true;
  uploadId: string;
  status: 'completed';
  fileName: string;
  fileSize: number;
  fileUrl: string;
  message: string;
}

export interface DeleteUploadResponse {
  success: true;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    missingChunks?: number[];
    [key: string]: unknown;
  };
}

export interface AppConfig {
  port: number;
  host: string;
  storageDir: string;
  maxFileSize: number;
  chunkSize: number;
}
