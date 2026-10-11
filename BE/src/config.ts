import path from 'path';
import dotenv from 'dotenv';
import { AppConfig } from './types/upload.types';

dotenv.config();

export function validateConfig(config: AppConfig): void {
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid PORT configuration: ${config.port}`);
  }
  if (!config.host || typeof config.host !== 'string') {
    throw new Error(`Invalid HOST configuration: ${config.host}`);
  }
  if (!config.storageDir || typeof config.storageDir !== 'string') {
    throw new Error(`Invalid STORAGE_DIR configuration: ${config.storageDir}`);
  }
  if (isNaN(config.maxFileSize) || config.maxFileSize <= 0) {
    throw new Error(`Invalid MAX_FILE_SIZE configuration: ${config.maxFileSize}`);
  }
  if (isNaN(config.chunkSize) || config.chunkSize <= 0) {
    throw new Error(`Invalid CHUNK_SIZE configuration: ${config.chunkSize}`);
  }
}

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const port = overrides?.port ?? parseInt(process.env.PORT || '3000', 10);
  const host = overrides?.host ?? process.env.HOST ?? '127.0.0.1';
  const rawStorageDir = overrides?.storageDir ?? process.env.STORAGE_DIR ?? './storage';
  const storageDir = path.isAbsolute(rawStorageDir)
    ? rawStorageDir
    : path.resolve(process.cwd(), rawStorageDir);
  const maxFileSize = overrides?.maxFileSize ?? parseInt(process.env.MAX_FILE_SIZE || '104857600', 10);
  const chunkSize = overrides?.chunkSize ?? parseInt(process.env.CHUNK_SIZE || '5242880', 10);

  const cfg: AppConfig = {
    port,
    host,
    storageDir,
    maxFileSize,
    chunkSize,
  };

  validateConfig(cfg);
  return cfg;
}

export interface StoragePaths {
  storageDir: string;
  tempDir: string;
  completedDir: string;
  metadataDir: string;
}

export function getStoragePaths(storageDir: string): StoragePaths {
  return {
    storageDir,
    tempDir: path.join(storageDir, 'temp'),
    completedDir: path.join(storageDir, 'completed'),
    metadataDir: path.join(storageDir, 'metadata'),
  };
}

export const config = loadConfig();
