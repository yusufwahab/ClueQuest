import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setTeacherToken, teacherToken } from './api';

export interface User { id: string; email: string; displayName: string; role: string }
interface AuthState { user: User | null; loading: boolean; login(email: string, password: string): Promise<void>; register(email: string, password: string, displayName: string): Promise<void>; logout(): void }

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!teacherToken());
  useEffect(() => {
    if (!teacherToken()) return;
    api<{ user: User }>('GET', '/me').then((r) => setUser(r.user)).catch(() => setTeacherToken(null)).finally(() => setLoading(false));
  }, []);
  const finish = (r: { token: string; user: User }) => { setTeacherToken(r.token); setUser(r.user); };
  const login = useCallback(async (email: string, password: string) => finish(await api('POST', '/auth/login', { body: { email, password }, auth: false })), []);
  const register = useCallback(async (email: string, password: string, displayName: string) => finish(await api('POST', '/auth/register', { body: { email, password, displayName }, auth: false })), []);
  const logout = useCallback(() => { setTeacherToken(null); setUser(null); }, []);
  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { const c = useContext(Ctx); if (!c) throw new Error('AuthProvider missing'); return c; }
