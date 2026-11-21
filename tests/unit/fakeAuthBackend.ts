import { UserFacingError, type AuthBackend, type AuthUser, type Invitation, type Member, type Workspace } from '../../src/auth/types';

interface FakeOptions {
  /** Signed-in user at start. */
  user?: AuthUser | null;
  workspaces?: Workspace[];
  needsEmailConfirmation?: boolean;
}

/** In-memory AuthBackend for UI tests. Mirrors the real error messages for the cases tested. */
export function createFakeBackend(options: FakeOptions = {}) {
  let user: AuthUser | null = options.user ?? null;
  let workspaces: Workspace[] = options.workspaces ?? [];
  const listeners = new Set<(user: AuthUser | null) => void>();
  const passwords = new Map<string, string>([['owner@alpha.test', 'correct-horse']]);
  const calls: string[] = [];
  const sentCodes = new Map<string, string>();
  let members: Member[] = [
    { membershipId: 'm-owner', userId: 'user-1', name: 'Asha Kulkarni', role: 'owner' },
    { membershipId: 'm-ravi', userId: 'user-ravi', name: 'Ravi Shinde', role: 'employee' },
  ];
  let invitations: Invitation[] = [];

  const emit = () => listeners.forEach((listener) => listener(user));

  const backend: AuthBackend = {
    async getUser() {
      return user;
    },
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async signIn(email, password) {
      calls.push(`signIn:${email}`);
      if (passwords.get(email) !== password) throw new UserFacingError('Email or password is incorrect.', 'invalid_credentials');
      user = { id: 'user-1', email, fullName: 'Asha Kulkarni' };
      emit();
    },
    async signUp(email, _password, fullName) {
      calls.push(`signUp:${email}`);
      if (options.needsEmailConfirmation) return { needsEmailConfirmation: true };
      user = { id: 'user-2', email, fullName };
      emit();
      return { needsEmailConfirmation: false };
    },
    async signInWithGoogle() {
      calls.push('google');
    },
    async sendSignInCode(email) {
      calls.push(`sendCode:${email}`);
      sentCodes.set(email.trim(), '123456');
    },
    async verifySignInCode(email, code) {
      calls.push(`verifyCode:${email}`);
      if (sentCodes.get(email.trim()) !== code.replace(/\s/g, '')) {
        throw new UserFacingError('That code is wrong or has expired. Check the latest email, or send a new code.', 'otp_expired');
      }
      user = { id: 'user-3', email: email.trim(), fullName: '' };
      emit();
    },
    async finishRedirectSignIn(url) {
      calls.push(`finish:${url}`);
      if (url.includes('error=access_denied')) throw new UserFacingError('Sign-in was cancelled.', 'redirect_error');
      user = { id: 'user-4', email: 'google@alpha.test', fullName: 'Google User' };
      emit();
    },
    async requestPasswordReset(email) {
      calls.push(`reset:${email}`);
    },
    async updatePassword() {
      calls.push('updatePassword');
    },
    async signOut() {
      calls.push('signOut');
      user = null;
      emit();
    },
    async listWorkspaces() {
      return workspaces;
    },
    async createBusiness(name) {
      calls.push(`createBusiness:${name}`);
      const tenantId = `tenant-${workspaces.length + 1}`;
      workspaces = [
        ...workspaces,
        {
          tenantId,
          name,
          role: 'owner',
          planCode: 'starter',
          subscriptionStatus: 'trialing',
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
          isDemo: false,
        },
      ];
      return tenantId;
    },
    async acceptInvitation(token) {
      calls.push(`accept:${token}`);
      if (token !== 'good-token') {
        throw new UserFacingError('This invitation link is not valid. Ask the business owner for a new one.', 'invite_invalid');
      }
      workspaces = [
        ...workspaces,
        {
          tenantId: 'tenant-invited',
          name: 'Invited Works',
          role: 'employee',
          planCode: 'starter',
          subscriptionStatus: 'active',
          trialEndsAt: new Date(),
          isDemo: false,
        },
      ];
      return 'tenant-invited';
    },
    async listMembers() {
      return members;
    },
    async listInvitations() {
      return invitations;
    },
    async createInvitation(_tenantId, email, role) {
      calls.push(`invite:${email}:${role}`);
      if (members.length + invitations.length >= 3) {
        throw new UserFacingError('Your plan allows 3 logins. Upgrade to invite more people.', 'plan_limit:logins');
      }
      invitations = [...invitations, { id: `inv-${invitations.length + 1}`, email, role, expiresAt: new Date(Date.now() + 7 * 86_400_000) }];
      return 'raw-token-123';
    },
    async revokeInvitation(id) {
      calls.push(`revokeInvitation:${id}`);
      invitations = invitations.filter((invitation) => invitation.id !== id);
    },
    async changeMemberRole(id, role) {
      calls.push(`role:${id}:${role}`);
      members = members.map((member) => (member.membershipId === id ? { ...member, role } : member));
    },
    async removeMember(id) {
      calls.push(`remove:${id}`);
      members = members.filter((member) => member.membershipId !== id);
    },
  };

  return { backend, calls };
}

export function workspace(name: string, tenantId: string): Workspace {
  return {
    tenantId,
    name,
    role: 'owner',
    planCode: 'starter',
    subscriptionStatus: 'trialing',
    trialEndsAt: new Date(Date.now() + 10 * 86_400_000),
    isDemo: false,
  };
}
