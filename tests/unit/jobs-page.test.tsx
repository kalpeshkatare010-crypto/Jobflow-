import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Dexie from 'dexie';
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

beforeEach(async () => {
  await Dexie.delete('jobflow_demo_device');
});

async function go(label: string) {
  await userEvent.click(screen.getAllByRole('link', { name: label })[0]!);
}

async function makeWorkflow(name: string, stages: string[]) {
  await userEvent.click((await screen.findAllByRole('button', { name: 'New workflow' }))[0]!);
  const panel = await screen.findByRole('dialog', { name: 'New workflow' });
  await userEvent.type(within(panel).getByLabelText(/Workflow name/), name);
  for (let i = 0; i < stages.length; i++) {
    if (i > 0) await userEvent.click(within(panel).getByRole('button', { name: 'Add stage' }));
    await userEvent.type(within(panel).getByLabelText(`Stage ${i + 1} name`), stages[i]!);
  }
  await userEvent.click(within(panel).getByRole('button', { name: 'Create workflow' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

async function makeCustomer(name: string) {
  await userEvent.click((await screen.findAllByRole('button', { name: 'Add customer' }))[0]!);
  const panel = await screen.findByRole('dialog', { name: 'New customer' });
  await userEvent.type(within(panel).getByLabelText(/Customer name/), name);
  await userEvent.click(within(panel).getByRole('button', { name: 'Add customer' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

describe('Workflows, employees and job orders', () => {
  it('adds an employee', async () => {
    renderAt('/employees');
    expect(await screen.findByText('No employees yet')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Add employee' })[0]!);
    const panel = await screen.findByRole('dialog', { name: 'New employee' });
    await userEvent.type(within(panel).getByLabelText(/^Name/), 'Sunil Pawar');
    await userEvent.click(within(panel).getByRole('button', { name: 'Add employee' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Sunil Pawar')).toBeInTheDocument();
  });

  it('points to customers and workflows when either is missing', async () => {
    renderAt('/jobs?new=1');
    const panel = await screen.findByRole('dialog', { name: 'New job' });
    expect(await within(panel).findByRole('link', { name: /a customer/ })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /a workflow/ })).toBeInTheDocument();
  });

  it('creates a job from a workflow, works its stages and shows it on the dashboard', async () => {
    renderAt('/workflows');
    await makeWorkflow('Sheet metal parts', ['Cutting', 'Bending', 'Packing']);
    expect(await screen.findByRole('list', { name: 'Stages of Sheet metal parts' })).toBeInTheDocument();

    await go('Customers');
    await makeCustomer('Deccan Pumps');

    await go('Job orders');
    expect(await screen.findByText('No job orders yet')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /New job|Create the first job/ })[0]!);
    const form = await screen.findByRole('dialog', { name: 'New job' });
    await userEvent.selectOptions(await within(form).findByLabelText(/^Customer/), 'Deccan Pumps');
    await userEvent.selectOptions(within(form).getByLabelText(/^Workflow/), 'Sheet metal parts');
    await userEvent.type(within(form).getByLabelText(/^Job name/), 'Pump brackets');
    await userEvent.type(within(form).getByLabelText(/^Quantity/), '250');
    await userEvent.click(within(form).getByRole('checkbox', { name: /Approve now/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Create job' }));

    // The detail opens: the job copied the workflow's stages.
    const detail = await screen.findByRole('dialog', { name: /Approved/ });
    expect(within(detail).getByText('Pump brackets')).toBeInTheDocument();
    for (const stage of ['Cutting', 'Bending', 'Packing']) expect(within(detail).getByText(stage)).toBeInTheDocument();

    // Starting a stage puts the job into production.
    await userEvent.click(within(detail).getByRole('button', { name: 'Start Cutting' }));
    expect(await screen.findByRole('dialog', { name: /In production/ })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done Cutting' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen Cutting' })).toBeInTheDocument());
    expect(await within(screen.getByRole('dialog')).findByText(/Cutting finished/)).toBeInTheDocument();

    // Cancelling asks for a reason first.
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel job' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel job' }));
    expect(await within(screen.getByRole('dialog')).findByText(/Give a reason/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Back' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const table = await screen.findByRole('table', { name: 'Job orders' });
    expect(within(table).getByText('Pump brackets')).toBeInTheDocument();

    // The dashboard now shows the business's own job, not samples.
    await go('Dashboard');
    await waitFor(() => expect(screen.queryByText('You are looking at demonstration data.')).not.toBeInTheDocument());
    const recent = await screen.findByRole('table', { name: 'Recent job orders' });
    expect(within(recent).getByText('Pump brackets')).toBeInTheDocument();
    expect(screen.queryAllByText('Demo data')).toHaveLength(0);
    expect(screen.getByText(/finished Cutting on/)).toBeInTheDocument();
  });
});
