import React, { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { getFileSizeError, getProgressPercentage } from '../utils/uploadRules';

type UploadState =
  | 'Queued'
  | 'Initializing'
  | 'Checking status'
  | 'Uploading'
  | 'Success'
  | 'Failed'
  | 'Cancelled'
  | 'Rejected';

type UploadFile = {
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

type ActiveUpload = {
  cancelled: boolean;
  uploadId: string | null;
  cancelRequest?: () => void;
};

type Notice = {
  id: number;
  message: string;
  kind: 'success' | 'error';
};

const FilePickerButton = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const activeUploads = useRef(new Map<string, ActiveUpload>());
  const nextId = useRef(0);
  const nextNoticeId = useRef(0);

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles(current =>
      current.map(file => (file.id === id ? { ...file, ...updates } : file)),
    );
  };

  const addNotice = (message: string, kind: Notice['kind']) => {
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

  const formatFileSize = (size: number | null) => {
    if (size == null) {
      return 'Unknown size';
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={isPicking}
        onPress={selectFiles}
        style={[styles.button, isPicking && styles.disabledButton]}
      >
        <Text style={styles.buttonText}>
          {isPicking ? 'Choose files...' : 'Choose files'}
        </Text>
      </TouchableOpacity>

      {notices.map(notice => (
        <TouchableOpacity
          key={notice.id}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          onPress={() =>
            setNotices(current => current.filter(item => item.id !== notice.id))
          }
          style={[
            styles.notice,
            notice.kind === 'success'
              ? styles.successNotice
              : styles.errorNotice,
          ]}
        >
          <Text style={styles.noticeText}>{notice.message}</Text>
        </TouchableOpacity>
      ))}

      <ScrollView contentContainerStyle={styles.fileList}>
        {files.map(file => {
          const uploadedCount = new Set(file.uploadedChunks).size;
          const progress = getProgressPercentage(
            file.uploadedChunks,
            file.totalChunks,
          );
          const canCancel = [
            'Initializing',
            'Checking status',
            'Uploading',
          ].includes(file.state);

          return (
            <View key={file.id} style={styles.fileCard}>
              <Text style={styles.fileName}>{file.name ?? 'Unnamed file'}</Text>
              <Text style={styles.fileDetails}>
                {formatFileSize(file.size)} · {uploadedCount}/{file.totalChunks}{' '}
                chunks · {progress}%
              </Text>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: progress }}
                style={styles.progressTrack}
              >
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
              <Text style={styles.state}>{file.state}</Text>
              {file.error ? (
                <Text style={styles.error}>{file.error}</Text>
              ) : null}

              {canCancel ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => cancelFile(file)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              ) : null}

              {file.state === 'Failed' ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => uploadFile(file)}
                  style={styles.retryButton}
                >
                  <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  button: {
    backgroundColor: '#176b45',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  notice: {
    borderRadius: 6,
    marginTop: 8,
    padding: 10,
  },
  successNotice: {
    backgroundColor: '#dff3e7',
  },
  errorNotice: {
    backgroundColor: '#fde8e7',
  },
  noticeText: {
    color: '#222222',
  },
  fileList: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  fileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
  },
  fileName: {
    color: '#1b1b1b',
    fontSize: 16,
    fontWeight: '600',
  },
  fileDetails: {
    color: '#555555',
    marginTop: 6,
  },
  progressTrack: {
    height: 8,
    marginTop: 12,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#dddddd',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#176b45',
  },
  state: {
    color: '#333333',
    marginTop: 8,
  },
  error: {
    color: '#b42318',
    marginTop: 8,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minWidth: 88,
    minHeight: 40,
    marginTop: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#555555',
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minWidth: 88,
    minHeight: 40,
    marginTop: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#a12622',
  },
});

export default FilePickerButton;
