import { useRef, useState } from 'react';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import {
  CHUNK_SIZE,
  getUploadStatus,
  initializeUpload,
  UploadCancelledError,
} from '../services/uploadService';
import { uploadFileInChunks } from '../utils/chunkUploader';
import { getTotalChunks } from '../utils/chunksBuilder';
import { getFileSizeError } from '../utils/uploadRules';
import { UploadFile, UploadNotice } from '../types/upload';

type ActiveUpload = {
  cancelled: boolean;
  uploadId: string | null;
  cancelRequest?: () => void;
};

export const useFileUploads = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const activeUploads = useRef(new Map<string, ActiveUpload>());
  const nextId = useRef(0);
  const nextNoticeId = useRef(0);

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles(current =>
      current.map(file => (file.id === id ? { ...file, ...updates } : file)),
    );
  };

  const addNotice = (message: string, kind: UploadNotice['kind']) => {
    const notice = { id: nextNoticeId.current++, message, kind };
    setNotices(current => [notice, ...current].slice(0, 3));
  };

  const uploadFile = async (file: UploadFile) => {
    if (activeUploads.current.has(file.id)) {
      return;
    }

    const task: ActiveUpload = { cancelled: false, uploadId: file.uploadId };
    activeUploads.current.set(file.id, task);

    try {
      if (file.size == null || file.size <= 0 || !file.name) {
        throw new Error('File name and a non-empty file size are required.');
      }

      let uploadId = task.uploadId;
      let totalChunks = file.totalChunks;

      if (!uploadId) {
        updateFile(file.id, { state: 'Initializing', error: null });
        const initialized = await initializeUpload({
          fileName: file.name,
          fileSize: file.size,
          chunkSize: CHUNK_SIZE,
        });
        uploadId = initialized.uploadId;
        totalChunks = initialized.totalChunks;
        task.uploadId = uploadId;

        if (task.cancelled) {
          return;
        }

        updateFile(file.id, {
          uploadId,
          totalChunks,
          uploadedChunks: initialized.uploadedChunks,
        });
      }

      if (task.cancelled) {
        return;
      }
      updateFile(file.id, { state: 'Checking status', error: null });

      const status = await getUploadStatus(uploadId);
      if (task.cancelled) {
        return;
      }

      const uploadedChunks = status.uploadedChunks.filter(
        chunkIndex => chunkIndex >= 0 && chunkIndex < totalChunks,
      );

      if (
        status.status?.toLowerCase() === 'completed' ||
        status.status?.toLowerCase() === 'complete'
      ) {
        updateFile(file.id, {
          uploadedChunks: Array.from({ length: totalChunks }, (_, i) => i),
          state: 'Success',
          error: null,
        });
        addNotice(`${file.name} uploaded successfully!`, 'success');
        return;
      }

      updateFile(file.id, { uploadedChunks, state: 'Uploading' });

      await uploadFileInChunks({
        uri: file.uri,
        size: file.size,
        uploadId,
        uploadedChunks,
        isCancelled: () => task.cancelled,
        onCancelRequest: cancelRequest => {
          task.cancelRequest = cancelRequest ?? undefined;
          if (task.cancelled) {
            task.cancelRequest?.();
          }
        },
        onProgress: (chunks, total) => {
          if (!task.cancelled) {
            updateFile(file.id, { uploadedChunks: chunks, totalChunks: total });
          }
        },
      });

      if (!task.cancelled) {
        updateFile(file.id, {
          uploadedChunks: Array.from({ length: totalChunks }, (_, i) => i),
          state: 'Success',
          error: null,
        });
        addNotice(`${file.name} uploaded successfully!`, 'success');
      }
    } catch (error) {
      if (task.cancelled || error instanceof UploadCancelledError) {
        updateFile(file.id, { state: 'Cancelled' });
      } else {
        const message =
          error instanceof Error
            ? error.message
            : 'An unknown upload error occurred.';
        updateFile(file.id, { state: 'Failed', error: message });
        addNotice(
          `Failed to upload ${file.name ?? 'file'} — ${message}`,
          'error',
        );
        console.error(`Upload failed for ${file.name ?? 'file'}:`, error);
      }
    } finally {
      activeUploads.current.delete(file.id);
    }
  };

  const selectFiles = async () => {
    setIsPicking(true);
    try {
      const results = await pick({
        type: [types.allFiles],
        allowMultiSelection: true,
      });

      const selectedFiles: UploadFile[] = results.map(file => {
        const error = getFileSizeError(file.name, file.size);
        const item: UploadFile = {
          id: String(nextId.current++),
          uri: file.uri,
          name: file.name,
          size: file.size,
          totalChunks: file.size != null ? getTotalChunks(file.size) : 0,
          uploadId: null,
          uploadedChunks: [],
          state: error ? 'Rejected' : 'Queued',
          error,
        };

        if (error) {
          addNotice(error, 'error');
        }
        return item;
      });

      setFiles(current => [...current, ...selectedFiles]);
      selectedFiles
        .filter(file => file.state !== 'Rejected')
        .forEach(file => {
          uploadFile(file);
        });
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      console.error('File selection failed:', error);
      addNotice(
        error instanceof Error ? error.message : 'Unable to select files.',
        'error',
      );
    } finally {
      setIsPicking(false);
    }
  };

  const cancelFile = (file: UploadFile) => {
    const task = activeUploads.current.get(file.id);
    if (!task) {
      return;
    }

    task.cancelled = true;
    task.cancelRequest?.();
    updateFile(file.id, { state: 'Cancelled' });
    addNotice(`${file.name ?? 'File'} upload cancelled.`, 'error');
  };

  const dismissNotice = (id: number) => {
    setNotices(current => current.filter(notice => notice.id !== id));
  };

  return {
    files,
    isPicking,
    notices,
    selectFiles,
    uploadFile,
    cancelFile,
    dismissNotice,
  };
};
