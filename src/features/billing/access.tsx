import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import type { TenantAccess } from '../../auth/types';
import { readPreference, writePreference } from '../../lib/storage';
import { canUseNow, PLAN, subscriptionNotice, type SubscriptionNotice } from '../../domain/plans';

/**
 * Whether the current business can use JobFlow: the free trial, a paid month,
 * or the JobFlow owner's own business (free, prices hidden).
 *
 * The server decides (public.tenant_access) and also refuses changes on its own
 * side. The last answer is kept on the device so the check works offline; the
 * dates in it are re-checked against the clock, so an offline trial still ends.
 */
export interface Access {
  /** False only while the first answer for this business is still loading. */
  ready: boolean;
  canUse: boolean;
  /** The owner's own business: no plan, price or reminder is shown. */
  complimentary: boolean;
  notice: SubscriptionNotice;
  pricePaise: number;
}

interface Stored {
  canUse: boolean;
  complimentary: boolean;
  status: string;
  trialEndsAt: string | null;
  periodEnd: string | null;
  pricePaise: number | null;
}

const RECHECK_MS = 30 * 60_000;
const AccessContext = createContext<Access | null>(null);
const key = (tenantId: string) => `access:${tenantId}`;

function toStored(a: TenantAccess): Stored {
  return {
    canUse: a.canUse,
    complimentary: a.complimentary,
    status: a.status,
    trialEndsAt: a.trialEndsAt?.toISOString() ?? null,
    periodEnd: a.periodEnd?.toISOString() ?? null,
    pricePaise: a.pricePaise,
  };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const { backend, status, activeWorkspace } = useAuth();
  const tenantId = activeWorkspace?.tenantId;
  const [stored, setStored] = useState<{ tenantId: string; value: Stored | null } | null>(() =>
    tenantId ? { tenantId, value: readPreference<Stored | null>(key(tenantId), null) } : null,
  );
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    setStored({ tenantId, value: readPreference<Stored | null>(key(tenantId), null) });
    setFailed(false);
  }, [tenantId]);

  useEffect(() => {
    if (!backend || status !== 'signed_in' || !tenantId) return;
    let alive = true;
    const load = () =>
      backend
        .tenantAccess(tenantId)
        .then((answer) => {
          if (!alive) return;
          const value = toStored(answer);
          writePreference(key(tenantId), value);
          setStored({ tenantId, value });
        })
        .catch(() => alive && setFailed(true));
    void load();
    const timer = window.setInterval(() => {
      void load();
      setTick((t) => t + 1);
    }, RECHECK_MS);
    const online = () => void load();
    window.addEventListener('online', online);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('online', online);
    };
  }, [backend, status, tenantId]);

  const value = useMemo<Access>(() => {
    void tick;
    const now = new Date();
    if (status !== 'signed_in' || !activeWorkspace || activeWorkspace.isDemo) {
      return { ready: true, canUse: true, complimentary: false, notice: { kind: 'none' }, pricePaise: PLAN.pricePaise };
    }
    const known = stored && stored.tenantId === activeWorkspace.tenantId ? stored.value : null;
    if (!known) {
      // Nothing from the server yet: wait for it, or (offline) judge from the business's own dates.
      const facts = { subscriptionStatus: activeWorkspace.subscriptionStatus, trialEndsAt: activeWorkspace.trialEndsAt };
      return {
        ready: failed,
        canUse: canUseNow(facts, now),
        complimentary: false,
        notice: subscriptionNotice(facts, now),
        pricePaise: PLAN.pricePaise,
      };
    }
    const facts = {
      subscriptionStatus: known.status,
      trialEndsAt: known.trialEndsAt ? new Date(known.trialEndsAt) : null,
      periodEnd: known.periodEnd ? new Date(known.periodEnd) : null,
      complimentary: known.complimentary,
    };
    return {
      ready: true,
      canUse: known.complimentary || (known.canUse && canUseNow(facts, now)),
      complimentary: known.complimentary,
      notice: subscriptionNotice(facts, now),
      pricePaise: known.pricePaise ?? PLAN.pricePaise,
    };
  }, [status, activeWorkspace, stored, failed, tick]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

/** Outside the provider (tests of single screens) everything is allowed and nothing is shown. */
export function useAccess(): Access {
  return (
    useContext(AccessContext) ?? { ready: true, canUse: true, complimentary: false, notice: { kind: 'none' }, pricePaise: PLAN.pricePaise }
  );
}
