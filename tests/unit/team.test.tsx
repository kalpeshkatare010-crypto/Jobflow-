import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import type { MemberRole } from '../../src/auth/types';
import { createFakeBackend, workspace } from './fakeAuthBackend';
import { appUrl } from '../../src/lib/appUrl';

function renderSettings(role: MemberRole) {
  const fake = createFakeBackend({
    user: { id: 'user-1', email: 'owner@alpha.test', fullName: 'Asha Kulkarni' },
    workspaces: [{ ...workspace('Alpha Fabricators', 't1'), role }],
  });
  render(
    <AuthProvider backend={fake.backend}>
      <MemoryRouter initialEntries={['/settings']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
  return fake;
}

beforeEach(() => window.localStorage.clear());

describe('Team settings', () => {
  it('lists members and marks the signed-in person', async () => {
    renderSettings('owner');
    const list = await screen.findByRole('list', { name: 'Members' });
    expect(await within(list).findByText('Ravi Shinde')).toBeInTheDocument();
    expect(within(list).getByText('(you)')).toBeInTheDocument();
  });

  it('creates an invitation and shows its one-time link', async () => {
    const { calls } = renderSettings('owner');
    await userEvent.type(await screen.findByLabelText('Invite by email'), 'dev@alpha.test');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'production_manager');
    await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
    expect(await screen.findByText(/Send this link to the person/)).toBeInTheDocument();
    expect(screen.getByText(/\/invite\/raw-token-123$/)).toBeInTheDocument();
    expect(calls).toContain('invite:dev@alpha.test:production_manager');
    expect(await screen.findByText('dev@alpha.test')).toBeInTheDocument();
  });

  it('shows the plan limit message from the server', async () => {
    renderSettings('owner');
    await userEvent.type(await screen.findByLabelText('Invite by email'), 'one@alpha.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
    await screen.findByText('one@alpha.test');
    await userEvent.type(screen.getByLabelText('Invite by email'), 'two@alpha.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your plan allows 3 logins.');
  });

  it('lets the owner change a role', async () => {
    const { calls } = renderSettings('owner');
    await userEvent.selectOptions(await screen.findByLabelText('Role for Ravi Shinde'), 'admin');
    expect(calls).toContain('role:m-ravi:admin');
  });

  it('only owners can offer the admin role', async () => {
    renderSettings('admin');
    const roleSelect = await screen.findByLabelText('Role');
    expect(within(roleSelect).queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the team read-only to employees', async () => {
    renderSettings('employee');
    await screen.findByText('Ravi Shinde');
    expect(screen.queryByLabelText('Invite by email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });
});

describe('appUrl', () => {
  it('builds clean links in production and hash links in the preview build', () => {
    expect(appUrl('/invite/abc', 'https://jobflow.example', false)).toBe('https://jobflow.example/invite/abc');
    expect(appUrl('/invite/abc', 'https://host.test', true)).toMatch(/^https:\/\/host\.test\/.*#\/invite\/abc$/);
  });
});
