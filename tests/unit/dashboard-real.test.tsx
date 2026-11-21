import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { buildWidgetSnapshot } from '../../src/app/widgets';
import { createFakeBackend, workspace } from './fakeAuthBackend';

describe('a real business with no jobs yet', () => {
  it('sees its own empty dashboard and first steps, never sample data', async () => {
    const { backend } = createFakeBackend({
      user: { id: 'user-1', email: 'owner@alpha.test', fullName: 'Kalpesh' },
      workspaces: [workspace('Alpha Fabricators', 't-real')],
    });
    render(
      <AuthProvider backend={backend}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Get started' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create your first job order/ })).toBeInTheDocument();
    expect(screen.queryByText(/demonstration data/)).not.toBeInTheDocument();
    expect(screen.queryAllByText('Demo data')).toHaveLength(0);
  });

  it('gets zeros on the phone widgets, not samples', () => {
    const snap = buildWidgetSnapshot({ business: 'Alpha', demo: false, customers: 0, jobs: [], sync: { kind: 'connected', lastSyncedAt: new Date() } });
    expect(snap.demo).toBe(false);
    expect(snap.inProduction).toBe(0);
    expect(snap.delayed).toBe(0);
  });
});
