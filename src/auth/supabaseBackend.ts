import { createClient, type AuthError, type PostgrestError, type SupabaseClient, type User } from '@supabase/supabase-js';
import { isNativeApp } from '../app/native';
import {
  UserFacingError,
  type AuthBackend,
  type AuthUser,
  type Invitation,
  type Member,
  type MemberRole,
  type SubscriptionStatus,
  type Workspace,
} from './types';

/** Database error hints (set by our SQL functions) mapped to plain messages. */
const HINT_MESSAGES: Record<string, string> = {
  auth_required: 'Your session has ended. Sign in again.',
  invalid_name: 'Enter a business name of at least 2 characters.',
  too_many_businesses: 'You already own 3 businesses, the most one login can own.',
  invite_invalid: 'This invitation link is not valid. Ask the business owner for a new one.',
  invite_used: 'This invitation has already been used.',
  invite_expired: 'This invitation has expired. Ask the business owner for a new one.',
  invite_wrong_email: 'This invitation was sent to a different email address. Sign in with that email to join.',
  read_only: 'This workspace is read-only until the subscription is renewed.',
  forbidden: 'You do not have permission to do that.',
  already_member: 'This person is already a member of the business.',
  invalid_email: 'Enter a valid email address.',
  invalid_role: 'That role cannot be given this way.',
  self_change: 'You cannot change your own access.',
  owner_protected: "The owner's access cannot be changed.",
  not_found: 'That item no longer exists. Refresh the page.',
};

function fromDatabase(error: PostgrestError): UserFacingError {
  const hint = error.hint ?? '';
  if (hint.startsWith('plan_limit:')) return new UserFacingError(error.message, hint);
  const known = HINT_MESSAGES[hint];
  if (known) return new UserFacingError(known, hint);
  return new UserFacingError('The server could not complete that. Try again.', error.code ?? 'db_error');
}

function fromAuth(error: AuthError): UserFacingError {
  const code = error.code ?? '';
  switch (code) {
    case 'invalid_credentials':
      return new UserFacingError('Email or password is incorrect.', code);
    case 'email_not_confirmed':
      return new UserFacingError('Confirm your email first. Open the link we sent you, then sign in.', code);
    case 'user_already_exists':
    case 'email_exists':
      return new UserFacingError('An account with this email already exists. Sign in instead.', code);
    case 'weak_password':
      return new UserFacingError('Choose a stronger password: at least 8 characters, not a common one.', code);
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new UserFacingError('Too many attempts. Wait a minute and try again.', code);
    case 'otp_expired':
      return new UserFacingError('That code is wrong or has expired. Check the latest email, or send a new code.', code);
    case 'otp_disabled':
    case 'signup_disabled':
      return new UserFacingError('Sign-in by email code is not switched on for this app yet.', code);
    case 'provider_disabled':
    case 'validation_failed':
      if (/provider is not enabled/i.test(error.message)) {
        return new UserFacingError('Google sign-in is not switched on for this app yet. Use email instead.', code);
      }
      return new UserFacingError(error.message || 'Sign-in failed. Try again.', code);
    case 'same_password':
      return new UserFacingError('Choose a password different from your current one.', code);
    default:
      return new UserFacingError(error.message || 'Sign-in failed. Try again.', code || 'auth_error');
  }
}

function toUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown };
  return {
    id: user.id,
    email: user.email ?? '',
    fullName: typeof meta.full_name === 'string' ? meta.full_name : '',
  };
}

interface MembershipRow {
  role: MemberRole;
  tenants: {
    id: string;
    name: string;
    plan_code: string;
    subscription_status: SubscriptionStatus;
    trial_ends_at: string;
    is_demo: boolean;
  } | null;
}

/** Where Google and emailed links return to inside the Android app (see AndroidManifest.xml). */
export const NATIVE_CALLBACK = 'com.rkdigitals.jobflow://auth/callback';

/** Query and fragment parameters of a redirect URL, merged. */
export function redirectParams(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  if (queryStart >= 0) new URLSearchParams(url.slice(queryStart + 1, hashStart > queryStart ? hashStart : undefined)).forEach((v, k) => merged.set(k, v));
  if (hashStart >= 0) new URLSearchParams(url.slice(hashStart + 1)).forEach((v, k) => merged.set(k, v));
  return merged;
}

export function createSupabaseBackend(client: SupabaseClient): AuthBackend {
  const redirect = (path: string) => `${window.location.origin}${path}`;
  // Links in emails must open the app on a phone, and the website in a browser.
  const emailReturn = (next: string) =>
    isNativeApp() ? `${NATIVE_CALLBACK}?next=${encodeURIComponent(next)}` : redirect(next === '/' ? '/auth/callback' : next);

  return {
    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },

    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw fromAuth(error);
    },

    async signUp(email, password, fullName) {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: emailReturn('/') },
      });
      if (error) throw fromAuth(error);
      return { needsEmailConfirmation: !data.session };
    },

    async signInWithGoogle() {
      const native = isNativeApp();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: native ? NATIVE_CALLBACK : redirect('/auth/callback'),
          // In the app, Google must open in the phone's browser: Google refuses sign-in inside app web views.
          skipBrowserRedirect: native,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw fromAuth(error);
      if (native && data.url) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url, presentationStyle: 'popover' });
      }
    },

    async sendSignInCode(email, fullName) {
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: emailReturn('/'),
          ...(fullName?.trim() ? { data: { full_name: fullName.trim() } } : {}),
        },
      });
      if (error) throw fromAuth(error);
    },

    async verifySignInCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
      if (error) throw fromAuth(error);
    },

    async finishRedirectSignIn(url) {
      const params = redirectParams(url);
      const problem = params.get('error_description') ?? params.get('error');
      if (problem) {
        throw new UserFacingError(
          /access_denied|cancel/i.test(problem) ? 'Sign-in was cancelled.' : `Sign-in did not finish: ${problem.replace(/\+/g, ' ')}`,
          'redirect_error',
        );
      }
      // On the web the client finishes the sign-in itself when the page loads.
      const { data } = await client.auth.getSession();
      if (data.session) return;
      const code = params.get('code');
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw new UserFacingError('This sign-in link has expired or was opened in a different browser. Try again.', 'exchange_failed');
        return;
      }
      throw new UserFacingError('This sign-in link is not valid any more. Try again.', 'no_session');
    },

    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: emailReturn('/reset-password') });
      if (error) throw fromAuth(error);
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw fromAuth(error);
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw fromAuth(error);
    },

    async listWorkspaces() {
      const { data: session } = await client.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) return [];
      const { data, error } = await client
        .from('memberships')
        .select('role, tenants(id, name, plan_code, subscription_status, trial_ends_at, is_demo)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .returns<MembershipRow[]>();
      if (error) throw fromDatabase(error);
      return (data ?? [])
        .filter((row): row is MembershipRow & { tenants: NonNullable<MembershipRow['tenants']> } => row.tenants !== null)
        .map<Workspace>((row) => ({
          tenantId: row.tenants.id,
          name: row.tenants.name,
          role: row.role,
          planCode: row.tenants.plan_code,
          subscriptionStatus: row.tenants.subscription_status,
          trialEndsAt: new Date(row.tenants.trial_ends_at),
          isDemo: row.tenants.is_demo,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async createBusiness(name, ownerName) {
      const { data, error } = await client.rpc('create_business', { p_name: name.trim(), p_owner_name: ownerName.trim() });
      if (error) throw fromDatabase(error);
      return data as string;
    },

    async acceptInvitation(token) {
      const { data, error } = await client.rpc('accept_invitation', { p_token: token });
      if (error) throw fromDatabase(error);
      return data as string;
    },

    async listMembers(tenantId) {
      const { data: rows, error } = await client
        .from('memberships')
        .select('id, user_id, role')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .returns<{ id: string; user_id: string; role: MemberRole }[]>();
      if (error) throw fromDatabase(error);
      const ids = (rows ?? []).map((row) => row.user_id);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles, error: profileError } = await client
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', ids)
          .returns<{ user_id: string; full_name: string }[]>();
        if (profileError) throw fromDatabase(profileError);
        for (const profile of profiles ?? []) names.set(profile.user_id, profile.full_name);
      }
      const order: MemberRole[] = ['owner', 'admin', 'production_manager', 'employee'];
      return (rows ?? [])
        .map<Member>((row) => ({
          membershipId: row.id,
          userId: row.user_id,
          name: names.get(row.user_id) || 'Unnamed member',
          role: row.role,
        }))
        .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
    },

    async listInvitations(tenantId) {
      const { data, error } = await client
        .from('invitations')
        .select('id, email, role, expires_at')
        .eq('tenant_id', tenantId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .returns<{ id: string; email: string; role: MemberRole; expires_at: string }[]>();
      if (error) throw fromDatabase(error);
      return (data ?? []).map<Invitation>((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: new Date(row.expires_at),
      }));
    },

    async createInvitation(tenantId, email, role) {
      const { data, error } = await client.rpc('create_invitation', { p_tenant: tenantId, p_email: email, p_role: role });
      if (error) throw fromDatabase(error);
      return data as string;
    },

    async revokeInvitation(invitationId) {
      const { error } = await client.rpc('revoke_invitation', { p_invitation: invitationId });
      if (error) throw fromDatabase(error);
    },

    async changeMemberRole(membershipId, role) {
      const { error } = await client.rpc('change_member_role', { p_membership: membershipId, p_role: role });
      if (error) throw fromDatabase(error);
    },

    async removeMember(membershipId) {
      const { error } = await client.rpc('revoke_member', { p_membership: membershipId });
      if (error) throw fromDatabase(error);
    },
  };
}

let sharedClient: SupabaseClient | null | undefined;

/** The one Supabase client for this app, or null when not configured (demo mode). */
export function supabaseClientFromEnv(): SupabaseClient | null {
  if (sharedClient !== undefined) return sharedClient;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  sharedClient =
    url && anonKey
      ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
      : null;
  return sharedClient;
}

/**
 * Builds the backend from environment settings, or returns null when the app
 * has not been connected to Supabase yet (it then runs in demo mode).
 */
export function backendFromEnv(): AuthBackend | null {
  const client = supabaseClientFromEnv();
  return client ? createSupabaseBackend(client) : null;
}
