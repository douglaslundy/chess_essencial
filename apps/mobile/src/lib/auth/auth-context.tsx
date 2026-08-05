import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import type { LoginInput, PublicUser, UpdateMeInput } from '@xadrez/contracts';

import { api, ApiProblem } from '@/lib/api/client';
import { clearSession, getAccessToken, getRefreshToken, saveSession } from '@/lib/api/session';

interface AuthContextValue {
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateMeInput) => Promise<void>;
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

  const updateProfile = useCallback(
    async (input: UpdateMeInput) => {
      if (!user) throw new ApiProblem(401, 'Entre na sua conta para salvar preferências.');
      const token = await getAccessToken();
      if (!token) throw new ApiProblem(401, 'Sessão expirada. Entre novamente.');
      const previous = user;
      setUser({ ...user, profile: { ...user.profile, ...input } });
      try {
        setUser(await api.updateMe(input, token));
      } catch (error) {
        setUser(previous);
        throw error;
      }
    },
    [user],
  );

  const value = useMemo(
    () => ({ isLoading, login, logout, updateProfile, user }),
    [isLoading, login, logout, updateProfile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
