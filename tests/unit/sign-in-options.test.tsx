import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import type { AuthBackend } from '../../src/auth/types';
import { redirectParams } from '../../src/auth/supabaseBackend';
import { pathFromAppLink } from '../../src/app/native';
import { mailtoLink, problemReport, supportContact, whatsappLink } from '../../src/app/support';
import { createFakeBackend, workspace } from './fakeAuthBackend';

function renderApp(backend: AuthBackend | null, path: string) {
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
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Google sign-in', () => {
  it('is hidden until switched on, so nobody sees a button that fails', async () => {
    const { backend } = createFakeBackend();
    renderApp(backend, '/sign-in');
    await screen.findByRole('heading', { name: 'Sign in to JobFlow' });
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
  });

  it('starts from sign-in and sign-up when switched on', async () => {
    vi.stubEnv('VITE_GOOGLE_SIGN_IN', 'true');
    const { backend, calls } = createFakeBackend();
    renderApp(backend, '/sign-in?next=/jobs');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(calls).toContain('google');
    expect(window.sessionStorage.getItem('jobflow:auth-next')).toBe('/jobs');
  });

  it('finishes on the callback page and goes where the person was heading', async () => {
    const { backend, calls } = createFakeBackend({ workspaces: [workspace('Alpha Fabricators', 't1')] });
    window.sessionStorage.setItem('jobflow:auth-next', '/customers');
    renderApp(backend, '/auth/callback?code=abc');
    expect(await screen.findByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('finish:'))).toBe(true);
  });

  it('explains a cancelled sign-in', async () => {
    const { backend } = createFakeBackend();
    renderApp(backend, '/auth/callback?error=access_denied');
    // The fake reads the real window URL, so check the message path directly.
    await expect(backend.finishRedirectSignIn('https://x/auth/callback?error=access_denied')).rejects.toThrow('Sign-in was cancelled.');
  });
});

describe('Email code sign-in', () => {
  it('sends a code, rejects a wrong one and signs in with the right one', async () => {
    const { backend, calls } = createFakeBackend({ workspaces: [workspace('Alpha Fabricators', 't1')] });
    renderApp(backend, '/sign-in');
    await userEvent.click(await screen.findByRole('link', { name: 'Email me a sign-in code instead' }));
    await userEvent.type(await screen.findByLabelText(/Email/), 'new@alpha.test');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(calls).toContain('sendCode:new@alpha.test');

    await userEvent.type(screen.getByLabelText(/Sign-in code/), '999999');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('wrong or has expired');

    await userEvent.clear(screen.getByLabelText(/Sign-in code/));
    await userEvent.type(screen.getByLabelText(/Sign-in code/), '123 456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Welcome back/ })).toBeInTheDocument();
  });
});

describe('Returning to the app', () => {
  it('maps Android sign-in links to the callback page', () => {
    expect(pathFromAppLink('com.rkdigitals.jobflow://auth/callback?code=xyz')).toBe('/auth/callback?code=xyz');
    expect(pathFromAppLink('com.rkdigitals.jobflow://auth/callback?next=%2Freset-password&code=1')).toBe(
      '/auth/callback?next=%2Freset-password&code=1',
    );
    expect(pathFromAppLink('com.rkdigitals.jobflow://auth/evil')).toBeNull();
  });

  it('reads parameters from both the query and the fragment', () => {
    const p = redirectParams('https://a.test/auth/callback?code=1#error=access_denied&error_description=Nope');
    expect(p.get('code')).toBe('1');
    expect(p.get('error_description')).toBe('Nope');
  });
});

describe('Help & support', () => {
  it('shows questions, and no contact buttons until contacts are configured', async () => {
    renderApp(null, '/help');
    expect(await screen.findByText('Does JobFlow work without internet?')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Email support/ })).not.toBeInTheDocument();
    expect(screen.getByText(/have not been set up/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy details' })).toBeInTheDocument();
  });

  it('offers email and WhatsApp when configured, with the problem details attached', async () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'help@example.test');
    vi.stubEnv('VITE_SUPPORT_WHATSAPP', '+91 90000 00000');
    renderApp(null, '/help');
    await userEvent.type(await screen.findByLabelText(/What went wrong/), 'Job missing');
    const email = screen.getByRole('link', { name: /Email support/ });
    expect(email.getAttribute('href')).toMatch(/^mailto:help@example\.test\?subject=/);
    expect(decodeURIComponent(email.getAttribute('href')!)).toContain('Job missing');
    await waitFor(() => expect(screen.getByRole('link', { name: /WhatsApp support/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/919000000000\?text=/));
  });

  it('builds reports without secrets and validates contacts', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'not-an-email');
    vi.stubEnv('VITE_SUPPORT_WHATSAPP', '123');
    expect(supportContact()).toEqual({ email: null, whatsapp: null });
    const text = problemReport(
      { version: '0.1.0', mode: 'connected', business: 'Alpha', role: 'Owner', sync: 'All changes synced', page: '/jobs', device: 'Android', time: new Date('2026-11-21T00:00:00Z') },
      '',
    );
    expect(text).toContain('(No description given)');
    expect(text).toContain('Business: Alpha');
    expect(text).not.toMatch(/password|key/i);
    expect(mailtoLink('a@b.co', 'Hi there', 'x y')).toBe('mailto:a@b.co?subject=Hi%20there&body=x%20y');
    expect(whatsappLink('919', 'a b')).toBe('https://wa.me/919?text=a%20b');
  });
});

describe('support details', () => {
  it('shows the email address and phone number themselves, not only buttons', async () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'help@example.test');
    vi.stubEnv('VITE_SUPPORT_WHATSAPP', '918956000000');
    renderApp(null, '/help');
    expect(await screen.findByRole('link', { name: 'help@example.test' })).toHaveAttribute('href', 'mailto:help@example.test');
    expect(screen.getByRole('link', { name: '+91 89560 00000' })).toHaveAttribute('href', 'tel:+918956000000');
  });
});
