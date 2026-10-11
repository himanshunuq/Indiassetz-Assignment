import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  CHUNK_SIZE,
  uploadChunk,
  completeUpload,
  UploadCancelledError,
} from '../services/uploadService';

type ChunkUploadOptions = {
  uri: string;
  size: number;
  uploadId: string;
  uploadedChunks?: number[];
  onProgress?: (uploadedChunks: number[], totalChunks: number) => void;
  isCancelled?: () => boolean;
  onCancelRequest?: (cancelRequest: (() => void) | null) => void;
};

export const uploadFileInChunks = async ({
  uri,
  size,
  uploadId,
  uploadedChunks: alreadyUploadedChunks = [],
  onProgress,
  isCancelled = () => false,
  onCancelRequest,
}: ChunkUploadOptions) => {
  const { fs } = ReactNativeBlobUtil;
  const totalChunks = Math.ceil(size / CHUNK_SIZE);

  // Use a unique name for this upload's temporary files.
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sourcePath = `${fs.dirs.CacheDir}/source-${safeId}`;

  const uploadedChunks = new Set(
    alreadyUploadedChunks.filter(
      chunkIndex =>
        Number.isInteger(chunkIndex) &&
        chunkIndex >= 0 &&
        chunkIndex < totalChunks,
    ),
  );

  try {
    // Copy the picked file into app cache.
    // Document picker may return a content:// URI on Android.
    await fs.cp(uri, sourcePath);
    if (isCancelled()) {
      throw new UploadCancelledError();
    }
    onProgress?.([...uploadedChunks], totalChunks);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (isCancelled()) {
        throw new UploadCancelledError();
      }
      if (uploadedChunks.has(chunkIndex)) {
        continue;
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, size);
      const chunkPath = `${fs.dirs.CacheDir}/chunk-${safeId}-${chunkIndex}.tmp`;

      try {
        // Extract bytes [start, end) into a temporary file.
        await fs.slice(sourcePath, chunkPath, start, end);

        await uploadChunk({
          uploadId,
          chunkIndex,
          chunkPath,
          isCancelled,
          onCancelRequest,
        });

        if (isCancelled()) {
          throw new UploadCancelledError();
        }
        uploadedChunks.add(chunkIndex);
        onProgress?.([...uploadedChunks], totalChunks);

        console.log(`Uploaded chunk ${uploadedChunks.size}/${totalChunks}`);
      } finally {
        // Remove this chunk after its upload attempt.
        if (await fs.exists(chunkPath)) {
          await fs.unlink(chunkPath);
        }
      }
    }

    // Finalize only after all chunks upload successfully.
    return await completeUpload(uploadId, isCancelled, onCancelRequest);
  } finally {
    if (await fs.exists(sourcePath)) {
      await fs.unlink(sourcePath);
    }
  }
};
