import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describeSync, SyncIndicator } from '../../src/app/layout/SyncIndicator';

const now = new Date(2026, 10, 20, 12, 0);

describe('describeSync', () => {
  it('never claims cloud sync before the app is connected', () => {
    const view = describeSync({ kind: 'not_connected' }, now);
    expect(view.label).toBe('Not connected');
    expect(view.label + view.detail).not.toMatch(/synced/i);
  });

  it('says changes are saved on this device, not synced, while offline', () => {
    const view = describeSync({ kind: 'offline', pending: 3 }, now);
    expect(view.detail).toBe('3 changes saved on this device, not yet synced');
  });

  it('reports pending changes with the last confirmed sync', () => {
    const view = describeSync({ kind: 'pending', pending: 1, lastSyncedAt: new Date(now.getTime() - 5 * 60000) }, now);
    expect(view.label).toBe('1 change waiting');
    expect(view.detail).toContain('Last synced 5 min ago');
  });

  it('explains failures and keeps the changes', () => {
    const view = describeSync({ kind: 'failed', pending: 2, reason: 'Server did not respond' }, now);
    expect(view.detail).toBe('Server did not respond. 2 changes kept on this device');
  });

  it('counts conflicts', () => {
    expect(describeSync({ kind: 'conflict', conflicts: 2 }, now).label).toBe('2 conflicts to review');
  });
});

describe('SyncIndicator', () => {
  it('offers retry only when sync failed', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SyncIndicator state={{ kind: 'offline', pending: 0 }} onRetry={onRetry} now={now} />);
    expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument();

    rerender(<SyncIndicator state={{ kind: 'failed', pending: 1, reason: 'Timed out' }} onRetry={onRetry} now={now} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry sync' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('Sync status details', () => {
  it('explains the state in words when tapped', async () => {
    render(<SyncIndicator state={{ kind: 'offline', pending: 2 }} now={now} />);
    await userEvent.click(screen.getByRole('button', { name: /Offline/ }));
    const dialog = screen.getByRole('dialog', { name: 'Sync status' });
    expect(dialog).toHaveTextContent('No internet right now. Keep working');
    expect(dialog).toHaveTextContent('2 changes saved on this device, not yet synced');
  });

  it('offers Sync now when connected to the cloud, not in demo mode', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SyncIndicator state={{ kind: 'pending', pending: 1 }} onRetry={onRetry} now={now} />);
    await userEvent.click(screen.getByRole('button', { name: /waiting/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<SyncIndicator state={{ kind: 'not_connected' }} onRetry={onRetry} now={now} />);
    await userEvent.click(screen.getByRole('button', { name: /Not connected/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('demo mode');
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });
});
