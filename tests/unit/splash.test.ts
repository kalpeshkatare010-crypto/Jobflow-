import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.resetModules();
});

function mount() {
  document.body.innerHTML = '<div id="boot-splash"><svg><rect class="bs-bar b1"></rect></svg></div>';
}

describe('launch animation', () => {
  it('plays at least once, then fades out and gets out of the way', async () => {
    vi.useFakeTimers();
    mount();
    const { hideLaunchSplash } = await import('../../src/app/splash');
    hideLaunchSplash();
    vi.advanceTimersByTime(1600);
    expect(document.getElementById('boot-splash')!.className).toContain('bs-hidden');
  });

  it('replays briefly when coming back, but never before the first launch finished', async () => {
    vi.useFakeTimers();
    mount();
    const { hideLaunchSplash, replaySplash } = await import('../../src/app/splash');
    replaySplash();
    expect(document.getElementById('boot-splash')!.className).not.toContain('bs-leave');
    hideLaunchSplash();
    vi.advanceTimersByTime(1600);
    replaySplash();
    expect(document.getElementById('boot-splash')!.className).not.toContain('bs-hidden');
    vi.advanceTimersByTime(1400);
    expect(document.getElementById('boot-splash')!.className).toContain('bs-hidden');
  });

  it('does nothing where there is no animation element (tests, embeds)', async () => {
    const { hideLaunchSplash, replaySplash } = await import('../../src/app/splash');
    expect(() => {
      hideLaunchSplash();
      replaySplash();
    }).not.toThrow();
  });
});
