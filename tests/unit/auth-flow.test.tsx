import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { safeNext } from '../../src/auth/AuthLayout';
import type { AuthBackend } from '../../src/auth/types';
import { createFakeBackend, workspace } from './fakeAuthBackend';

function renderApp(backend: AuthBackend, path = '/') {
  return render(
    <AuthProvider backend={backend}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('signed-out visitors', () => {
  it('are sent to sign in, which credits RK Digitals', async () => {
    const { backend } = createFakeBackend();
    renderApp(backend, '/customers');
    expect(await screen.findByRole('heading', { name: 'Sign in to JobFlow' })).toBeInTheDocument();
    expect(screen.getByText('JobFlow is a product of RK Digitals.')).toBeInTheDocument();
  });

  it('see a clear message for a wrong password', async () => {
    const { backend } = createFakeBackend();
    renderApp(backend, '/sign-in');
    await userEvent.type(await screen.findByLabelText(/Email/), 'owner@alpha.test');
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });
});

describe('signing in', () => {
  it('without a business leads to business setup, then the dashboard', async () => {
    const { backend, calls } = createFakeBackend();
    renderApp(backend, '/');
    await userEvent.type(await screen.findByLabelText(/Email/), 'owner@alpha.test');
    await userEvent.type(screen.getByLabelText(/Password/), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Set up your business' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Asha Kulkarni');
    await userEvent.type(screen.getByLabelText(/Business name/), 'Alpha Fabricators');
    await userEvent.click(screen.getByRole('button', { name: 'Create business' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Asha' })).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Fabricators').length).toBeGreaterThan(0);
    expect(calls).toContain('createBusiness:Alpha Fabricators');
  });

  it('returns to the page the person asked for', async () => {
    const { backend } = createFakeBackend({ workspaces: [workspace('Alpha Fabricators', 't1')] });
    renderApp(backend, '/customers');
    await userEvent.type(await screen.findByLabelText(/Email/), 'owner@alpha.test');
    await userEvent.type(screen.getByLabelText(/Password/), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
  });

  it('asks which business to open when there are several', async () => {
    const user = { id: 'u', email: 'owner@alpha.test', fullName: 'Asha' };
    const { backend } = createFakeBackend({
      user,
      workspaces: [workspace('Alpha Fabricators', 't1'), workspace('Beta Plastics', 't2')],
    });
    renderApp(backend, '/');
    await userEvent.click(await screen.findByRole('button', { name: /Beta Plastics/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Asha' })).toBeInTheDocument();
    expect(screen.getAllByText('Beta Plastics').length).toBeGreaterThan(0);
  });

  it('signs out from the account menu', async () => {
    const user = { id: 'u', email: 'owner@alpha.test', fullName: 'Asha' };
    const { backend, calls } = createFakeBackend({ user, workspaces: [workspace('Alpha Fabricators', 't1')] });
    renderApp(backend, '/');
    await userEvent.click(await screen.findByRole('button', { name: /Account menu/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to JobFlow' })).toBeInTheDocument();
    expect(calls).toContain('signOut');
  });
});

describe('sign up', () => {
  it('asks for at least 8 characters', async () => {
    const { backend } = createFakeBackend();
    renderApp(backend, '/sign-up');
    await userEvent.type(await screen.findByLabelText(/Password/), 'short');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('tells the person to confirm their email when required', async () => {
    const { backend } = createFakeBackend({ needsEmailConfirmation: true });
    renderApp(backend, '/sign-up');
    await userEvent.type(await screen.findByLabelText(/Your name/), 'Ravi');
    await userEvent.type(screen.getByLabelText(/Work email/), 'ravi@alpha.test');
    await userEvent.type(screen.getByLabelText(/Password/), 'long-enough-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
    expect(screen.getByText('ravi@alpha.test')).toBeInTheDocument();
  });
});

describe('invitations', () => {
  it('lets a signed-in person join, and opens that business', async () => {
    const user = { id: 'u', email: 'chetan@alpha.test', fullName: 'Chetan' };
    const { backend } = createFakeBackend({ user });
    renderApp(backend, '/invite/good-token');
    await userEvent.click(await screen.findByRole('button', { name: 'Join business' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Chetan' })).toBeInTheDocument();
    expect(screen.getAllByText('Invited Works').length).toBeGreaterThan(0);
  });

  it('explains an invalid link', async () => {
    const user = { id: 'u', email: 'chetan@alpha.test', fullName: 'Chetan' };
    const { backend } = createFakeBackend({ user });
    renderApp(backend, '/invite/bad-token');
    await userEvent.click(await screen.findByRole('button', { name: 'Join business' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation link is not valid.');
  });

  it('offers sign up or sign in to a signed-out visitor, keeping the link', async () => {
    const { backend } = createFakeBackend();
    renderApp(backend, '/invite/good-token');
    const signUp = await screen.findByRole('link', { name: 'Create an account' });
    expect(signUp).toHaveAttribute('href', '/sign-up?next=%2Finvite%2Fgood-token');
  });
});

describe('safeNext', () => {
  it('allows only paths inside the app', () => {
    expect(safeNext('/jobs')).toBe('/jobs');
    expect(safeNext('https://evil.test')).toBe('/');
    expect(safeNext('//evil.test')).toBe('/');
    expect(safeNext('/\\evil.test')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
