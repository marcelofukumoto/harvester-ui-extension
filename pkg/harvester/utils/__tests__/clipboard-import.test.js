import { copyTextToClipboard } from '@shell/utils/clipboard';

// The shell's clipboard util imports clipboard-polyfill, which is ESM only
describe('@shell/utils/clipboard', () => {
  it('should load in the jest setup', () => {
    expect(typeof copyTextToClipboard).toBe('function');
  });
});
