import http from 'http';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PORT = 3099;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const STORAGE_DIR = path.resolve('test-e2e-storage');

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(rawBuffer.toString('utf-8'));
          } catch {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json || rawBuffer,
            buffer: rawBuffer,
          });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runSmokeTest() {
  console.log('--- Starting ChunkFlow API E2E Smoke & Integration Test ---');

  // Clean storage dir if exists
  if (fs.existsSync(STORAGE_DIR)) {
    fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  }

  // Launch server process
  const serverProcess = spawn('node', ['dist/src/server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST,
      STORAGE_DIR,
      CHUNK_SIZE: '5242880', // 5 MiB
      MAX_FILE_SIZE: '104857600', // 100 MiB
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => console.log(`[Server stdout] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[Server stderr] ${d.toString().trim()}`));

  // Wait for server to be up
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request('GET', '/health');
      if (res.statusCode === 200 && res.body?.status === 'ok') {
        isReady = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!isReady) {
    serverProcess.kill('SIGKILL');
    throw new Error('Server failed to start in time');
  }

  console.log('✓ Step 1: Health check smoke test passed');

  try {
    // Generate binary test file of 15 MiB (exactly 3 chunks of 5 MiB)
    const chunkSize = 5 * 1024 * 1024; // 5 MiB
    const fileSize = 3 * chunkSize; // 15 MiB
    console.log(`Generating ${fileSize} bytes test binary file (3 x 5 MiB)...`);
    const testBuffer = crypto.randomBytes(fileSize);
    const originalChecksum = crypto.createHash('sha256').update(testBuffer).digest('hex');
    console.log(`Original file SHA-256: ${originalChecksum}`);

    // Step 2: Initialize upload
    const initRes = await request(
      'POST',
      '/api/uploads/init',
      { 'Content-Type': 'application/json' },
      {
        fileName: 'smoke_test_15mb.bin',
        fileSize,
        mimeType: 'application/octet-stream',
        chunkSize,
      }
    );

    if (initRes.statusCode !== 200 || !initRes.body.success) {
      throw new Error(`Init failed: ${JSON.stringify(initRes.body)}`);
    }

    const uploadId = initRes.body.uploadId;
    console.log(`✓ Step 2: Initialized upload with ID: ${uploadId}, totalChunks: ${initRes.body.totalChunks}`);

    // Step 3: Upload chunk 0
    const chunk0 = testBuffer.subarray(0, chunkSize);
    const chunk0Res = await request(
      'PUT',
      `/api/uploads/${uploadId}/chunks/0`,
      { 'Content-Type': 'application/octet-stream' },
      chunk0
    );

    if (chunk0Res.statusCode !== 200 || !chunk0Res.body.success) {
      throw new Error(`Chunk 0 upload failed: ${JSON.stringify(chunk0Res.body)}`);
    }
    console.log('✓ Step 3: Uploaded chunk 0 successfully');

    // Step 4: Simulate interruption and inspect status
    const statusRes = await request('GET', `/api/uploads/${uploadId}/status`);
    if (statusRes.statusCode !== 200 || !statusRes.body.success) {
      throw new Error(`Status check failed: ${JSON.stringify(statusRes.body)}`);
    }

    if (
      JSON.stringify(statusRes.body.uploadedChunks) !== JSON.stringify([0]) ||
      JSON.stringify(statusRes.body.missingChunks) !== JSON.stringify([1, 2])
    ) {
      throw new Error(`Status mismatch: ${JSON.stringify(statusRes.body)}`);
    }
    console.log(`✓ Step 4: Interruption verified: uploadedChunks = [0], missingChunks = [1, 2], progress = ${statusRes.body.progress}%`);

    // Step 5: Resume upload by sending missing chunks 1 and 2
    const chunk1 = testBuffer.subarray(chunkSize, chunkSize * 2);
    const chunk1Res = await request(
      'PUT',
      `/api/uploads/${uploadId}/chunks/1`,
      { 'Content-Type': 'application/octet-stream' },
      chunk1
    );
    if (chunk1Res.statusCode !== 200) throw new Error('Chunk 1 upload failed');

    const chunk2 = testBuffer.subarray(chunkSize * 2, fileSize);
    const chunk2Res = await request(
      'PUT',
      `/api/uploads/${uploadId}/chunks/2`,
      { 'Content-Type': 'application/octet-stream' },
      chunk2
    );
    if (chunk2Res.statusCode !== 200) throw new Error('Chunk 2 upload failed');

    console.log('✓ Step 5: Resumed and uploaded remaining chunks 1 and 2 successfully');

    // Verify status shows 100%
    const statusCompleteRes = await request('GET', `/api/uploads/${uploadId}/status`);
    if (statusCompleteRes.body.progress !== 100 || statusCompleteRes.body.missingChunks.length !== 0) {
      throw new Error(`Expected 100% progress: ${JSON.stringify(statusCompleteRes.body)}`);
    }
    console.log('✓ Step 6: All chunks recorded, progress is 100%');

    // Step 7: Complete upload
    const completeRes = await request(
      'POST',
      `/api/uploads/${uploadId}/complete`,
      { 'Content-Type': 'application/json' },
      {}
    );

    if (completeRes.statusCode !== 200 || !completeRes.body.success) {
      throw new Error(`Complete failed: ${JSON.stringify(completeRes.body)}`);
    }

    const fileUrl = completeRes.body.fileUrl;
    const fileId = fileUrl.split('/files/')[1];
    console.log(`✓ Step 7: File assembled successfully. File URL: ${fileUrl}`);

    // Step 8: Download completed file
    const downloadRes = await request('GET', `/files/${fileId}`);
    if (downloadRes.statusCode !== 200) {
      throw new Error(`Download failed with status ${downloadRes.statusCode}`);
    }

    const downloadedChecksum = crypto.createHash('sha256').update(downloadRes.buffer).digest('hex');
    console.log(`Downloaded file SHA-256: ${downloadedChecksum}`);

    if (downloadedChecksum !== originalChecksum) {
      throw new Error(`Checksum mismatch! Original: ${originalChecksum}, Downloaded: ${downloadedChecksum}`);
    }
    console.log('✓ Step 8: Checksum match verified! Byte-for-byte identical.');

    // Step 9: Verify repeated completion idempotency
    const repeatedCompleteRes = await request(
      'POST',
      `/api/uploads/${uploadId}/complete`,
      { 'Content-Type': 'application/json' },
      {}
    );
    if (repeatedCompleteRes.statusCode !== 200 || repeatedCompleteRes.body.fileUrl !== fileUrl) {
      throw new Error('Repeated complete failed');
    }
    console.log('✓ Step 9: Repeated completion idempotency verified');

    console.log('\n=========================================');
    console.log('🎉 ALL SMOKE & INTEGRATION CHECKS PASSED!');
    console.log('=========================================\n');
  } finally {
    serverProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (fs.existsSync(STORAGE_DIR)) {
      fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
    }
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
