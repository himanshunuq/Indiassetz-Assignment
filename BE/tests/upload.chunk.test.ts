import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { createTestEnvironment, generateRandomBuffer } from './test-utils';

describe('PUT /api/uploads/:uploadId/chunks/:chunkIndex', () => {
  const env = createTestEnvironment('chunk');
  const chunkSize = 1024 * 1024; // 1 MiB for fast testing
  const fileSize = 2560 * 1024; // 2.5 MiB -> 3 chunks: 1MB, 1MB, 0.5MB
  let uploadId: string;

  beforeEach(async () => {
    await env.setup();
    const initRes = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'sample.bin',
        fileSize,
        chunkSize,
      })
      .expect(200);
    uploadId = initRes.body.uploadId;
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should upload the first valid chunk successfully', async () => {
    const chunkData = generateRandomBuffer(chunkSize);

    const res = await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.uploadId).toBe(uploadId);
    expect(res.body.chunkIndex).toBe(0);
    expect(res.body.uploadedChunks).toEqual([0]);
    expect(res.body.totalChunks).toBe(3);

    const chunkFile = path.join(env.getStorageDir(), 'temp', uploadId, 'chunk_0');
    expect(fs.existsSync(chunkFile)).toBe(true);
    expect(fs.statSync(chunkFile).size).toBe(chunkSize);
  });

  it('should reject invalid chunk index out of bounds', async () => {
    const chunkData = generateRandomBuffer(chunkSize);

    const resNegative = await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/-1`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(400);

    expect(resNegative.body.error.code).toBe('INVALID_CHUNK_INDEX');

    const resTooHigh = await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/99`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(400);

    expect(resTooHigh.body.error.code).toBe('INVALID_CHUNK_INDEX');
  });

  it('should reject an oversized chunk', async () => {
    const oversized = generateRandomBuffer(chunkSize + 1024);

    const res = await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(oversized)
      .expect(400);

    expect(res.body.error.code).toBe('OVERSIZED_CHUNK');

    // Ensure temp chunk is not stored or left behind
    const chunkFile = path.join(env.getStorageDir(), 'temp', uploadId, 'chunk_0');
    expect(fs.existsSync(chunkFile)).toBe(false);
  });

  it('should reject an undersized chunk', async () => {
    const undersized = generateRandomBuffer(chunkSize - 100);

    const res = await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(undersized)
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_CHUNK_SIZE');
  });

  it('should accept the same chunk twice without error or corruption (idempotency)', async () => {
    const chunkData = generateRandomBuffer(chunkSize);

    // Upload first time
    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(200);

    // Upload second time
    const res = await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('already uploaded');
    expect(res.body.uploadedChunks).toEqual([0]);
  });

  it('should return 404 when uploading chunk for nonexistent upload session', async () => {
    const chunkData = generateRandomBuffer(chunkSize);

    const res = await request(env.getApp())
      .put('/api/uploads/nonexistent-id/chunks/0')
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(404);

    expect(res.body.error.code).toBe('UPLOAD_NOT_FOUND');
  });

  it('should handle interrupted stream without marking chunk complete', async () => {
    // Simulate interrupted stream directly on uploadService
    const interruptedStream = new Readable({
      read() {
        this.emit('error', new Error('Network connection severed'));
      },
    });

    await expect(
      env.getService().saveChunk(uploadId, 0, interruptedStream)
    ).rejects.toThrow();

    const status = await env.getService().getStatus(uploadId);
    expect(status.uploadedChunks).not.toContain(0);
    const chunkFile = path.join(env.getStorageDir(), 'temp', uploadId, 'chunk_0');
    expect(fs.existsSync(chunkFile)).toBe(false);
  });
});
