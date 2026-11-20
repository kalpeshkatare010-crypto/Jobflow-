import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Check, UserPlus } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorState, Input, Select, Skeleton } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { canManageTeam, messageOf, ROLE_LABEL, type Invitation, type Member, type MemberRole } from '../../auth/types';
import { appUrl } from '../../lib/appUrl';
import { formatShortDate } from '../../lib/format';
import { FormError } from '../../auth/AuthLayout';

const INVITE_ROLES: MemberRole[] = ['employee', 'production_manager', 'admin'];

function roleOptions(includeAdmin: boolean) {
  return INVITE_ROLES.filter((role) => includeAdmin || role !== 'admin').map((role) => ({ value: role, label: ROLE_LABEL[role] }));
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[var(--radius-control)] border border-good/30 bg-good-soft p-3">
      <p className="text-[13px] font-medium text-ink-900">Invitation created. Send this link to the person:</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1.5 text-[12px] break-all text-ink-700">{url}</code>
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-ink-500">
        The link works once, for that email address only, and expires in 7 days. It is shown only now.
      </p>
    </div>
  );
}

export function TeamSection() {
  const { backend, activeWorkspace, user } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('employee');
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const tenantId = activeWorkspace?.tenantId;
  const myRole = activeWorkspace?.role;
  const manage = canManageTeam(myRole);

  const load = useCallback(async () => {
    if (!backend || !tenantId) return;
    try {
      const [memberList, inviteList] = await Promise.all([
        backend.listMembers(tenantId),
        manage ? backend.listInvitations(tenantId) : Promise.resolve([]),
      ]);
      setMembers(memberList);
      setInvitations(inviteList);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error));
    }
  }, [backend, tenantId, manage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!backend || !tenantId) {
    return (
      <Card>
        <CardHeader title="Team" />
        <p className="text-sm text-ink-500">Team management is available once JobFlow is connected to your account.</p>
      </Card>
    );
  }

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      await load();
    } catch (error) {
      setActionError(messageOf(error));
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!backend || !tenantId) return;
    setBusy(true);
    setInviteUrl(null);
    await run(async () => {
      const token = await backend.createInvitation(tenantId, email, role);
      setInviteUrl(appUrl(`/invite/${token}`));
      setEmail('');
    });
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader
        title="Team"
        description="People who can sign in to this business. Shop-floor workers without a login go in Employees."
      />
      {loadError ? (
        <ErrorState title="The team could not be loaded" description={loadError} onRetry={() => void load()} />
      ) : (
        <div className="flex flex-col gap-6">
          <FormError message={actionError} />

          <ul className="divide-y divide-line" aria-label="Members" aria-busy={members === null || undefined}>
            {members === null
              ? Array.from({ length: 2 }, (_, index) => (
                  <li key={index} className="py-3">
                    <Skeleton className="h-4 w-40" />
                  </li>
                ))
              : members.map((member) => {
                  const isMe = member.userId === user?.id;
                  const editable = manage && !isMe && member.role !== 'owner' && (member.role !== 'admin' || myRole === 'owner');
                  return (
                    <li key={member.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {member.name}
                          {isMe ? <span className="font-normal text-ink-500"> (you)</span> : null}
                        </p>
                      </div>
                      {editable ? (
                        <>
                          <label className="sr-only" htmlFor={`role-${member.membershipId}`}>
                            Role for {member.name}
                          </label>
                          <select
                            id={`role-${member.membershipId}`}
                            value={member.role}
                            onChange={(event) =>
                              void run(() => backend.changeMemberRole(member.membershipId, event.target.value as MemberRole))
                            }
                            className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px]"
                          >
                            {roleOptions(myRole === 'owner').map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (window.confirm(`Remove ${member.name}? They lose access immediately.`)) {
                                void run(() => backend.removeMember(member.membershipId));
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <Badge tone={member.role === 'owner' ? 'signal' : 'neutral'}>{ROLE_LABEL[member.role]}</Badge>
                      )}
                    </li>
                  );
                })}
          </ul>

          {manage ? (
            <>
              {invitations.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-[13px] font-medium text-ink-700">Waiting to join</h3>
                  <ul className="divide-y divide-line">
                    {invitations.map((invitation) => (
                      <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate text-ink-900">{invitation.email}</span>
                        <span className="text-[12px] text-ink-500">
                          {ROLE_LABEL[invitation.role]}, expires {formatShortDate(invitation.expiresAt)}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => void run(() => backend.revokeInvitation(invitation.id))}>
                          Cancel invitation
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end" noValidate>
                <Input label="Invite by email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                <Select
                  label="Role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as MemberRole)}
                  options={roleOptions(myRole === 'owner')}
                />
                <Button type="submit" loading={busy} disabled={!email.includes('@')} icon={<UserPlus aria-hidden className="size-4" />}>
                  Create invitation
                </Button>
              </form>
              {inviteUrl ? <CopyLink url={inviteUrl} /> : null}
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}
