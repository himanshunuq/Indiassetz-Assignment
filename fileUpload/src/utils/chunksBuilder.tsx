export const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MiB

export const getTotalChunks = (fileSize: number): number => {
  return Math.ceil(fileSize / CHUNK_SIZE);
};
