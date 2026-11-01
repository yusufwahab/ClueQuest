import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { brand } from '@cluequest/config';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field, Notice } from '../components/ui';

export default function SignIn() {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/quizzes" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, password); else await register(email, password, name);
      nav('/quizzes');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Something went wrong'); } finally { setBusy(false); }
  };
  return (
    <main className="container-page flex min-h-screen max-w-md flex-col justify-center py-10">
      <Link to="/" className="mb-6 text-xl font-bold">{brand.name}</Link>
      <form className="card space-y-4" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Host sign in' : 'Create a host account'}</h1>
        <p className="hint">Only hosts need an account. Learners join by link or room code.</p>
        {error && <Notice kind="bad">{error}</Notice>}
        {mode === 'register' && <Field label="Your name" htmlFor="name"><input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>}
        <Field label="Email" htmlFor="email"><input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <Field label="Password" htmlFor="password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
          <input id="password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn-quiet" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
