import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Dexie from 'dexie';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';

function renderCustomers() {
  return render(
    <AuthProvider backend={null}>
      <MemoryRouter initialEntries={['/customers']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(async () => {
  await Dexie.delete('jobflow_demo_device');
});

async function addCustomer(name: string, extra: Record<string, string> = {}) {
  await userEvent.click((await screen.findAllByRole('button', { name: 'Add customer' }))[0]!);
  const panel = await screen.findByRole('dialog', { name: 'New customer' });
  await userEvent.type(within(panel).getByLabelText(/Customer name/), name);
  for (const [label, value] of Object.entries(extra)) {
    await userEvent.type(within(panel).getByLabelText(label), value);
  }
  await userEvent.click(within(panel).getByRole('button', { name: 'Add customer' }));
}

describe('Customers', () => {
  it('starts empty and explains what to do', async () => {
    renderCustomers();
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(screen.getByText(/saved on this device only/)).toBeInTheDocument();
  });

  it('adds a customer that appears in the list', async () => {
    renderCustomers();
    await addCustomer('Deccan Pumps', { Phone: '98200 00000' });
    const table = await screen.findByRole('table', { name: 'Customers' });
    expect(within(table).getByText('Deccan Pumps')).toBeInTheDocument();
    expect(within(table).getByText('98200 00000')).toBeInTheDocument();
  });

  it('shows a clear message for an invalid GSTIN and keeps the panel open', async () => {
    renderCustomers();
    await addCustomer('Kaveri Agro Tools', { GSTIN: '1234' });
    expect(await screen.findByText(/A GSTIN has 15 characters/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New customer' })).toBeInTheDocument();
  });

  it('edits, searches and deletes', async () => {
    renderCustomers();
    await addCustomer('Deccan Pumps');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await addCustomer('Sahyadri Foods');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Search customers'), 'sahy');
    const table = screen.getByRole('table', { name: 'Customers' });
    await waitFor(() => expect(within(table).queryByText('Deccan Pumps')).not.toBeInTheDocument());

    await userEvent.click(within(table).getByText('Sahyadri Foods'));
    const panel = await screen.findByRole('dialog', { name: 'Edit customer' });
    const name = within(panel).getByLabelText(/Customer name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Sahyadri Foods Pvt Ltd');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save changes' }));
    expect(await within(table).findByText('Sahyadri Foods Pvt Ltd')).toBeInTheDocument();

    await userEvent.click(within(table).getByText('Sahyadri Foods Pvt Ltd'));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(within(table).queryByText('Sahyadri Foods Pvt Ltd')).not.toBeInTheDocument());
  });
});
