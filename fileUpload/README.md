# File Upload App

A React Native CLI app for choosing files and uploading them to the ChunkFlow API in 5 MiB chunks. The app and backend are in this repository: `fileUpload/` is the mobile app and `BE/` is the API.


## What you need

- Node.js 22.11 or newer and npm
- Android Studio with the Android SDK installed
- An Android emulator, or an Android phone with USB debugging enabled

## 1. Start the backend

Open a terminal at the repository root and follow the setup in [`BE/README.md`](../BE/README.md). Start the backend before launching the app.

## 2. Set the API address

Open `src/services/uploadService.tsx`. The default address is:

```ts
const BASE_URL = 'http://10.0.2.2:3000';
```

Keep this address when running the app in an Android emulator; it lets the emulator reach the backend on your computer.

For a physical Android phone, the phone and computer must be on the same Wi-Fi network. Find your computer's local IP address and replace `10.0.2.2` with it, for example:

```ts
const BASE_URL = 'http://192.168.1.50:3000';
```

Use your computer's actual IP, and make sure the backend is configured for local network access as described in `BE/README.md`.

## 3. Install the app dependencies

In a new terminal:

```sh
cd fileUpload
npm install

[ For direct build and run Use: npx react-native run-android --port 3000 ]

```

## 4. Launch the Android app

Start Metro from `fileUpload/`:

```sh
npm start
```

Leave Metro running. In another terminal, from `fileUpload/`, run:

```sh
npm run android
```

Keep the backend and Metro terminals open while using the app. Choose a file in the app to start uploading.

## Upload behavior

- Files up to 100 MiB are uploaded in 5 MiB chunks.
- Upload progress and status are shown for each file.
- Failed uploads can be retried; the app checks the backend and sends missing chunks.
- An upload in progress can be cancelled.

## Run app checks

From `fileUpload/`:

```sh
npm test -- --runInBand
npm run lint
npx tsc --noEmit
```
