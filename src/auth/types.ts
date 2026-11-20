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
export interface AuthBackend {
  getUser(): Promise<AuthUser | null>;
  /** Calls back when the person signs in or out (also from another tab). Returns an unsubscribe function. */
  onChange(callback: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<{ needsEmailConfirmation: boolean }>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  listWorkspaces(): Promise<Workspace[]>;
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
