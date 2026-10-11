import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { allFiles: 'allFiles' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: jest.fn(() => false),
}));

jest.mock('../src/services/uploadService', () => ({
  CHUNK_SIZE: 5 * 1024 * 1024,
  getUploadStatus: jest.fn(),
  initializeUpload: jest.fn(),
  UploadCancelledError: class UploadCancelledError extends Error {},
}));

jest.mock('../src/utils/chunkUploader', () => ({
  uploadFileInChunks: jest.fn(),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
