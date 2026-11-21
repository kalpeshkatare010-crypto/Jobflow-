import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';

describe('Updates screen', () => {
  it('is in the menu and shows the version and what is new', async () => {
    render(
      <AuthProvider backend={null}>
        <MemoryRouter initialEntries={['/updates']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Updates' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Updates/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(/The website updates itself/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByText('A quieter, cleaner look')).toBeInTheDocument();
  });
});
