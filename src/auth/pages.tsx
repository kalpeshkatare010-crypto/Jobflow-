import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { MailCheck, Building2 } from 'lucide-react';
import { Button, buttonStyles, Input } from '../components/ui';
import { AuthLayout, FormError, safeNext } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { messageOf, ROLE_LABEL } from './types';
import { GoogleSignIn } from './signInExtras';

const MIN_PASSWORD = 8;
const linkClass = 'font-medium text-info hover:underline';

function useNextParam() {
  const [params] = useSearchParams();
  return safeNext(params.get('next'));
}

function withNext(path: string, next: string) {
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

// -----------------------------------------------------------------------------
export function SignInPage() {
  const { backend, status } = useAuth();
  const next = useNextParam();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'demo') return <Navigate to="/" replace />;
  if (status === 'signed_in') return <Navigate to={next} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!backend) return;
    setError(null);
    setBusy(true);
    try {
      // The page redirects to `next` once the session is active.
      await backend.signIn(email, password);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to JobFlow"
      description="Production management, simplified."
      footer={
        <>
          New to JobFlow?{' '}
          <Link className={linkClass} to={withNext('/sign-up', next)}>
            Create an account
          </Link>
        </>
      }
    >
      <GoogleSignIn next={next} />
      <form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormError message={error} />
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} disabled={!email || !password}>
          Sign in
        </Button>
        <Link className={`${linkClass} text-center text-[13px]`} to={withNext('/sign-in/code', next)}>
          Email me a sign-in code instead
        </Link>
        <Link className={`${linkClass} text-center text-[13px]`} to="/forgot-password">
          Forgot your password?
        </Link>
      </form>
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
export function SignUpPage() {
  const { backend, status } = useAuth();
  const next = useNextParam();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (status === 'demo') return <Navigate to="/" replace />;
  if (status === 'signed_in') return <Navigate to={next} replace />;

  const passwordError = password && password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!backend || passwordError) return;
    setError(null);
    setBusy(true);
    try {
      const result = await backend.signUp(email, password, fullName);
      // Without email confirmation the session starts and the page redirects.
      if (result.needsEmailConfirmation) setSentTo(email.trim());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confirm your email" footer={<Link className={linkClass} to={withNext('/sign-in', next)}>Back to sign in</Link>}>
        <div className="flex gap-3 text-sm text-ink-700">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
          <p>
            We sent a link to <span className="font-medium text-ink-900">{sentTo}</span>. Open it on this device to
            confirm your account, then sign in.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Start a 14-day trial. No card needed."
      footer={
        <>
          Already have an account?{' '}
          <Link className={linkClass} to={withNext('/sign-in', next)}>
            Sign in
          </Link>
        </>
      }
    >
      <GoogleSignIn next={next} label="Sign up with Google" />
      <form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormError message={error} />
        <Input label="Your name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={passwordError}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} disabled={!fullName.trim() || !email || password.length < MIN_PASSWORD}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
export function ForgotPasswordPage() {
  const { backend, status } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (status === 'demo') return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!backend) return;
    setError(null);
    setBusy(true);
    try {
      await backend.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description={sent ? undefined : 'Enter your email and we will send you a link to choose a new password.'}
      footer={<Link className={linkClass} to="/sign-in">Back to sign in</Link>}
    >
      {sent ? (
        <p className="text-sm text-ink-700">
          If an account exists for <span className="font-medium text-ink-900">{email.trim()}</span>, a reset link is on its
          way. It can take a few minutes; check your spam folder too.
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <FormError message={error} />
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={busy} disabled={!email}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
export function ResetPasswordPage() {
  const { backend, status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'demo') return <Navigate to="/" replace />;
  if (status === 'loading') return null;
  if (status === 'signed_out') {
    return (
      <AuthLayout title="This link has expired" footer={<Link className={linkClass} to="/forgot-password">Request a new link</Link>}>
        <p className="text-sm text-ink-700">Password reset links work once and expire after a short time.</p>
      </AuthLayout>
    );
  }

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!backend || password.length < MIN_PASSWORD) return;
    setError(null);
    setBusy(true);
    try {
      await backend.updatePassword(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormError message={error} />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={busy} disabled={password.length < MIN_PASSWORD}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
export function InvitePage() {
  const { backend, status, user, refreshWorkspaces, selectWorkspace } = useAuth();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/invite/${encodeURIComponent(token)}`;

  if (status === 'demo') return <Navigate to="/" replace />;
  if (status === 'loading') return null;

  if (status === 'signed_out') {
    return (
      <AuthLayout
        title="You have been invited to JobFlow"
        description="Sign in, or create an account with the email address the invitation was sent to."
      >
        <div className="flex flex-col gap-3">
          <Link to={withNext('/sign-up', here)} className={buttonStyles('primary', 'md', 'w-full')}>
            Create an account
          </Link>
          <Link to={withNext('/sign-in', here)} className={buttonStyles('secondary', 'md', 'w-full')}>
            I already have an account
          </Link>
        </div>
      </AuthLayout>
    );
  }

  async function join() {
    if (!backend) return;
    setError(null);
    setBusy(true);
    try {
      const tenantId = await backend.acceptInvitation(token);
      await refreshWorkspaces();
      selectWorkspace(tenantId);
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Join the business" description={`You are signed in as ${user?.email ?? ''}.`}>
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <Button onClick={join} loading={busy} icon={<Building2 aria-hidden className="size-4" />}>
          Join business
        </Button>
      </div>
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
export function OnboardingPage() {
  const { backend, status, user, workspaces, refreshWorkspaces, selectWorkspace, signOut } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState(user?.fullName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'demo') return <Navigate to="/" replace />;
  if (status === 'loading') return null;
  if (status === 'signed_out') return <Navigate to={withNext('/sign-in', '/onboarding')} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!backend) return;
    setError(null);
    setBusy(true);
    try {
      const tenantId = await backend.createBusiness(businessName, ownerName);
      await refreshWorkspaces();
      selectWorkspace(tenantId);
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Set up your business"
      description="You can change these details later in Settings."
      footer={
        workspaces.length > 0 ? (
          <Link className={linkClass} to="/">
            Back to my businesses
          </Link>
        ) : (
          <>
            Joining someone else's business? Open the invitation link they sent you.{' '}
            <button type="button" className={linkClass} onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        )
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormError message={error} />
        <Input
          label="Business name"
          required
          placeholder="As it should appear on job cards"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
        <Input label="Your name" autoComplete="name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        <Button type="submit" loading={busy} disabled={businessName.trim().length < 2}>
          Create business
        </Button>
      </form>
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
export function ChooseBusinessPage() {
  const { status, workspaces, selectWorkspace } = useAuth();
  const navigate = useNavigate();

  if (status !== 'signed_in') return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Choose a business"
      footer={
        <Link className={linkClass} to="/onboarding">
          Create another business
        </Link>
      }
    >
      <ul className="flex flex-col gap-2">
        {workspaces.map((workspace) => (
          <li key={workspace.tenantId}>
            <button
              type="button"
              onClick={() => {
                selectWorkspace(workspace.tenantId);
                navigate('/', { replace: true });
              }}
              className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-4 py-3 text-left hover:bg-sunken"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">{workspace.name}</span>
                <span className="text-[12px] text-ink-500">{ROLE_LABEL[workspace.role]}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </AuthLayout>
  );
}
