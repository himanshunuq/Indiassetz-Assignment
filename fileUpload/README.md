# File Uploader

A small React Native and TypeScript app for selecting and uploading files in 5 MB chunks.

## Run the app

Install dependencies:

```sh
npm install
```

Start Metro on port 8081:

```sh
npm start -- --port 8081
```

In a second terminal, run one platform:

```sh
npm run android -- --port 8081
npm run ios -- --port 8081
```

For a first iOS setup, install CocoaPods dependencies with `cd ios && pod install` before running the iOS command.

The app expects the upload API at `http://10.0.2.2:3000`, which is the Android emulator address for a server running on your computer. Change `BASE_URL` in `src/services/uploadService.tsx` for the iOS simulator or a physical device.

The API should implement:

- `POST /api/uploads/init`
- `PUT /api/uploads/:uploadId/chunks/:chunkIndex`
- `GET /api/uploads/:uploadId/status`
- `POST /api/uploads/:uploadId/complete`

## How it works

- `src/components/filePickerButton.tsx` handles file selection and shows each file's size, progress, status, error, and available actions.
- Files larger than 100 MB are rejected before upload, with an explanation shown in the app.
- Each accepted file gets its own upload task. Files upload at the same time, and users can select more files while uploads are running.
- `src/utils/chunkUploader.tsx` copies a selected file to app cache, slices it into 5 MB chunks, and sends those chunks one at a time. Progress is based on successful chunks.
- The UI shows `Queued`, `Initializing`, `Checking status`, `Uploading`, `Success`, `Failed`, `Cancelled`, and `Rejected` states. A small in-app notification reports success, failure, and rejection.
- Cancel stops the current chunk request and prevents later chunks from being sent. Chunks already received by the backend may remain there.
- Retry checks the backend status and uploads chunks that are still missing. It only retries the selected file.
- Backend errors and network failures produce a `Failed` state and a visible error message. No random failures are simulated.

The UI state is kept in the screen with React state; active request handles are kept in a ref so each file can be cancelled independently. Uploads are not saved across app restarts. A production backend would also need to define upload expiry and cleanup for cancelled or abandoned sessions.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm test -- --runInBand
```
