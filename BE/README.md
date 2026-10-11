# ChunkFlow API

ChunkFlow is the backend for the file upload app in `fileUpload/`. It receives files in small pieces (chunks), so a large file can be uploaded in parts and missing parts can be retried.

This backend was fully vibe-coded with AI assistance.

## What you need

- Node.js 22.11 or newer
- npm

## Run it on your computer

From the project root, open a terminal and run:

```sh
cd BE
npm install
cp .env.example .env
npm run dev
```

The API will be available at `http://127.0.0.1:3000`. Keep this terminal open while using the app. Uploaded files are saved in `BE/storage/completed/`; the storage folders are created automatically.

## Connect a phone on your Wi-Fi

To upload from a physical phone, the phone and computer must be on the same Wi-Fi network.

1. In `BE/.env`, set `HOST=0.0.0.0`.
2. Find your computer's Wi-Fi IP address. On a Mac, run `ipconfig getifaddr en0`.
3. In `fileUpload/src/services/uploadService.tsx`, set `BASE_URL` to `http://<your-computer-ip>:3000`. For example: `http://192.168.1.50:3000`.
4. Restart the backend and the mobile app. Allow Node.js through your computer's firewall if prompted.

Use the IP address from your own computer, not the example. `10.0.2.2` is for an Android emulator; it will not work from a physical phone. Only expose the `0.0.0.0` development server to a trusted local network.

## Upload settings

The defaults are a **100 MiB maximum file size** and **5 MiB chunks**. You can change `PORT`, `HOST`, `STORAGE_DIR`, `MAX_FILE_SIZE`, and `CHUNK_SIZE` in `.env`.

## API endpoints

- `POST /api/uploads/init` — start an upload
- `PUT /api/uploads/:uploadId/chunks/:chunkIndex` — send one chunk
- `GET /api/uploads/:uploadId/status` — check progress and find missing chunks
- `POST /api/uploads/:uploadId/complete` — assemble the uploaded chunks into a file
- `DELETE /api/uploads/:uploadId` — cancel an upload and remove its temporary data
- `GET /files/:fileId` — download a completed file
- `GET /health` — check that the API is running

## Run the checks

From `BE/`:

```sh
npm test
npm run typecheck
npm run lint
npm run test:e2e
```
