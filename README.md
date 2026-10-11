# Chunked File Upload

This project has two parts:

- `BE/` — a Node.js API that receives and assembles uploaded file chunks.
- `fileUpload/` — a React Native app for choosing files and uploading them.

## Before you start

Install Node.js 22.11 or newer and npm. To run the mobile app, also install the tools for your platform: Android Studio and the Android SDK for Android, or Xcode and CocoaPods for iOS.

## 1. Start the backend

Open a terminal in the project folder and run:

```sh
cd BE
npm install
cp .env.example .env
```

For a phone on your Wi-Fi, open `BE/.env` and set:

```text
HOST=0.0.0.0
PORT=3000
```

Start the API:

```sh
npm run dev
```

Keep this terminal open. The backend creates `BE/storage/` automatically; completed uploads are saved in `BE/storage/completed/`.

## 2. Point the app at the backend

For a physical phone, find your Mac's Wi-Fi address:

```sh
ipconfig getifaddr en0
```

In `fileUpload/src/services/uploadService.tsx`, change `BASE_URL` to use that address. For example, if the command prints `192.168.1.50`:

```ts
const BASE_URL = 'http://192.168.1.50:3000';
```

Use your Mac's actual address, not the example. The phone and Mac must be on the same Wi-Fi network. Allow incoming connections for Node.js in the macOS firewall if it asks.

The default `http://10.0.2.2:3000` address is for an Android emulator. Use the Mac's Wi-Fi address for a physical Android or iPhone.

## 3. Install and run the app

In a second terminal:

```sh
cd fileUpload
npm install
```

For iOS, install the native dependencies once:

```sh
cd ios
pod install
cd ..
```

Start Metro:

```sh
npm start
```

In another terminal, from `fileUpload/`, launch the app on your connected device or simulator:

```sh
npm run android
```

Or, for iOS:

```sh
npm run ios
```

Physical-device builds need the device's normal developer setup (USB debugging for Android, or signing and device setup in Xcode for iOS).

## Upload limits and checks

The default maximum file size is 100 MiB, and files are uploaded in 5 MiB chunks. Keep the backend running while uploading. For a phone, both devices must remain on the same reachable network; guest Wi-Fi, VPNs, or router isolation can block the connection. The `0.0.0.0` setting is for local-network testing—do not expose this development server directly to the public internet.

Run the backend tests from `BE/`:

```sh
npm test
```

Run the app tests from `fileUpload/`:

```sh
npm test -- --runInBand
```
