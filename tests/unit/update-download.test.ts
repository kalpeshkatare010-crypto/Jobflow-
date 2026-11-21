import { describe, expect, it, vi } from 'vitest';

const order: string[] = [];
let failOpen = false;
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    addListener: async () => ({ remove: () => undefined }),
    mkdir: async (o: { path: string }) => void order.push(`mkdir:${o.path}`),
    downloadFile: async (o: { path: string }) => {
      order.push(`download:${o.path}`);
      return { path: `/cache/${o.path}` };
    },
    getUri: async () => ({ uri: 'file:///cache/x' }),
  },
}));
vi.mock('@capacitor-community/file-opener', () => ({
  FileOpener: {
    open: async (o: { filePath: string }) => {
      if (failOpen) throw new Error('No activity found');
      order.push(`open:${o.filePath}`);
    },
  },
}));

const { downloadAndInstall, UpdateError } = await import('../../src/app/updates');
const update = { build: 29, url: 'https://example.test/JobFlow-0.1.0-build29.apk', name: 'JobFlow-0.1.0-build29.apk', sizeBytes: 1 };

describe('in-app update download', () => {
  it('creates the updates folder before downloading (Android does not create it), then opens the installer', async () => {
    await downloadAndInstall(update, () => undefined);
    expect(order).toEqual(['mkdir:updates', 'download:updates/JobFlow-0.1.0-build29.apk', 'open:/cache/updates/JobFlow-0.1.0-build29.apk']);
  });

  it('says which step failed', async () => {
    failOpen = true;
    const error = await downloadAndInstall(update, () => undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpdateError);
    expect((error as InstanceType<typeof UpdateError>).step).toBe('install');
    expect((error as Error).message).toBe('No activity found');
  });
});
