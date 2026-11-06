import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { brand } from '@cluequest/config';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Backdrop, Field, Icon, Logo, Notice } from '../components/ui';

const PERKS = ['Write a quest once, use it for practice, live games and CBTs', 'Let the AI assistant draft the questions for you', 'Learners never need an account'];

export default function SignIn() {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={mode === 'register' ? '/welcome' : '/dashboard'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, password); else await register(email, password, name);
      nav(mode === 'register' ? '/welcome' : '/dashboard');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong'); } finally { setBusy(false); }
  };
  return (
    <Backdrop>
      <main className="container-page grid min-h-screen items-center gap-8 py-8 md:grid-cols-[1.1fr_1fr] md:gap-14">
        <div className="text-white">
          <Link to="/" className="inline-flex items-center gap-2.5 font-brand text-2xl font-extrabold"><Logo light size={36} />{brand.name}</Link>
          <p className="font-display mt-6 text-4xl font-semibold leading-tight sm:text-5xl md:mt-12">{mode === 'login' ? 'Welcome back, host.' : 'Start your first quest.'}</p>
          <p className="mt-3 max-w-md text-lg font-semibold text-white/90">{mode === 'login' ? 'Sign in to build quests and run games.' : 'Free to start. It takes under a minute.'}</p>
          <ul className="mt-6 hidden space-y-3 md:block">
            {PERKS.map((p) => <li key={p} className="flex items-start gap-3 font-semibold"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/25 text-white"><Icon name="check" className="h-4 w-4" /></span>{p}</li>)}
          </ul>
        </div>
        <form className="card space-y-4 animate-rise" onSubmit={submit}>
          <div>
            <h1 className="text-3xl">{mode === 'login' ? 'Host sign in' : 'Create a host account'}</h1>
            <p className="hint mt-1">Only hosts need an account. Learners join by link or room code.</p>
          </div>
          {error && <Notice kind="bad">{error}</Notice>}
          {mode === 'register' && <Field label="Your name" htmlFor="name"><input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="e.g. Ada Obi" /></Field>}
          <Field label="Email" htmlFor="email"><input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" /></Field>
          <Field label="Password" htmlFor="password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
            <input id="password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          <button className="btn btn-primary w-full" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <div className="border-t border-line pt-3 text-center">
            <button type="button" className="btn-quiet" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </main>
    </Backdrop>
  );
}
