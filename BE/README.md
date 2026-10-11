# ChunkFlow API

**ChunkFlow API** is a high-performance, type-safe REST API backend built with Node.js, Express.js, and TypeScript for resumable chunked file uploads from mobile applications (such as React Native CLI apps) and web clients.

## Key Features

- **Chunked File Uploads**: Upload large files (up to 100 MiB) in 5 MiB chunks.
- **Stream-Based Processing**: Raw chunk bytes are streamed directly to disk, avoiding high memory consumption.
- **Resumable Uploads**: Upload sessions track individual chunks. Interrupted uploads can be resumed without re-uploading completed chunks.
- **Independent Sessions**: Multiple files can be uploaded concurrently with full isolation and per-session mutex locking.
- **Zero Database Requirement**: All chunk states, upload sessions, and completed files are stored on the local filesystem.
- **Integrity Validation**: Chunks are verified by size on arrival, and files are assembled in ascending order with strict size checks.
- **Security Protections**: Path traversal prevention, file size limits, safe file naming, and sanitization.
- **Persistent Across Restarts**: Metadata and chunks reside on disk, allowing sessions to resume even if the server restarts.

---

## Architecture & Directory Structure

```text
BE/
├── src/
│   ├── app.ts                         # Express application factory and middleware setup
│   ├── server.ts                      # Server entry point and graceful shutdown
│   ├── config.ts                      # Environment configuration and path resolution
│   ├── controllers/
│   │   └── upload.controller.ts       # HTTP request handlers for uploads and files
│   ├── services/
│   │   └── upload.service.ts          # Core business logic, streaming, and assembly
│   ├── routes/
│   │   └── upload.routes.ts           # Express route definitions
│   ├── middleware/
│   │   ├── error.middleware.ts        # Centralized error handler and AppError class
│   │   └── upload.middleware.ts       # Chunk upload header validation
│   ├── utils/
│   │   ├── file.utils.ts              # Filesystem utilities (checksums, safe unlink, path checks)
│   │   └── upload.utils.ts            # Math calculations and per-session AsyncLock
│   └── types/
│       └── upload.types.ts            # TypeScript interfaces and response types
├── storage/                           # Local storage (created automatically)
│   ├── temp/                          # Temporary chunk files per upload session
│   ├── completed/                     # Assembled completed files
│   └── metadata/                      # Upload session JSON metadata
├── tests/
│   ├── test-utils.ts                  # Test environment helpers and SHA-256 calculators
│   ├── upload.init.test.ts            # Tests for upload initialization
│   ├── upload.chunk.test.ts           # Tests for chunk streaming and validation
│   ├── upload.status.test.ts          # Tests for progress and missing chunk calculation
│   ├── upload.complete.test.ts        # Tests for file assembly, download, and deletion
│   ├── upload.integration.test.ts     # End-to-end multi-file concurrency and resume tests
│   └── e2e-smoke-runner.mjs           # Standalone E2E smoke runner with SHA-256 verification
├── .env.example
├── .gitignore
├── eslint.config.mjs
├── jest.config.js
├── package.json
├── tsconfig.json
└── README.md
```

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (Tested on Node.js v24)
- **npm**: v9.0.0 or higher

---

## Installation & Environment Setup

1. Navigate to the backend directory:
   ```bash
   cd BE
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create the `.env` configuration file:
   ```bash
   cp .env.example .env
   ```

### Configuration Options (`.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `HOST` | Network interface to bind (`127.0.0.1` for local, `0.0.0.0` for LAN access) | `127.0.0.1` |
| `STORAGE_DIR` | Directory path for chunks, metadata, and final files | `./storage` |
| `MAX_FILE_SIZE` | Maximum allowed file size in bytes (100 MiB = `104857600`) | `104857600` |
| `CHUNK_SIZE` | Standard chunk size in bytes (5 MiB = `5242880`) | `5242880` |

> **Connecting from a Physical Mobile Device:**
> When testing from a physical phone on the same Wi-Fi network:
> 1. Set `HOST=0.0.0.0` in `.env`.
> 2. Find your computer's local IP address (e.g. `ipconfig` or `ifconfig` / `ip route`, e.g. `192.168.1.50`).
> 3. Use `http://192.168.1.50:3000` as the API base URL in your React Native app.

---

## Running the Application

### Development Mode (with hot-reload)
```bash
npm run dev
```

### Production Build & Run
```bash
npm run build
npm start
```

---

## API Endpoints Reference

Base path: `/api/uploads`

### 1. Initialize an Upload
Creates an isolated upload session and creates temporary storage for chunks.

- **Method**: `POST`
- **URL**: `/api/uploads/init`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "fileName": "document.pdf",
    "fileSize": 104857600,
    "mimeType": "application/pdf",
    "chunkSize": 5242880
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "uploadId": "3f9c6e3b-9a42-491a-a0f5-56434440c88a",
    "fileName": "document.pdf",
    "fileSize": 104857600,
    "chunkSize": 5242880,
    "totalChunks": 20,
    "uploadedChunks": [],
    "status": "uploading"
  }
  ```

---

### 2. Upload a Chunk
Streams the raw binary bytes of a single chunk directly to temporary storage.

- **Method**: `PUT`
- **URL**: `/api/uploads/:uploadId/chunks/:chunkIndex`
- **Headers**: `Content-Type: application/octet-stream`
- **Body**: Raw binary bytes of chunk `chunkIndex` (0-indexed).
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "uploadId": "3f9c6e3b-9a42-491a-a0f5-56434440c88a",
    "chunkIndex": 0,
    "uploadedChunks": [0],
    "totalChunks": 20,
    "message": "Chunk uploaded successfully"
  }
  ```
- **Duplicate Uploads**: If the chunk has already been uploaded, the endpoint safely drains the input and returns `{ "message": "Chunk already uploaded" }` without corrupting files.

---

### 3. Get Upload Status
Returns current upload progress and lists both uploaded and missing chunks. Use this after network disconnection to resume.

- **Method**: `GET`
- **URL**: `/api/uploads/:uploadId/status`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "uploadId": "3f9c6e3b-9a42-491a-a0f5-56434440c88a",
    "status": "uploading",
    "totalChunks": 20,
    "uploadedChunks": [0, 1, 2],
    "missingChunks": [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    "progress": 15
  }
  ```

---

### 4. Complete the Upload
Validates all chunks, verifies byte sizes, sequentially streams and merges chunks into the final file, and returns the file download URL.

- **Method**: `POST`
- **URL**: `/api/uploads/:uploadId/complete`
- **Headers**: `Content-Type: application/json`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "uploadId": "3f9c6e3b-9a42-491a-a0f5-56434440c88a",
    "status": "completed",
    "fileName": "document.pdf",
    "fileSize": 104857600,
    "fileUrl": "http://127.0.0.1:3000/files/6c858509-f538-4221-9954-bf9f430722fe",
    "message": "File uploaded and assembled successfully"
  }
  ```
- **Error if Chunks are Missing** (`400 Bad Request`):
  ```json
  {
    "success": false,
    "error": {
      "code": "MISSING_CHUNKS",
      "message": "Cannot complete upload because some chunks are missing.",
      "missingChunks": [5, 6, 7]
    }
  }
  ```

---

### 5. Download Completed File
Downloads or accesses the assembled file.

- **Method**: `GET`
- **URL**: `/files/:fileId`
- **Response** (`200 OK`): Raw file stream with `Content-Type` matching original MIME type and `Content-Disposition: attachment; filename="document.pdf"`.
- **404 Not Found**: Returned when `fileId` is invalid or not found.

---

### 6. Delete Upload Session
Cancels an incomplete upload session and deletes temporary chunks and metadata from disk.

- **Method**: `DELETE`
- **URL**: `/api/uploads/:uploadId`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Upload session deleted successfully"
  }
  ```

---

### 7. Health Check
- **Method**: `GET`
- **URL**: `/health`
- **Response** (`200 OK`):
  ```json
  {
    "status": "ok",
    "service": "ChunkFlow-API",
    "timestamp": "2026-10-10T22:00:00.000Z"
  }
  ```

---

## Step-by-Step Testing with `curl`

### 1. Initialize Upload
```bash
INIT_RESPONSE=$(curl -s -X POST http://127.0.0.1:3000/api/uploads/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"testfile.dat","fileSize":15728640,"chunkSize":5242880}')

echo $INIT_RESPONSE
# Extract uploadId:
UPLOAD_ID=$(echo $INIT_RESPONSE | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)
echo "Upload ID: $UPLOAD_ID"
```

### 2. Create and Upload Chunks
```bash
# Create a 15 MiB dummy file
dd if=/dev/urandom of=testfile.dat bs=1048576 count=15

# Split into 5 MiB chunks
split -b 5242880 -d testfile.dat chunk_

# Upload chunk 0
curl -s -X PUT "http://127.0.0.1:3000/api/uploads/$UPLOAD_ID/chunks/0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_00

# Check status
curl -s -X GET "http://127.0.0.1:3000/api/uploads/$UPLOAD_ID/status"

# Upload remaining chunks (chunk 1 and 2)
curl -s -X PUT "http://127.0.0.1:3000/api/uploads/$UPLOAD_ID/chunks/1" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_01

curl -s -X PUT "http://127.0.0.1:3000/api/uploads/$UPLOAD_ID/chunks/2" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_02
```

### 3. Complete and Download
```bash
# Complete upload
COMPLETE_RESPONSE=$(curl -s -X POST "http://127.0.0.1:3000/api/uploads/$UPLOAD_ID/complete" \
  -H "Content-Type: application/json")
echo $COMPLETE_RESPONSE

# Download assembled file
FILE_URL=$(echo $COMPLETE_RESPONSE | grep -o '"fileUrl":"[^"]*' | cut -d'"' -f4)
curl -s -o downloaded_file.dat "$FILE_URL"

# Compare SHA-256 checksums (they will be identical)
shasum -a 256 testfile.dat
shasum -a 256 downloaded_file.dat

# Cleanup local test chunks
rm -f testfile.dat chunk_0* downloaded_file.dat
```

---

## Resuming an Interrupted Upload Flow

When an upload is interrupted (e.g., mobile device loses connectivity):

1. **Query Status**: Client calls `GET /api/uploads/:uploadId/status`.
2. **Read `missingChunks`**: The response contains an array of indices that still need to be sent (e.g. `missingChunks: [4, 5, 6]`).
3. **Resume Transfer**: The client loops exclusively over `missingChunks` and sends each chunk via `PUT /api/uploads/:uploadId/chunks/:chunkIndex`.
4. **Finalize**: Once all missing chunks are uploaded, client calls `POST /api/uploads/:uploadId/complete`.

---

## Automated Testing

Run the full automated test suite:

```bash
# Run unit & integration tests with Jest
npm test

# Run end-to-end smoke test with 15 MiB file and SHA-256 validation
npm run test:e2e

# Run TypeScript compilation check
npm run typecheck

# Run ESLint linter
npm run lint
```

---

## Concurrency & Reliability

- **Per-Session Mutex (`AsyncLock`)**: Serializes operations for a given `uploadId`, eliminating race conditions between concurrent chunk uploads, completion, or deletion.
- **Multiple Uploads Concurrency**: Uploads with different `uploadId`s execute in parallel without blocking each other.
- **Atomic Disk Writes**: Chunks and metadata are written to temporary part files (`.part` / `.tmp`) and atomically renamed once fully verified.
- **Assembly Safety**: File assembly streams directly to an `.assembling` temporary file before atomically renaming to the completed file path.
- **Server Restart Persistence**: Sessions are backed by `storage/metadata/<uploadId>.json` and chunk files under `storage/temp/<uploadId>/`. Upon restart, all state and uploaded chunks remain intact.

---

## Security Considerations

1. **Path Traversal Protection**: All user-supplied filenames and file IDs are strictly sanitized and validated against whitelist regexes and directory containment checks (`isSafePath`).
2. **File Size Enforcement**: Requests exceeding 100 MiB (`MAX_FILE_SIZE`) are rejected before allocation. Individual chunk sizes are strictly verified against expected chunk byte boundaries.
3. **Local Binding**: The server defaults to binding to `127.0.0.1` to prevent unintended public exposure during development.
4. **No Stack Traces in Production**: Uncaught errors are caught by `error.middleware.ts` and return standardized JSON without revealing internal server paths or stack traces.
