import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Dexie from 'dexie';
import { buildWidgetSnapshot } from '../../src/app/widgets';
import { pathFromAppLink } from '../../src/app/native';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';

const now = new Date(2026, 10, 21, 10, 5);

describe('widget snapshot', () => {
  it('carries counts and labels only, and marks sample job figures as demo', () => {
    const snapshot = buildWidgetSnapshot({
      business: 'Alpha Fabricators',
      demo: true,
      customers: 12,
      sync: { kind: 'pending', pending: 3 },
      now,
    });
    expect(snapshot).toMatchObject({
      business: 'Alpha Fabricators',
      demo: true,
      customers: 12,
      waitingSync: 3,
      syncLabel: '3 changes waiting',
      syncTone: 'wait',
    });
    expect(snapshot.inProduction).toBeGreaterThan(0);
    expect(Object.keys(snapshot).sort()).toEqual(
      ['business', 'customers', 'delayed', 'demo', 'inProduction', 'syncLabel', 'syncTone', 'updatedLabel', 'waitingSync'],
    );
  });

  it('shows no sync wording before the app is connected', () => {
    const snapshot = buildWidgetSnapshot({ business: 'Demo', demo: true, customers: 0, sync: { kind: 'not_connected' }, now });
    expect(snapshot.syncLabel).toBe('');
    expect(snapshot.syncTone).toBe('none');
  });
});

describe('widget links', () => {
  it('open only JobFlow screens', () => {
    expect(pathFromAppLink('com.rkdigitals.jobflow://open/customers?new=1')).toBe('/customers?new=1');
    expect(pathFromAppLink('com.rkdigitals.jobflow://open/')).toBe('/');
    expect(pathFromAppLink('com.rkdigitals.jobflow://open')).toBe('/');
    expect(pathFromAppLink('https://evil.test/customers')).toBeNull();
    expect(pathFromAppLink('com.rkdigitals.jobflow://open//evil.test')).toBe('/');
  });

  it('opens the new-customer form from the widget button', async () => {
    await Dexie.delete('jobflow_demo_device');
    render(
      <AuthProvider backend={null}>
        <MemoryRouter initialEntries={['/customers?new=1']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('dialog', { name: 'New customer' })).toBeInTheDocument();
  });
});
