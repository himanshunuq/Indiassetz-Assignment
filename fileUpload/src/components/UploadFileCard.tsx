import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getProgressPercentage } from '../utils/uploadRules';
import { UploadFile } from '../types/upload';

type UploadFileCardProps = {
  file: UploadFile;
  onCancel: (file: UploadFile) => void;
  onRetry: (file: UploadFile) => void;
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

const UploadFileCard = ({ file, onCancel, onRetry }: UploadFileCardProps) => {
  const uploadedCount = new Set(file.uploadedChunks).size;
  const progress = getProgressPercentage(file.uploadedChunks, file.totalChunks);
  const canCancel = ['Initializing', 'Checking status', 'Uploading'].includes(
    file.state,
  );

  return (
    <View style={styles.fileCard}>
      <Text style={styles.fileName}>{file.name ?? 'Unnamed file'}</Text>
      <Text style={styles.fileDetails}>
        {formatFileSize(file.size)} · {uploadedCount}/{file.totalChunks} chunks ·{' '}
        {progress}%
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: progress }}
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.state}>{file.state}</Text>
      {file.error ? <Text style={styles.error}>{file.error}</Text> : null}

      {canCancel ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onCancel(file)}
          style={styles.cancelButton}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      ) : null}

      {file.state === 'Failed' ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onRetry(file)}
          style={styles.retryButton}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
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
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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

export default UploadFileCard;
