import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { Badge, Card, CardHeader } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import { useLocalData } from "../../offline/LocalDataProvider";
import {
  formatRupees,
  limitLabel,
  planByCode,
  PLANS,
  subscriptionNotice,
  TRIAL_DAYS,
  type Plan,
} from "../../domain/plans";
import { mailtoLink, supportContact, whatsappLink } from "../../app/support";
import { cn } from "../../lib/cn";

const OPEN = new Set(["draft", "approved", "in_production", "on_hold"]);

/** Plan, trial and usage. Online payment is not switched on (needs the owner's approval of a provider). */
export function PlanSection() {
  const { status, activeWorkspace, backend } = useAuth();
  const { db } = useLocalData();
  const [logins, setLogins] = useState<number | null>(null);
  const demo = status === "demo" || !activeWorkspace;

  const usage = useLiveQuery(async () => {
    const [employees, workflows, jobs] = await Promise.all([
      db.employees.toArray(),
      db.workflows.toArray(),
      db.jobOrders.toArray(),
    ]);
    return {
      employees: employees.filter((e) => !e.deleted_at && e.is_active).length,
      workflows: workflows.filter((w) => !w.deleted_at && !w.archived_at)
        .length,
      openJobs: jobs.filter((j) => !j.deleted_at && OPEN.has(j.status)).length,
    };
  }, [db]);

  useEffect(() => {
    if (demo || !backend || !activeWorkspace) return;
    let alive = true;
    backend
      .listMembers(activeWorkspace.tenantId)
      .then((members) => alive && setLogins(members.length))
      .catch(() => alive && setLogins(null));
    return () => {
      alive = false;
    };
  }, [demo, backend, activeWorkspace]);

  const current = activeWorkspace
    ? planByCode(activeWorkspace.planCode)
    : undefined;
  const notice = activeWorkspace
    ? subscriptionNotice(activeWorkspace, new Date())
    : { kind: "none" as const };
  const contact = supportContact();
  const message = `Hi, I would like to continue with JobFlow${activeWorkspace ? ` for ${activeWorkspace.name}` : ""}.`;

  return (
    <section id="plan" aria-label="Plan and billing" className="scroll-mt-4">
      <Card>
        <CardHeader
          title="Plan and billing"
          description={
            demo
              ? `Every new business starts with a ${TRIAL_DAYS}-day free trial. No card needed.`
              : undefined
          }
        />
        {!demo && current ? (
          <div className="mb-5 flex flex-col gap-2 text-[13px]">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold">{current.name}</span>
              <StatusBadge kind={notice.kind} />
            </p>
            <p className="text-ink-700">{describe(notice)}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              current={!demo && current?.code === plan.code}
              usage={demo || !usage ? null : { ...usage, logins }}
            />
          ))}
        </div>

        <div className="mt-5 rounded-[var(--radius-control)] bg-sunken p-3 text-[13px] text-ink-700">
          <p>
            Online payment is not switched on yet. To continue after the trial,
            or to change plan, contact us and we will set it up for you.
          </p>
          {contact.email || contact.whatsapp ? (
            <p className="mt-2 flex flex-wrap gap-3">
              {contact.whatsapp ? (
                <a
                  className="font-medium text-info hover:underline"
                  href={whatsappLink(contact.whatsapp, message)}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp us
                </a>
              ) : null}
              {contact.email ? (
                <a
                  className="font-medium text-info hover:underline"
                  href={mailtoLink(contact.email, "JobFlow plan", message)}
                >
                  Email us
                </a>
              ) : null}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] text-ink-500">
            Prices are per business per month.
          </p>
        </div>
      </Card>
    </section>
  );
}

function describe(notice: ReturnType<typeof subscriptionNotice>): string {
  const date = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  switch (notice.kind) {
    case "trial":
    case "trial_ending":
      return `Free trial: ${notice.daysLeft} day${notice.daysLeft === 1 ? "" : "s"} left (until ${date(notice.endsAt)}).`;
    case "grace":
      return `The trial has ended. Everything keeps working until ${date(notice.readOnlyFrom)}; after that JobFlow becomes read-only until a plan is chosen. Nothing is deleted.`;
    case "payment_due":
      return "A payment is due. JobFlow keeps working for a few days, then becomes read-only. Nothing is deleted.";
    case "read_only":
      return "Read-only: you can see everything and download reports, but changes are paused until a plan is chosen. Nothing is deleted.";
    default:
      return "Your plan is active.";
  }
}

function StatusBadge({
  kind,
}: {
  kind: ReturnType<typeof subscriptionNotice>["kind"];
}) {
  if (kind === "none") return <Badge tone="good">Active</Badge>;
  if (kind === "trial") return <Badge tone="info">Trial</Badge>;
  if (kind === "trial_ending" || kind === "grace" || kind === "payment_due")
    return <Badge tone="warning">Action needed</Badge>;
  return <Badge tone="critical">Read-only</Badge>;
}

function PlanCard({
  plan,
  current,
  usage,
}: {
  plan: Plan;
  current: boolean;
  usage: {
    logins: number | null;
    employees: number;
    workflows: number;
    openJobs: number;
  } | null;
}) {
  const rows: {
    label: string;
    limit: number | null;
    used: number | null | undefined;
  }[] = [
    { label: "Logins", limit: plan.limits.logins, used: usage?.logins },
    {
      label: "Employees on the roster",
      limit: plan.limits.employees,
      used: usage?.employees,
    },
    {
      label: "Workflows",
      limit: plan.limits.workflows,
      used: usage?.workflows,
    },
    {
      label: "Open jobs at a time",
      limit: plan.limits.openJobs,
      used: usage?.openJobs,
    },
  ];
  return (
    <div
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] border p-4",
        current ? "border-ink-900" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">{plan.name}</p>
        {current ? <Badge tone="neutral">Your plan</Badge> : null}
      </div>
      <p className="mt-1">
        <span className="tabular text-[24px] font-semibold">
          {formatRupees(plan.pricePaise)}
        </span>
        <span className="text-[13px] text-ink-500"> / month</span>
      </p>
      <p className="mt-1 text-[13px] text-ink-500">{plan.summary}</p>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
        {rows.map((row) => {
          const over =
            current &&
            row.limit !== null &&
            typeof row.used === "number" &&
            row.used >= row.limit;
          return (
            <li
              key={row.label}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-1.5">
                <Check aria-hidden className="size-3.5 text-good" />
                {row.label}
              </span>
              <span
                className={cn(
                  "tabular",
                  over ? "font-semibold text-critical" : "text-ink-700",
                )}
              >
                {current && typeof row.used === "number"
                  ? `${row.used} of ${limitLabel(row.limit)}`
                  : limitLabel(row.limit)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A slim reminder above every screen when the trial is ending or the workspace is read-only. */
export function SubscriptionBanner() {
  const { status, activeWorkspace } = useAuth();
  if (status === "demo" || !activeWorkspace) return null;
  const notice = subscriptionNotice(activeWorkspace, new Date());
  if (notice.kind === "none" || notice.kind === "trial") return null;
  const critical = notice.kind === "read_only";
  const owner = activeWorkspace.role === "owner";
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-[13px]",
        critical ? "bg-critical/10 text-ink-900" : "bg-warning/15 text-ink-900",
      )}
    >
      <span>
        {notice.kind === "trial_ending"
          ? `The free trial ends in ${notice.daysLeft} day${notice.daysLeft === 1 ? "" : "s"}.`
          : notice.kind === "grace"
            ? "The free trial has ended. JobFlow becomes read-only soon."
            : notice.kind === "payment_due"
              ? "A payment is due."
              : "JobFlow is read-only: changes are paused. Nothing is deleted."}
        {owner ? null : " Please tell the business owner."}
      </span>
      {owner ? (
        <a
          href="/settings#plan"
          className="font-medium text-info hover:underline"
        >
          Choose a plan
        </a>
      ) : null}
    </div>
  );
}
