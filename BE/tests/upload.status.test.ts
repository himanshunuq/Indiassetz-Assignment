import request from 'supertest';
import { createTestEnvironment, generateRandomBuffer } from './test-utils';

describe('GET /api/uploads/:uploadId/status', () => {
  const env = createTestEnvironment('status');
  const chunkSize = 1024 * 1024; // 1 MiB
  const fileSize = 2560 * 1024; // 2.5 MiB -> chunk 0 (1MB), chunk 1 (1MB), chunk 2 (0.5MB)
  let uploadId: string;

  beforeEach(async () => {
    await env.setup();
    const initRes = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'track.mp3',
        fileSize,
        chunkSize,
      })
      .expect(200);
    uploadId = initRes.body.uploadId;
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should return 0% progress and all chunks missing initially', async () => {
    const res = await request(env.getApp())
      .get(`/api/uploads/${uploadId}/status`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.uploadId).toBe(uploadId);
    expect(res.body.status).toBe('uploading');
    expect(res.body.totalChunks).toBe(3);
    expect(res.body.uploadedChunks).toEqual([]);
    expect(res.body.missingChunks).toEqual([0, 1, 2]);
    expect(res.body.progress).toBe(0);
  });

  it('should accurately calculate uploaded/missing chunks and byte-based progress', async () => {
    // Upload chunk 0 (1 MiB / 2.5 MiB = 40%)
    const chunk0 = generateRandomBuffer(chunkSize);
    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunk0)
      .expect(200);

    const res1 = await request(env.getApp())
      .get(`/api/uploads/${uploadId}/status`)
      .expect(200);

    expect(res1.body.uploadedChunks).toEqual([0]);
    expect(res1.body.missingChunks).toEqual([1, 2]);
    expect(res1.body.progress).toBe(40);

    // Upload chunk 2 (0.5 MiB, total uploaded: 1.5 MiB / 2.5 MiB = 60%)
    const chunk2 = generateRandomBuffer(512 * 1024);
    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/2`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunk2)
      .expect(200);

    const res2 = await request(env.getApp())
      .get(`/api/uploads/${uploadId}/status`)
      .expect(200);

    expect(res2.body.uploadedChunks).toEqual([0, 2]);
    expect(res2.body.missingChunks).toEqual([1]);
    expect(res2.body.progress).toBe(60);
  });

  it('should return 404 for nonexistent upload session', async () => {
    const res = await request(env.getApp())
      .get('/api/uploads/nonexistent-session/status')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UPLOAD_NOT_FOUND');
  });
});
