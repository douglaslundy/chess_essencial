import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import type { LoginInput, PublicUser } from '@xadrez/contracts';

import { api, ApiProblem } from '@/lib/api/client';
import { clearSession, getAccessToken, getRefreshToken, saveSession } from '@/lib/api/session';

interface AuthContextValue {
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  user: PublicUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await api.getMe(token);
        if (!cancelled) setUser(me);
      } catch (error) {
        if (error instanceof ApiProblem && error.status === 401) await clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { tokens, user: loggedInUser } = await api.login(input);
    await saveSession(tokens);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    await clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ isLoading, login, logout, user }),
    [isLoading, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
