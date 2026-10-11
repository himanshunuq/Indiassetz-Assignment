import request from 'supertest';
import fs from 'fs';
import path from 'path';
import {
  createTestEnvironment,
  generateRandomBuffer,
  computeSha256,
  computeFileSha256,
} from './test-utils';

describe('POST /api/uploads/:uploadId/complete & GET /files/:fileId & DELETE', () => {
  const env = createTestEnvironment('complete');
  const chunkSize = 512 * 1024; // 512 KiB
  const fileSize = 1280 * 1024; // 1.25 MiB -> 3 chunks: 512K, 512K, 256K
  let uploadId: string;
  let fullBuffer: Buffer;
  let chunkBuffers: Buffer[];

  beforeEach(async () => {
    await env.setup();

    // Generate test binary data
    fullBuffer = generateRandomBuffer(fileSize);
    chunkBuffers = [
      fullBuffer.subarray(0, chunkSize),
      fullBuffer.subarray(chunkSize, chunkSize * 2),
      fullBuffer.subarray(chunkSize * 2, fileSize),
    ];

    const initRes = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'report.pdf',
        fileSize,
        mimeType: 'application/pdf',
        chunkSize,
      })
      .expect(200);
    uploadId = initRes.body.uploadId;
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should reject completion when chunks are missing and list missing indexes', async () => {
    // Only upload chunk 0
    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkBuffers[0])
      .expect(200);

    const res = await request(env.getApp())
      .post(`/api/uploads/${uploadId}/complete`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MISSING_CHUNKS');
    expect(res.body.error.missingChunks).toEqual([1, 2]);
  });

  it('should complete upload when all chunks are uploaded, assemble file, and verify checksum', async () => {
    // Upload all chunks
    for (let i = 0; i < chunkBuffers.length; i++) {
      await request(env.getApp())
        .put(`/api/uploads/${uploadId}/chunks/${i}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkBuffers[i])
        .expect(200);
    }

    // Complete upload
    const completeRes = await request(env.getApp())
      .post(`/api/uploads/${uploadId}/complete`)
      .expect(200);

    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.status).toBe('completed');
    expect(completeRes.body.fileSize).toBe(fileSize);
    expect(completeRes.body.fileUrl).toContain('/files/');

    const fileId = completeRes.body.fileUrl.split('/files/')[1];

    // Verify temp chunk directory is cleaned up
    const tempDir = path.join(env.getStorageDir(), 'temp', uploadId);
    expect(fs.existsSync(tempDir)).toBe(false);

    // Verify completed file exists
    const completedFilePath = path.join(env.getStorageDir(), 'completed', `${fileId}.pdf`);
    expect(fs.existsSync(completedFilePath)).toBe(true);
    expect(fs.statSync(completedFilePath).size).toBe(fileSize);

    // Verify SHA-256 byte-for-byte identical
    const originalChecksum = computeSha256(fullBuffer);
    const assembledChecksum = await computeFileSha256(completedFilePath);
    expect(assembledChecksum).toBe(originalChecksum);

    // Download file
    const downloadRes = await request(env.getApp())
      .get(`/files/${fileId}`)
      .expect(200);

    expect(downloadRes.headers['content-type']).toContain('application/pdf');
    expect(computeSha256(downloadRes.body)).toBe(originalChecksum);
  });

  it('should support safe repeated completion requests (idempotency)', async () => {
    // Upload all chunks
    for (let i = 0; i < chunkBuffers.length; i++) {
      await request(env.getApp())
        .put(`/api/uploads/${uploadId}/chunks/${i}`)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkBuffers[i])
        .expect(200);
    }

    const first = await request(env.getApp())
      .post(`/api/uploads/${uploadId}/complete`)
      .expect(200);

    const second = await request(env.getApp())
      .post(`/api/uploads/${uploadId}/complete`)
      .expect(200);

    expect(second.body.success).toBe(true);
    expect(second.body.status).toBe('completed');
    expect(second.body.fileUrl).toBe(first.body.fileUrl);
  });

  it('should return 404 for nonexistent file download', async () => {
    const res = await request(env.getApp())
      .get('/files/00000000-0000-0000-0000-000000000000')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('should reject path traversal in file download', async () => {
    const res = await request(env.getApp())
      .get('/files/..%2F..%2Fetc%2Fpasswd')
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_FILE_ID');
  });

  it('should delete incomplete upload session and remove temporary files', async () => {
    // Upload 1 chunk
    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunkBuffers[0])
      .expect(200);

    const deleteRes = await request(env.getApp())
      .delete(`/api/uploads/${uploadId}`)
      .expect(200);

    expect(deleteRes.body.success).toBe(true);

    // Verify temp directory and metadata are deleted
    const tempDir = path.join(env.getStorageDir(), 'temp', uploadId);
    const metaPath = path.join(env.getStorageDir(), 'metadata', `${uploadId}.json`);
    expect(fs.existsSync(tempDir)).toBe(false);
    expect(fs.existsSync(metaPath)).toBe(false);

    // Further status request returns 404
    await request(env.getApp())
      .get(`/api/uploads/${uploadId}/status`)
      .expect(404);
  });
});
