import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';

function renderAt(path: string) {
  return render(
    <AuthProvider backend={null}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('App shell', () => {
  it('shows the dashboard with a clear demonstration-data notice', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('You are looking at demonstration data.');
    expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0);
  });

  it('shows the RK Digitals credit and copyright', () => {
    renderAt('/');
    expect(screen.getAllByText('Developed by RK Digitals').length).toBeGreaterThan(0);
    expect(screen.getByText('© 2026 RK Digitals. All rights reserved.')).toBeInTheDocument();
  });

  it('reports "Not connected" instead of claiming sync', () => {
    renderAt('/');
    const status = screen.getAllByRole('status').find((el) => el.textContent?.includes('Not connected'));
    expect(status).toBeDefined();
    expect(document.body.textContent).not.toMatch(/All changes synced/);
  });

  it('lists every MVP module in the navigation and none of the excluded ones', () => {
    renderAt('/');
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0]!;
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual([
      'Dashboard',
      'Job orders',
      'Production',
      'Customers',
      'Workflows',
      'Employees',
      'Inventory',
      'Reports',
      'Settings',
      'Help & Support',
    ]);
  });

  it('collapses the desktop sidebar and remembers it', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse menu' }));
    expect(screen.getByRole('button', { name: 'Expand menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem('jobflow:sidebarCollapsed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Expand menu' }));
  });

  it('opens and closes the phone menu', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByRole('link', { name: 'Customers' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // It slides out, then leaves the page.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument());
  });

  it('shows an honest holding page for modules not built yet', () => {
    renderAt('/customers');
    expect(screen.getByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByText('Customers is being built')).toBeInTheDocument();
  });

  it('shows a not-found page for unknown links', () => {
    renderAt('/does-not-exist');
    expect(screen.getByText('This page does not exist')).toBeInTheDocument();
  });
});

describe('Install button', () => {
  it('appears only when the browser offers installation', async () => {
    const { act } = await import('@testing-library/react');
    renderAt('/');
    expect(screen.queryByRole('button', { name: 'Install JobFlow app' })).not.toBeInTheDocument();
    const prompt = new Event('beforeinstallprompt');
    Object.assign(prompt, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => {
      window.dispatchEvent(prompt);
    });
    const button = await screen.findByRole('button', { name: 'Install JobFlow app' });
    await userEvent.click(button);
    expect(screen.queryByRole('button', { name: 'Install JobFlow app' })).not.toBeInTheDocument();
  });
});
