import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  isEmailVerified: boolean;
  isAuthReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapAuthErrorMessage(error: unknown): string | null {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return null;
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Allow popups for this site and click Sign in with Google again.';
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Domain "${host}" is not yet authorized in Firebase Authentication settings.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google Sign-In is currently disabled for this Firebase project.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while contacting Google Sign-In. Check your connection and try again.';
  }
  if (code === 'auth/web-storage-unsupported') {
    return 'Browser storage is restricted in this embedded view. Open the app in a full tab or enable site cookies to sign in.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email using a different sign-in provider.';
  }
  return 'Could not complete Google Sign-In. Please try again.';
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void setPersistence(auth, browserLocalPersistence).catch(() => {
      // Restricted iframe / private browsing contexts may fall back to Firebase default persistence
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setIsAuthReady(true);
      },
      (error) => {
        console.error('Firebase Auth listener error:', error);
        setAuthError('Unable to verify your authentication session right now.');
        setIsAuthReady(true);
      }
    );
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await setPersistence(auth, browserLocalPersistence).catch(() => undefined);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error: unknown) {
      console.error('Google Sign-In failed:', error);
      setAuthError(mapAuthErrorMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (error: unknown) {
      console.error('Google Sign-Out failed:', error);
      setAuthError('Unable to sign out right now.');
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isEmailVerified: Boolean(user?.emailVerified),
        isAuthReady,
        isSigningIn,
        authError,
        signInWithGoogle,
        signOutUser,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside a FirebaseProvider');
  }
  return ctx;
}
