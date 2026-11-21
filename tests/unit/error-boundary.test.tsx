import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from '../../src/app/ErrorBoundary';

let explode = true;
function Fragile() {
  if (explode) throw new Error('boom');
  return <p>Screen works</p>;
}

describe('ErrorBoundary', () => {
  it('shows a recovery screen instead of a blank app, and recovers on Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Harness() {
      const [n] = useState(0);
      return (
        <ErrorBoundary key={n}>
          <Fragile />
        </ErrorBoundary>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('This screen ran into a problem');
    expect(screen.getByText(/Your saved work is safe on this device/)).toBeInTheDocument();
    explode = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Screen works')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
