import { main } from './index.js';

describe('main', () => {
  it('should be a function', () => {
    expect(typeof main).toBe('function');
  });

  it('should execute without throwing', () => {
    expect(() => {
      main();
    }).not.toThrow();
  });
});
