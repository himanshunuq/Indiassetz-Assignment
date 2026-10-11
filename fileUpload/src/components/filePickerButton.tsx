import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import UploadFileCard from './UploadFileCard';
import { useFileUploads } from '../hooks/useFileUploads';

const FilePickerButton = () => {
  const {
    files,
    isPicking,
    notices,
    selectFiles,
    uploadFile,
    cancelFile,
    dismissNotice,
  } = useFileUploads();

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
          onPress={() => dismissNotice(notice.id)}
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
        {files.map(file => (
          <UploadFileCard
            key={file.id}
            file={file}
            onCancel={cancelFile}
            onRetry={uploadFile}
          />
        ))}
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
});

export default FilePickerButton;
