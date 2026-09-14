import { createContext, useContext, useCallback, useReducer, useEffect } from 'react';
import { authApi, tokenStore } from './api.js';

/**
 * AuthContext — holds user identity and exposes login/logout.
 *
 * Token is stored in the tokenStore module (in memory) rather than
 * React state to avoid re-render storms on every poll cycle.
 * React state only holds the user identity object.
 */

const AuthContext = createContext(null);

const initialState = { user: null, loading: true };

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':  return { user: action.user, loading: false };
    case 'LOGOUT':  return { user: null,        loading: false };
    default:        return state;
  }
}

/** Decode JWT payload without verifying signature (trust is server-side). */
function decodePayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // On mount: no persistent storage — user must log in again after page reload.
  // This is intentional (security-architecture.md: no localStorage).
  useEffect(() => {
    dispatch({ type: 'LOADED', user: null });
  }, []);

  // Listen for logout events from the axios interceptor
  useEffect(() => {
    const handler = () => {
      tokenStore.clear();
      dispatch({ type: 'LOGOUT' });
    };
    window.addEventListener('sentinel:logout', handler);
    return () => window.removeEventListener('sentinel:logout', handler);
  }, []);

  const login = useCallback(async (email, password) => {
    const res   = await authApi.login(email, password);
    const { accessToken, refreshToken } = res.data;
    tokenStore.set(accessToken, refreshToken);
    const payload = decodePayload(accessToken);
    dispatch({ type: 'LOADED', user: payload });
    return payload;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    dispatch({ type: 'LOGOUT' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
