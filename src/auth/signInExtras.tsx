import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { MailCheck } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { AuthLayout, FormError, safeNext } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { googleSignInEnabled, rememberNext, takeRememberedNext } from './config';
import { messageOf } from './types';

const linkClass = 'font-medium text-info hover:underline';

/** "Continue with Google" plus the divider above the email form. Renders nothing when Google is off. */
export function GoogleSignIn({ next, label = 'Continue with Google' }: { next: string; label?: string }) {
  const { backend } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!backend || !googleSignInEnabled()) return null;

  async function start() {
    if (!backend) return;
    setError(null);
    setBusy(true);
    rememberNext(next);
    try {
      await backend.signInWithGoogle();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      // On the web the page has already left for Google; in the app the browser sheet is open.
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <Button variant="secondary" loading={busy} onClick={() => void start()} icon={<GoogleMark />}>
        {label}
      </Button>
      <div className="flex items-center gap-3 text-[12px] text-ink-500" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

/** A plain letter mark, not Google's logo. */
function GoogleMark() {
  return (
    <span aria-hidden className="grid size-5 place-items-center rounded-full border border-line-strong text-[11px] font-bold text-ink-700">
      G
    </span>
  );
}

// -----------------------------------------------------------------------------
/** Sign in without a password: we email a one-time code (and a link). */
export function CodeSignInPage() {
  const { backend, status } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  if (status === 'demo') return <Navigate to="/" replace />;
  if (status === 'signed_in') return <Navigate to={next} replace />;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!backend) return;
    setError(null);
    setBusy(true);
    try {
      rememberNext(next);
      await backend.sendSignInCode(email);
      if (sentTo) setResent(true);
      setSentTo(email.trim());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!backend || !sentTo) return;
    setError(null);
    setBusy(true);
    try {
      // The page redirects to `next` once the session is active.
      await backend.verifySignInCode(sentTo, code);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <Link className={linkClass} to={next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`}>
      Sign in with a password instead
    </Link>
  );

  if (sentTo) {
    const digits = code.replace(/\s/g, '');
    return (
      <AuthLayout title="Check your email" footer={footer}>
        <form className="flex flex-col gap-4" onSubmit={verify} noValidate>
          <div className="flex gap-3 text-sm text-ink-700">
            <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
            <p>
              We sent a sign-in code to <span className="font-medium text-ink-900">{sentTo}</span>. Enter it below, or
              open the link in the email on this device. New here? This also creates your account.
            </p>
          </div>
          <FormError message={error} />
          <Input
            label="Sign-in code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <Button type="submit" loading={busy} disabled={!/^\d{6,10}$/.test(digits)}>
            Sign in
          </Button>
          <p className="text-center text-[13px] text-ink-500">
            {resent ? 'A new code is on its way. ' : 'No email after a minute? Check spam, or '}
            <button type="button" className={linkClass} onClick={() => void send()} disabled={busy}>
              send a new code
            </button>
            {', or '}
            <button
              type="button"
              className={linkClass}
              onClick={() => {
                setSentTo(null);
                setCode('');
                setResent(false);
              }}
            >
              use another email
            </button>
          </p>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in with an email code" description="No password needed. We email you a one-time code." footer={footer}>
      <div className="flex flex-col gap-4">
        <GoogleSignIn next={next} />
        <form className="flex flex-col gap-4" onSubmit={send} noValidate>
          <FormError message={error} />
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
            Email me a code
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}

// -----------------------------------------------------------------------------
/** Google and emailed links return here; the session is completed and the person moves on. */
export function AuthCallbackPage() {
  const { backend, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!backend || started.current) return;
    started.current = true;
    const next = safeNext(params.get('next') ?? takeRememberedNext());
    backend
      .finishRedirectSignIn(window.location.href)
      .then(() => navigate(next, { replace: true }))
      .catch((err: unknown) => setError(messageOf(err)));
  }, [backend, navigate, params]);

  if (status === 'demo') return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title={error ? 'Sign-in did not finish' : 'Signing you in'}
      footer={error ? <Link className={linkClass} to="/sign-in">Back to sign in</Link> : undefined}
    >
      {error ? <FormError message={error} /> : <p className="text-sm text-ink-700" role="status">One moment, finishing sign-in…</p>}
    </AuthLayout>
  );
}
