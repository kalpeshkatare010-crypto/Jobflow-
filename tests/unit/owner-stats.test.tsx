import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { createFakeBackend, workspace } from './fakeAuthBackend';

function renderAs(platformAdmin: boolean, path: string) {
  const { backend } = createFakeBackend({
    user: { id: 'user-1', email: 'owner@alpha.test', fullName: 'Kalpesh' },
    workspaces: [workspace('Alpha Fabricators', 't1')],
    platformAdmin,
  });
  render(
    <AuthProvider backend={backend}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('Owner statistics', () => {
  it('appear in the menu for the JobFlow owner and show the numbers', async () => {
    renderAs(true, '/');
    await userEvent.click(await screen.findByRole('button', { name: /Account menu|KK|Kalpesh/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Owner statistics' }));
    expect(await screen.findByText('Godavari Packaging')).toBeInTheDocument();
    expect(screen.getByText('₹1,998')).toBeInTheDocument();
    expect(screen.getByText(/never see customers/)).toBeInTheDocument();
  });

  it('stay hidden and refused for everyone else', async () => {
    renderAs(false, '/owner');
    expect(await screen.findByText('Owner statistics are private')).toBeInTheDocument();
    expect(screen.queryByText('Godavari Packaging')).not.toBeInTheDocument();
  });
});
