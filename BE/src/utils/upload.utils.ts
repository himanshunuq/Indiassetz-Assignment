export function calculateExpectedChunks(fileSize: number, chunkSize: number): number {
  if (fileSize <= 0 || chunkSize <= 0) {
    throw new Error('File size and chunk size must be greater than zero');
  }
  return Math.ceil(fileSize / chunkSize);
}

export function getExpectedChunkSize(
  chunkIndex: number,
  totalChunks: number,
  fileSize: number,
  chunkSize: number
): number {
  if (chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw new Error(`Chunk index ${chunkIndex} is out of bounds [0, ${totalChunks - 1}]`);
  }
  if (chunkIndex === totalChunks - 1) {
    return fileSize - (totalChunks - 1) * chunkSize;
  }
  return chunkSize;
}

export function calculateProgress(
  fileSize: number,
  chunkSize: number,
  totalChunks: number,
  uploadedChunks: number[]
): number {
  if (fileSize <= 0) return 0;
  const uniqueChunks = Array.from(new Set(uploadedChunks));
  let uploadedBytes = 0;

  for (const index of uniqueChunks) {
    if (index >= 0 && index < totalChunks) {
      uploadedBytes += getExpectedChunkSize(index, totalChunks, fileSize, chunkSize);
    }
  }

  const progress = Math.floor((uploadedBytes / fileSize) * 100);
  return Math.min(100, Math.max(0, progress));
}

export class AsyncLock {
  private locks = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const currentLock = this.locks.get(key) || Promise.resolve();

    let releaseLock: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, currentLock.then(() => nextLock, () => nextLock));

    try {
      await currentLock;
      return await task();
    } finally {
      releaseLock!();
      if (this.locks.get(key) === nextLock) {
        this.locks.delete(key);
      }
    }
  }
}
