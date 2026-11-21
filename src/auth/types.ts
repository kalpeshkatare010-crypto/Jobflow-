export type MemberRole = 'owner' | 'admin' | 'production_manager' | 'employee';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

/** A business the signed-in person belongs to. */
export interface Workspace {
  tenantId: string;
  name: string;
  role: MemberRole;
  planCode: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date;
  isDemo: boolean;
}

/** Roles that can manage the team. */
export function canManageTeam(role: MemberRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  production_manager: 'Production manager',
  employee: 'Employee',
};

export interface Member {
  membershipId: string;
  userId: string;
  name: string;
  role: MemberRole;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
}

/**
 * Everything the app needs from the sign-in service. The real implementation
 * talks to Supabase; tests use an in-memory one.
 */
/** Operator-wide numbers for the JobFlow owner (RK Digitals). Counts only, never job contents. */
export interface PlatformStats {
  generatedAt: string;
  signUps: number;
  signUpsLast7Days: number;
  activeLast7Days: number;
  activeLast30Days: number;
  businesses: number;
  onTrial: number;
  trialsEndingIn7Days: number;
  paying: number;
  payingByPlan: Record<string, number>;
  monthlyRevenuePaise: number;
  readOnly: number;
  jobs: number;
  jobsLast7Days: number;
  productionEntriesLast7Days: number;
  signUpsByWeek: { weekStart: string; count: number }[];
  recentBusinesses: {
    name: string;
    createdAt: string;
    plan: string;
    status: string;
    trialEndsAt: string;
    canWrite: boolean;
    members: number;
    jobs: number;
    lastActivityAt: string;
  }[];
}

/** What the server says about one business's access (public.tenant_access). */
export interface TenantAccess {
  canUse: boolean;
  /** The JobFlow owner's own business: free, no plan or price shown. */
  complimentary: boolean;
  isAdmin: boolean;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  periodEnd: Date | null;
  pricePaise: number | null;
  checkedAt: Date;
}

export interface AuthBackend {
  getUser(): Promise<AuthUser | null>;
  /** Calls back when the person signs in or out (also from another tab). Returns an unsubscribe function. */
  onChange(callback: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<{ needsEmailConfirmation: boolean }>;
  /**
   * Starts Google sign-in. On the web the page leaves for Google and comes back
   * to /auth/callback; in the Android app Google opens in the phone's browser.
   */
  signInWithGoogle(): Promise<void>;
  /** Emails a one-time sign-in code (and link). Creates the account on first use. */
  sendSignInCode(email: string, fullName?: string): Promise<void>;
  verifySignInCode(email: string, code: string): Promise<void>;
  /** Completes a sign-in that returned from the browser (Google or an emailed link). */
  finishRedirectSignIn(url: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  listWorkspaces(): Promise<Workspace[]>;
  /** True only for accounts on the server's private owner list. */
  isPlatformAdmin(): Promise<boolean>;
  /** Refused by the server for anyone not on the owner list. */
  platformStats(): Promise<PlatformStats>;
  /** Whether this business can use JobFlow now (trial, subscription or the owner's own). */
  tenantAccess(tenantId: string): Promise<TenantAccess>;
  createBusiness(name: string, ownerName: string): Promise<string>;
  acceptInvitation(token: string): Promise<string>;
  // Team management (owners and admins; the server checks permission)
  listMembers(tenantId: string): Promise<Member[]>;
  listInvitations(tenantId: string): Promise<Invitation[]>;
  /** Returns the one-time invitation token. */
  createInvitation(tenantId: string, email: string, role: MemberRole): Promise<string>;
  revokeInvitation(invitationId: string): Promise<void>;
  changeMemberRole(membershipId: string, role: MemberRole): Promise<void>;
  removeMember(membershipId: string): Promise<void>;
}

/** An error whose message is safe and helpful to show to the person. */
export class UserFacingError extends Error {
  readonly code: string;
  constructor(message: string, code = 'unknown') {
    super(message);
    this.name = 'UserFacingError';
    this.code = code;
  }
}

export function messageOf(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof TypeError) return 'Could not reach the server. Check your internet connection and try again.';
  return 'Something went wrong. Try again, and contact support if it keeps happening.';
}
