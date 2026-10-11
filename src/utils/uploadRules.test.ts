import { getTotalChunks } from './chunksBuilder';
import {
  getFileSizeError,
  getProgressPercentage,
  MAX_FILE_SIZE,
} from './uploadRules';

describe('file size validation', () => {
  it('allows files up to and including 100 MB', () => {
    expect(getFileSizeError('report.pdf', MAX_FILE_SIZE)).toBeNull();
  });

  it('rejects files larger than 100 MB with a clear message', () => {
    expect(getFileSizeError('video.mp4', MAX_FILE_SIZE + 1)).toBe(
      'File video.mp4 exceeds the maximum allowed size of 100 MB.',
    );
  });
});

describe('upload progress and chunk count', () => {
  it('calculates progress from unique uploaded chunks', () => {
    expect(getProgressPercentage([0, 1, 1], 4)).toBe(50);
  });

  it('handles empty uploads and progress beyond the expected chunk count', () => {
    expect(getProgressPercentage([], 0)).toBe(0);
    expect(getProgressPercentage([0, 1, 2], 2)).toBe(100);
  });

  it('splits a file into five-megabyte chunks', () => {
    expect(getTotalChunks(5 * 1024 * 1024)).toBe(1);
    expect(getTotalChunks(5 * 1024 * 1024 + 1)).toBe(2);
  });
});
