export const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const getFileSizeError = (
  fileName: string | null,
  fileSize: number | null,
): string | null => {
  if (fileSize == null || fileSize <= MAX_FILE_SIZE) {
    return null;
  }

  return `File ${
    fileName ?? 'Unnamed file'
  } exceeds the maximum allowed size of 100 MB.`;
};

export const getProgressPercentage = (
  uploadedChunks: number[],
  totalChunks: number,
): number => {
  if (totalChunks <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((new Set(uploadedChunks).size / totalChunks) * 100),
  );
};
