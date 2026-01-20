import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockMain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('./index.js', () => ({
  main: mockMain,
}));

describe('CLI Entry Point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call main() when imported', async () => {
    // Import cli.ts which triggers main() call at module level
    await import('./cli.js');

    expect(mockMain).toHaveBeenCalledTimes(1);
  });
});
