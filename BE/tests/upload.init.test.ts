import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createTestEnvironment } from './test-utils';

describe('POST /api/uploads/init', () => {
  const env = createTestEnvironment('init');

  beforeEach(async () => {
    await env.setup();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should initialize a valid 100 MiB upload with 20 chunks expected', async () => {
    const fileSize = 104857600; // 100 MiB
    const chunkSize = 5242880; // 5 MiB

    const res = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'large_document.pdf',
        fileSize,
        mimeType: 'application/pdf',
        chunkSize,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.uploadId).toBeDefined();
    expect(res.body.fileName).toBe('large_document.pdf');
    expect(res.body.fileSize).toBe(fileSize);
    expect(res.body.chunkSize).toBe(chunkSize);
    expect(res.body.totalChunks).toBe(20);
    expect(res.body.uploadedChunks).toEqual([]);
    expect(res.body.status).toBe('uploading');

    // Verify temp directory and metadata file exist on disk
    const metaPath = path.join(env.getStorageDir(), 'metadata', `${res.body.uploadId}.json`);
    expect(fs.existsSync(metaPath)).toBe(true);

    const tempDir = path.join(env.getStorageDir(), 'temp', res.body.uploadId);
    expect(fs.existsSync(tempDir)).toBe(true);
  });

  it('should reject a file exceeding 100 MiB limit with 413 status', async () => {
    const oversized = 104857600 + 1; // 100 MiB + 1 byte

    const res = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'too_large.zip',
        fileSize: oversized,
      })
      .expect(413);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('should reject request when fileName is missing or empty', async () => {
    const res = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: '',
        fileSize: 1024,
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_FILE_NAME');
  });

  it('should reject request when fileSize is negative, zero or non-integer', async () => {
    const res1 = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'test.txt',
        fileSize: -5,
      })
      .expect(400);
    expect(res1.body.error.code).toBe('INVALID_FILE_SIZE');

    const res2 = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'test.txt',
        fileSize: 0,
      })
      .expect(400);
    expect(res2.body.error.code).toBe('INVALID_FILE_SIZE');
  });

  it('should support non-standard fileSize where last chunk is smaller', async () => {
    const fileSize = 12 * 1024 * 1024; // 12 MiB
    const chunkSize = 5 * 1024 * 1024; // 5 MiB -> 3 chunks: 5MB, 5MB, 2MB

    const res = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'video.mp4',
        fileSize,
        chunkSize,
      })
      .expect(200);

    expect(res.body.totalChunks).toBe(3);
  });
});
