import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  AppConfig,
  InitUploadDto,
  UploadMetadata,
  ChunkUploadResponse,
  UploadStatusResponse,
  CompleteUploadResponse,
} from '../types/upload.types';
import { getStoragePaths, StoragePaths } from '../config';
import {
  ensureDirExists,
  safeUnlink,
  safeRmDir,
  getFileSize,
  sanitizeFileName,
  isSafePath,
} from '../utils/file.utils';
import {
  calculateExpectedChunks,
  getExpectedChunkSize,
  calculateProgress,
  AsyncLock,
} from '../utils/upload.utils';
import { AppError } from '../middleware/error.middleware';

export class UploadService {
  private config: AppConfig;
  private paths: StoragePaths;
  private lock = new AsyncLock();

  constructor(config: AppConfig) {
    this.config = config;
    this.paths = getStoragePaths(config.storageDir);
  }

  async initializeStorage(): Promise<void> {
    await ensureDirExists(this.paths.tempDir);
    await ensureDirExists(this.paths.completedDir);
    await ensureDirExists(this.paths.metadataDir);
  }

  private getMetadataPath(uploadId: string): string {
    return path.join(this.paths.metadataDir, `${uploadId}.json`);
  }

  private getTempUploadDir(uploadId: string): string {
    return path.join(this.paths.tempDir, uploadId);
  }

  private async loadMetadata(uploadId: string): Promise<UploadMetadata | null> {
    const metaPath = this.getMetadataPath(uploadId);
    try {
      const data = await fsp.readFile(metaPath, 'utf-8');
      return JSON.parse(data) as UploadMetadata;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  private async saveMetadata(metadata: UploadMetadata): Promise<void> {
    await ensureDirExists(this.paths.metadataDir);
    const metaPath = this.getMetadataPath(metadata.uploadId);
    const tempPath = `${metaPath}.${Date.now()}.tmp`;
    await fsp.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8');
    await fsp.rename(tempPath, metaPath);
  }

  async initUpload(dto: InitUploadDto): Promise<UploadMetadata> {
    const { fileName, fileSize, mimeType, chunkSize: reqChunkSize } = dto;

    if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
      throw new AppError(400, 'INVALID_FILE_NAME', 'File name must be a non-empty string.');
    }

    if (
      fileSize === undefined ||
      fileSize === null ||
      typeof fileSize !== 'number' ||
      !Number.isInteger(fileSize) ||
      fileSize <= 0
    ) {
      throw new AppError(400, 'INVALID_FILE_SIZE', 'File size must be a positive integer.');
    }

    if (fileSize > this.config.maxFileSize) {
      throw new AppError(
        413,
        'FILE_TOO_LARGE',
        `File size (${fileSize} bytes) exceeds maximum limit of ${this.config.maxFileSize} bytes.`
      );
    }

    const chunkSize = reqChunkSize || this.config.chunkSize;
    if (typeof chunkSize !== 'number' || !Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new AppError(400, 'INVALID_CHUNK_SIZE', 'Chunk size must be a positive integer.');
    }

    const sanitized = sanitizeFileName(fileName);
    if (!sanitized) {
      throw new AppError(400, 'INVALID_FILE_NAME', 'File name is invalid.');
    }

    const totalChunks = calculateExpectedChunks(fileSize, chunkSize);
    const uploadId = crypto.randomUUID();

    const tempDir = this.getTempUploadDir(uploadId);
    await ensureDirExists(tempDir);

    const now = new Date().toISOString();
    const metadata: UploadMetadata = {
      uploadId,
      fileName: sanitized,
      fileSize,
      mimeType: mimeType || 'application/octet-stream',
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      status: 'uploading',
      createdAt: now,
      updatedAt: now,
    };

    await this.saveMetadata(metadata);
    return metadata;
  }

  async saveChunk(
    uploadId: string,
    chunkIndex: number,
    stream: NodeJS.ReadableStream
  ): Promise<ChunkUploadResponse> {
    return this.lock.run(uploadId, async () => {
      const drainStream = async () => {
        await new Promise<void>((resolve) => {
          stream.on('end', resolve);
          stream.on('error', () => resolve());
          stream.on('close', resolve);
          stream.resume();
        });
      };

      const metadata = await this.loadMetadata(uploadId);
      if (!metadata) {
        await drainStream();
        throw new AppError(404, 'UPLOAD_NOT_FOUND', `Upload session ${uploadId} not found.`);
      }

      if (metadata.status !== 'uploading') {
        await drainStream();
        throw new AppError(
          409,
          'UPLOAD_NOT_ACCEPTING_CHUNKS',
          `Upload session ${uploadId} is in status '${metadata.status}' and no longer accepts chunks.`
        );
      }

      if (
        typeof chunkIndex !== 'number' ||
        !Number.isInteger(chunkIndex) ||
        chunkIndex < 0 ||
        chunkIndex >= metadata.totalChunks
      ) {
        await drainStream();
        throw new AppError(
          400,
          'INVALID_CHUNK_INDEX',
          `Chunk index ${chunkIndex} is invalid. Expected range [0, ${metadata.totalChunks - 1}].`
        );
      }

      const expectedSize = getExpectedChunkSize(
        chunkIndex,
        metadata.totalChunks,
        metadata.fileSize,
        metadata.chunkSize
      );

      const tempDir = this.getTempUploadDir(uploadId);
      await ensureDirExists(tempDir);

      const chunkFinalPath = path.join(tempDir, `chunk_${chunkIndex}`);
      const chunkPartPath = path.join(tempDir, `chunk_${chunkIndex}.part.${Date.now()}`);

      // Check if already uploaded and valid on disk
      if (metadata.uploadedChunks.includes(chunkIndex)) {
        try {
          const existingSize = await getFileSize(chunkFinalPath);
          if (existingSize === expectedSize) {
            // Already present and valid
            await drainStream();
            return {
              success: true,
              uploadId,
              chunkIndex,
              uploadedChunks: metadata.uploadedChunks,
              totalChunks: metadata.totalChunks,
              message: 'Chunk already uploaded',
            };
          }
        } catch {
          // File missing on disk, proceed with re-upload
        }
      }

      // Stream request body directly to disk
      let receivedBytes = 0;
      let errorOccurred = false;

      try {
        await new Promise<void>((resolve, reject) => {
          const fileWriteStream = fs.createWriteStream(chunkPartPath);

          const cleanup = async () => {
            fileWriteStream.destroy();
            await safeUnlink(chunkPartPath);
          };

          stream.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > expectedSize) {
              errorOccurred = true;
              void cleanup().finally(() => {
                reject(
                  new AppError(
                    400,
                    'OVERSIZED_CHUNK',
                    `Chunk size exceeds the expected size of ${expectedSize} bytes.`
                  )
                );
              });
            }
          });

          stream.on('error', (err) => {
            errorOccurred = true;
            void cleanup().finally(() => {
              reject(
                new AppError(
                  400,
                  'CHUNK_UPLOAD_INTERRUPTED',
                  `Stream error while receiving chunk: ${err.message}`
                )
              );
            });
          });

          stream.on('aborted', () => {
            errorOccurred = true;
            void cleanup().finally(() => {
              reject(
                new AppError(
                  400,
                  'CHUNK_UPLOAD_INTERRUPTED',
                  'Request was aborted while uploading chunk.'
                )
              );
            });
          });

          fileWriteStream.on('error', (err) => {
            errorOccurred = true;
            void cleanup().finally(() => {
              reject(
                new AppError(
                  500,
                  'DISK_WRITE_FAILURE',
                  `Failed to write chunk to disk: ${err.message}`
                )
              );
            });
          });

          fileWriteStream.on('finish', () => {
            if (!errorOccurred) {
              resolve();
            }
          });

          stream.pipe(fileWriteStream);
        });

        // Enforce exact expected chunk size
        if (receivedBytes !== expectedSize) {
          await safeUnlink(chunkPartPath);
          throw new AppError(
            400,
            'INVALID_CHUNK_SIZE',
            `Received ${receivedBytes} bytes, but expected exactly ${expectedSize} bytes for chunk ${chunkIndex}.`
          );
        }

        // Atomically move to final chunk location
        await fsp.rename(chunkPartPath, chunkFinalPath);

        // Update metadata
        if (!metadata.uploadedChunks.includes(chunkIndex)) {
          metadata.uploadedChunks.push(chunkIndex);
          metadata.uploadedChunks.sort((a, b) => a - b);
        }
        metadata.updatedAt = new Date().toISOString();
        await this.saveMetadata(metadata);

        return {
          success: true,
          uploadId,
          chunkIndex,
          uploadedChunks: metadata.uploadedChunks,
          totalChunks: metadata.totalChunks,
          message: 'Chunk uploaded successfully',
        };
      } catch (err) {
        await safeUnlink(chunkPartPath);
        throw err;
      }
    });
  }

  async getStatus(uploadId: string): Promise<UploadStatusResponse> {
    const metadata = await this.loadMetadata(uploadId);
    if (!metadata) {
      throw new AppError(404, 'UPLOAD_NOT_FOUND', `Upload session ${uploadId} not found.`);
    }

    const uploadedSet = new Set(metadata.uploadedChunks);
    const missingChunks: number[] = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      if (!uploadedSet.has(i)) {
        missingChunks.push(i);
      }
    }

    const progress = calculateProgress(
      metadata.fileSize,
      metadata.chunkSize,
      metadata.totalChunks,
      metadata.uploadedChunks
    );

    return {
      success: true,
      uploadId,
      status: metadata.status,
      totalChunks: metadata.totalChunks,
      uploadedChunks: metadata.uploadedChunks,
      missingChunks,
      progress,
    };
  }

  async completeUpload(uploadId: string, baseUrl: string): Promise<CompleteUploadResponse> {
    return this.lock.run(uploadId, async () => {
      const metadata = await this.loadMetadata(uploadId);
      if (!metadata) {
        throw new AppError(404, 'UPLOAD_NOT_FOUND', `Upload session ${uploadId} not found.`);
      }

      // Safe repeated completion
      if (metadata.status === 'completed') {
        return {
          success: true,
          uploadId,
          status: 'completed',
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          fileUrl: metadata.fileUrl || `${baseUrl}/files/${metadata.fileId}`,
          message: 'File uploaded and assembled successfully',
        };
      }

      // Check for missing chunks
      const uploadedSet = new Set(metadata.uploadedChunks);
      const missingChunks: number[] = [];
      for (let i = 0; i < metadata.totalChunks; i++) {
        if (!uploadedSet.has(i)) {
          missingChunks.push(i);
        }
      }

      if (missingChunks.length > 0) {
        throw new AppError(
          400,
          'MISSING_CHUNKS',
          'Cannot complete upload because some chunks are missing.',
          { missingChunks }
        );
      }

      const tempDir = this.getTempUploadDir(uploadId);

      // Verify each chunk file exists on disk and has the expected size
      let totalVerifiedBytes = 0;
      for (let i = 0; i < metadata.totalChunks; i++) {
        const chunkPath = path.join(tempDir, `chunk_${i}`);
        const expectedSize = getExpectedChunkSize(
          i,
          metadata.totalChunks,
          metadata.fileSize,
          metadata.chunkSize
        );

        try {
          const actualSize = await getFileSize(chunkPath);
          if (actualSize !== expectedSize) {
            throw new AppError(
              400,
              'CORRUPTED_CHUNK',
              `Chunk ${i} has size ${actualSize} bytes, expected ${expectedSize} bytes.`,
              { chunkIndex: i }
            );
          }
          totalVerifiedBytes += actualSize;
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(
            400,
            'MISSING_CHUNKS',
            `Chunk ${i} file is missing from disk.`,
            { missingChunks: [i] }
          );
        }
      }

      if (totalVerifiedBytes !== metadata.fileSize) {
        throw new AppError(
          400,
          'FILE_SIZE_MISMATCH',
          `Total chunk size (${totalVerifiedBytes} bytes) does not equal original file size (${metadata.fileSize} bytes).`
        );
      }

      // Assemble final file using streams
      const fileId = crypto.randomUUID();
      const ext = path.extname(metadata.fileName);
      const completedFileName = `${fileId}${ext}`;
      const completedFilePath = path.join(this.paths.completedDir, completedFileName);
      const assemblingPath = path.join(this.paths.completedDir, `${fileId}.assembling`);

      await ensureDirExists(this.paths.completedDir);

      try {
        const writeStream = fs.createWriteStream(assemblingPath, { flags: 'w' });

        for (let i = 0; i < metadata.totalChunks; i++) {
          const chunkPath = path.join(tempDir, `chunk_${i}`);
          await new Promise<void>((resolve, reject) => {
            const readStream = fs.createReadStream(chunkPath);
            readStream.on('error', reject);
            writeStream.on('error', reject);
            readStream.on('end', resolve);
            readStream.pipe(writeStream, { end: false });
          });
        }

        await new Promise<void>((resolve, reject) => {
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
          writeStream.end();
        });

        // Verify final file size
        const finalSize = await getFileSize(assemblingPath);
        if (finalSize !== metadata.fileSize) {
          await safeUnlink(assemblingPath);
          throw new AppError(
            500,
            'ASSEMBLY_SIZE_MISMATCH',
            `Assembled file size (${finalSize}) does not match expected size (${metadata.fileSize}).`
          );
        }

        // Atomically publish completed file
        await fsp.rename(assemblingPath, completedFilePath);

        // Update metadata
        const fileUrl = `${baseUrl}/files/${fileId}`;
        metadata.status = 'completed';
        metadata.completedAt = new Date().toISOString();
        metadata.updatedAt = new Date().toISOString();
        metadata.fileId = fileId;
        metadata.fileUrl = fileUrl;
        await this.saveMetadata(metadata);

        // Clean up temporary chunk files
        await safeRmDir(tempDir);

        return {
          success: true,
          uploadId,
          status: 'completed',
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          fileUrl,
          message: 'File uploaded and assembled successfully',
        };
      } catch (err) {
        await safeUnlink(assemblingPath);
        throw err;
      }
    });
  }

  async getFile(fileId: string): Promise<{
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }> {
    // Prevent path traversal
    if (!fileId || typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      throw new AppError(400, 'INVALID_FILE_ID', 'Invalid file identifier.');
    }

    // Find metadata with this fileId
    let targetMetadata: UploadMetadata | null = null;
    try {
      const metaFiles = await fsp.readdir(this.paths.metadataDir);
      for (const metaFile of metaFiles) {
        if (metaFile.endsWith('.json')) {
          const content = await fsp.readFile(
            path.join(this.paths.metadataDir, metaFile),
            'utf-8'
          );
          try {
            const parsed = JSON.parse(content) as UploadMetadata;
            if (parsed.fileId === fileId) {
              targetMetadata = parsed;
              break;
            }
          } catch {
            // Ignore corrupted metadata files
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }

    if (!targetMetadata) {
      throw new AppError(404, 'FILE_NOT_FOUND', `File ${fileId} not found.`);
    }

    const ext = path.extname(targetMetadata.fileName);
    const targetFilePath = path.join(this.paths.completedDir, `${fileId}${ext}`);

    if (!isSafePath(this.paths.completedDir, targetFilePath)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied.');
    }

    try {
      const stat = await fsp.stat(targetFilePath);
      return {
        filePath: targetFilePath,
        fileName: targetMetadata.fileName,
        mimeType: targetMetadata.mimeType || 'application/octet-stream',
        fileSize: stat.size,
      };
    } catch {
      throw new AppError(404, 'FILE_NOT_FOUND', `File ${fileId} not found on disk.`);
    }
  }

  async deleteUpload(uploadId: string): Promise<void> {
    return this.lock.run(uploadId, async () => {
      const metadata = await this.loadMetadata(uploadId);
      if (!metadata) {
        throw new AppError(404, 'UPLOAD_NOT_FOUND', `Upload session ${uploadId} not found.`);
      }

      if (metadata.status === 'completed') {
        throw new AppError(
          400,
          'UPLOAD_ALREADY_COMPLETED',
          'Cannot delete an upload session that has already completed.'
        );
      }

      // Clean up temporary chunks
      const tempDir = this.getTempUploadDir(uploadId);
      await safeRmDir(tempDir);

      // Clean up metadata
      const metaPath = this.getMetadataPath(uploadId);
      await safeUnlink(metaPath);
    });
  }
}
