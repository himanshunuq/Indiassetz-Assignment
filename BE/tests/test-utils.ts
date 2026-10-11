import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createApp, AppInstance } from '../src/app';

export function createTestEnvironment(testName: string) {
  const testStorageDir = path.resolve(
    __dirname,
    `../test-storage-${testName}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  let appInstance: AppInstance;

  const setup = async () => {
    await fsp.mkdir(testStorageDir, { recursive: true });
    appInstance = createApp({
      storageDir: testStorageDir,
      maxFileSize: 104857600, // 100 MiB
      chunkSize: 5242880, // 5 MiB
    });
    await appInstance.uploadService.initializeStorage();
    return appInstance;
  };

  const cleanup = async () => {
    try {
      await fsp.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  };

  return {
    getApp: () => appInstance.app,
    getService: () => appInstance.uploadService,
    getConfig: () => appInstance.config,
    getStorageDir: () => testStorageDir,
    setup,
    cleanup,
  };
}

export function generateRandomBuffer(size: number): Buffer {
  return crypto.randomBytes(size);
}

export function computeSha256(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
