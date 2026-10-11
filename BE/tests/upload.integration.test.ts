import request from 'supertest';
import {
  createTestEnvironment,
  generateRandomBuffer,
  computeSha256,
} from './test-utils';

describe('End-to-End Integration Tests', () => {
  const env = createTestEnvironment('integration');

  beforeEach(async () => {
    await env.setup();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('should upload multiple files concurrently without mixing chunks or corruption', async () => {
    const fileCount = 3;
    const chunkSize = 256 * 1024; // 256 KiB
    const fileSizes = [3 * chunkSize, 2 * chunkSize, 4 * chunkSize];

    const fileBuffers = fileSizes.map((size) => generateRandomBuffer(size));
    const originalChecksums = fileBuffers.map((buf) => computeSha256(buf));

    // 1. Initialize all uploads
    const uploadSessions = await Promise.all(
      fileBuffers.map((buf, idx) =>
        request(env.getApp())
          .post('/api/uploads/init')
          .send({
            fileName: `file_${idx}.bin`,
            fileSize: buf.length,
            chunkSize,
          })
          .then((res) => {
            expect(res.status).toBe(200);
            return res.body;
          })
      )
    );

    // 2. Upload chunks concurrently across all files
    const uploadChunkPromises: Promise<unknown>[] = [];

    for (let f = 0; f < fileCount; f++) {
      const uploadId = uploadSessions[f].uploadId;
      const totalChunks = uploadSessions[f].totalChunks;
      const buf = fileBuffers[f];

      for (let c = 0; c < totalChunks; c++) {
        const start = c * chunkSize;
        const end = Math.min(start + chunkSize, buf.length);
        const chunkData = buf.subarray(start, end);

        uploadChunkPromises.push(
          request(env.getApp())
            .put(`/api/uploads/${uploadId}/chunks/${c}`)
            .set('Content-Type', 'application/octet-stream')
            .send(chunkData)
            .then((res) => {
              expect(res.status).toBe(200);
              expect(res.body.success).toBe(true);
            })
        );
      }
    }

    await Promise.all(uploadChunkPromises);

    // 3. Complete all uploads
    const completeResults = await Promise.all(
      uploadSessions.map((session) =>
        request(env.getApp())
          .post(`/api/uploads/${session.uploadId}/complete`)
          .then((res) => {
            expect(res.status).toBe(200);
            return res.body;
          })
      )
    );

    // 4. Download and verify each file
    for (let f = 0; f < fileCount; f++) {
      const fileUrl = completeResults[f].fileUrl;
      const fileId = fileUrl.split('/files/')[1];

      const downloadRes = await request(env.getApp())
        .get(`/files/${fileId}`)
        .expect(200);

      const downloadedChecksum = computeSha256(downloadRes.body);
      expect(downloadedChecksum).toBe(originalChecksums[f]);
    }
  });

  it('should resume an interrupted upload without re-uploading completed chunks', async () => {
    const chunkSize = 512 * 1024; // 512 KiB
    const totalChunks = 4;
    const fileSize = totalChunks * chunkSize; // 2 MiB
    const fileBuffer = generateRandomBuffer(fileSize);
    const originalChecksum = computeSha256(fileBuffer);

    // 1. Initialize upload
    const initRes = await request(env.getApp())
      .post('/api/uploads/init')
      .send({
        fileName: 'resumable-archive.tar',
        fileSize,
        chunkSize,
      })
      .expect(200);

    const uploadId = initRes.body.uploadId;

    // 2. Upload chunks 0 and 1, simulate network drop before chunk 2 and 3
    const chunk0 = fileBuffer.subarray(0, chunkSize);
    const chunk1 = fileBuffer.subarray(chunkSize, chunkSize * 2);

    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/0`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunk0)
      .expect(200);

    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/1`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunk1)
      .expect(200);

    // 3. Client checks status after network reconnection
    const statusRes = await request(env.getApp())
      .get(`/api/uploads/${uploadId}/status`)
      .expect(200);

    expect(statusRes.body.uploadedChunks).toEqual([0, 1]);
    expect(statusRes.body.missingChunks).toEqual([2, 3]);
    expect(statusRes.body.progress).toBe(50);

    // 4. Client only resumes uploading missing chunks (2 and 3)
    const chunk2 = fileBuffer.subarray(chunkSize * 2, chunkSize * 3);
    const chunk3 = fileBuffer.subarray(chunkSize * 3, fileSize);

    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/2`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunk2)
      .expect(200);

    await request(env.getApp())
      .put(`/api/uploads/${uploadId}/chunks/3`)
      .set('Content-Type', 'application/octet-stream')
      .send(chunk3)
      .expect(200);

    // 5. Complete upload
    const completeRes = await request(env.getApp())
      .post(`/api/uploads/${uploadId}/complete`)
      .expect(200);

    expect(completeRes.body.status).toBe('completed');
    const fileId = completeRes.body.fileUrl.split('/files/')[1];

    // 6. Download and verify integrity
    const downloadRes = await request(env.getApp())
      .get(`/files/${fileId}`)
      .expect(200);

    expect(computeSha256(downloadRes.body)).toBe(originalChecksum);
  });
});
