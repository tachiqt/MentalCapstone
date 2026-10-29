import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, removeToken } from './api';
import { isMobileRole } from './navigation';
import { signOutFromGoogle } from './google-auth';

export type User = {
  id: number;
  name: string;
  email: string;
  username?: string;
  role: string;
  /** Absolute URL from the API, served from public Cloud Storage in the cloud. */
  avatar_url?: string | null;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  googleLogin: (idToken: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

function assertMobileUser(user: User): User {
  if (!isMobileRole(user.role)) {
    throw new Error('This account is for the web dashboard. Use a Teacher, Caretaker, or Parent account.');
  }
  return user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getToken();
      if (stored) {
        try {
          const data = await api<User>('/me');
          if (isMobileRole(data.role)) {
            setUser(data);
            setTokenState(stored);
          } else {
            await removeToken();
          }
        } catch {
          await removeToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/login', {
      method: 'POST',
      body: { username: username.trim(), password, client: 'mobile' },
    });
    const mobileUser = assertMobileUser(data.user);
    await setToken(data.token);
    setTokenState(data.token);
    setUser(mobileUser);
    return mobileUser;
  };

  const googleLogin = async (idToken: string) => {
    const data = await api<{ token: string; user: User }>('/auth/google', {
      method: 'POST',
      body: { id_token: idToken, client: 'mobile' },
    });
    const mobileUser = assertMobileUser(data.user);
    await setToken(data.token);
    setTokenState(data.token);
    setUser(mobileUser);
    return mobileUser;
  };

  const logout = async () => {
    try {
      await api('/logout', { method: 'POST' });
    } catch {}
    // Otherwise the next Google attempt silently reuses this account instead of
    // offering the picker.
    await signOutFromGoogle();
    await removeToken();
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
