# Chunked File Upload

This project has two parts:

- `BE` — the backend server.
- `fileUpload` — the React Native app.

## Before you start

Install Node.js 22.11 or newer, npm, and Android Studio. Open Android Studio and start an Android emulator.

## ========== BE ==========

Open a terminal in the project folder and run:

```sh
cd BE
npm install
cp .env.example .env
npm run dev
```

Keep this terminal open while you use the app. Uploaded files are saved in `BE/storage/completed/`.

## ========== RN CLI APP ==========

Open a second terminal and install the app packages:

```sh
cd fileUpload
npm install
```

Start Metro:

```sh
npm start
```

Keep Metro running. Open a third terminal and start the app in the Android emulator:

```sh
cd fileUpload
npm run android
```

The app is already set to connect to the backend running on your computer through the Android emulator.

## Tests

Run backend tests from `BE/`:

```sh
npm test
```

Run app tests from `fileUpload/`:

```sh
npm test -- --runInBand
```
