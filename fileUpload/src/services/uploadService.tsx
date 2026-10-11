import ReactNativeBlobUtil from 'react-native-blob-util';

const BASE_URL = 'http://10.0.2.2:3000';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MiB

// ---------- Types ----------

export type InitUploadResponse = {
  success: boolean;
  uploadId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  status: string;
};

export type UploadStatusResponse = {
  uploadedChunks: number[];
  status?: string;
};

type InitUploadRequest = {
  fileName: string;
  fileSize: number;
  chunkSize: number;
};

type UploadChunkParams = {
  uploadId: string;
  chunkIndex: number;
  chunkPath: string;
  isCancelled?: () => boolean;
  onCancelRequest?: (cancelRequest: (() => void) | null) => void;
};

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

// ---------- 1. Initialize Upload ----------

export const initializeUpload = async (
  file: InitUploadRequest,
): Promise<InitUploadResponse> => {
  const response = await fetch(`${BASE_URL}/api/uploads/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(file),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Upload initialization failed (${response.status}): ${errorBody}`,
    );
  }

  const data: InitUploadResponse = await response.json();

  if (!data.success || !data.uploadId) {
    throw new Error('Backend did not return a valid upload ID');
  }

  return data;
};

// ---------- 2. Upload One Chunk ----------

export const uploadChunk = async ({
  uploadId,
  chunkIndex,
  chunkPath,
  isCancelled,
  onCancelRequest,
}: UploadChunkParams) => {
  if (isCancelled?.()) {
    throw new UploadCancelledError();
  }

  const request = ReactNativeBlobUtil.fetch(
    'PUT',
    `${BASE_URL}/api/uploads/${encodeURIComponent(
      uploadId,
    )}/chunks/${chunkIndex}`,
    {
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
    },
    ReactNativeBlobUtil.wrap(chunkPath),
  );

  onCancelRequest?.(() => request.cancel());

  let response;
  try {
    response = await request;
  } catch (error) {
    if (isCancelled?.()) {
      throw new UploadCancelledError();
    }
    throw error;
  } finally {
    onCancelRequest?.(null);
  }

  if (isCancelled?.()) {
    throw new UploadCancelledError();
  }

  const status = response.info().status;
  const body = await response.text();

  if (status < 200 || status >= 300) {
    throw new Error(`Chunk ${chunkIndex} failed (${status}): ${body}`);
  }

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return { message: body };
  }
};

// ---------- 3. Check Upload Status ----------

export const getUploadStatus = async (uploadId: string) => {
  const response = await fetch(
    `${BASE_URL}/api/uploads/${encodeURIComponent(uploadId)}/status`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Fetching upload status failed (${response.status}): ${errorBody}`,
    );
  }

  const data: unknown = await response.json();

  if (
    typeof data !== 'object' ||
    data === null ||
    !('uploadedChunks' in data) ||
    !Array.isArray(data.uploadedChunks) ||
    !data.uploadedChunks.every(Number.isInteger) ||
    ('status' in data && typeof data.status !== 'string')
  ) {
    throw new Error('Upload status response has an invalid format');
  }

  return data as UploadStatusResponse;
};

// ---------- 4. Complete Upload ----------

export const completeUpload = async (
  uploadId: string,
  isCancelled?: () => boolean,
  onCancelRequest?: (cancelRequest: (() => void) | null) => void,
) => {
  if (isCancelled?.()) {
    throw new UploadCancelledError();
  }

  const request = ReactNativeBlobUtil.fetch(
    'POST',
    `${BASE_URL}/api/uploads/${encodeURIComponent(uploadId)}/complete`,
    { Accept: 'application/json' },
  );
  onCancelRequest?.(() => request.cancel());

  let response;
  try {
    response = await request;
  } catch (error) {
    if (isCancelled?.()) {
      throw new UploadCancelledError();
    }
    throw error;
  } finally {
    onCancelRequest?.(null);
  }

  if (isCancelled?.()) {
    throw new UploadCancelledError();
  }

  const status = response.info().status;
  const body = await response.text();

  if (status < 200 || status >= 300) {
    throw new Error(`Upload completion failed (${status}): ${body}`);
  }

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Upload completion returned invalid JSON');
  }
};

// ---------- 5. Cancel Upload ----------

export const cancelUpload = async (uploadId: string) => {
  const response = await fetch(
    `${BASE_URL}/api/uploads/${encodeURIComponent(uploadId)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Cancelling upload failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json();
};
