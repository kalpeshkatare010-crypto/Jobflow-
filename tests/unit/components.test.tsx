import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, DataTable, Input, JobStatusBadge, StageTrack, ErrorState } from '../../src/components/ui';

describe('Button', () => {
  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save job</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save job' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save job
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save job' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('links the label and announces errors', () => {
    render(<Input label="Customer name" error="Enter a customer name" />);
    const input = screen.getByLabelText('Customer name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a customer name');
  });
});

describe('JobStatusBadge', () => {
  it('shows the status in words, not colour alone', () => {
    render(<JobStatusBadge status="in_production" />);
    expect(screen.getByText('In production')).toBeInTheDocument();
  });
});

describe('StageTrack', () => {
  it('describes every stage and names the current one', () => {
    render(
      <StageTrack
        stages={[
          { name: 'Cutting', state: 'done' },
          { name: 'Welding', state: 'current' },
          { name: 'Packing', state: 'waiting' },
        ]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Stages - Cutting: done, Welding: in progress, Packing: not started',
    );
    expect(screen.getByText('Welding')).toBeInTheDocument();
    expect(screen.getByText(/stage 2 of 3/)).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  const columns = [{ key: 'name', header: 'Name' }];

  it('renders rows with a caption', () => {
    render(
      <DataTable caption="Customers" columns={columns} rows={[{ id: '1', name: 'Deccan Pumps' }]} rowKey={(r) => r.id} />,
    );
    expect(screen.getByRole('table', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByText('Deccan Pumps')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    render(
      <DataTable
        caption="Customers"
        columns={columns}
        rows={[] as { id: string; name: string }[]}
        rowKey={(r) => r.id}
        empty={{ title: 'No customers yet', description: 'Add your first customer to create a job.' }}
      />,
    );
    expect(screen.getByText('No customers yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('marks the table busy while loading', () => {
    render(<DataTable caption="Customers" columns={columns} rows={[]} rowKey={() => 'x'} loading />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with a retry action', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        caption="Customers"
        columns={columns}
        rows={[]}
        rowKey={() => 'x'}
        error={{ title: 'Customers could not load', description: 'Check your connection.', onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Customers could not load');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('ErrorState', () => {
  it('omits the retry button when no handler is given', () => {
    render(<ErrorState title="Failed" description="Reason" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
