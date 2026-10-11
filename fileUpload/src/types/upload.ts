export type UploadState =
  | 'Queued'
  | 'Initializing'
  | 'Checking status'
  | 'Uploading'
  | 'Success'
  | 'Failed'
  | 'Cancelled'
  | 'Rejected';

export type UploadFile = {
  id: string;
  uri: string;
  name: string | null;
  size: number | null;
  totalChunks: number;
  uploadId: string | null;
  uploadedChunks: number[];
  state: UploadState;
  error: string | null;
};

export type UploadNotice = {
  id: number;
  message: string;
  kind: 'success' | 'error';
};
