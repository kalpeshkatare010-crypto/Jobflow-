import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../../src/app/theme';
import { ThemePicker } from '../../src/app/ThemePicker';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('Theme', () => {
  it('switches to dark and remembers the choice', async () => {
    render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    );
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('jobflow:theme')).toBe('"dark"');
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
