import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Helper to extract and set session from a deep link URL
async function extractSessionFromUrl(url: string): Promise<{ session: Session | null } | null> {
  if (!url.startsWith('cogni://')) return null;

  // Try hash fragment first (standard Supabase implicit grant)
  const hashIndex = url.indexOf('#');
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  if (hashIndex !== -1) {
    const params = new URLSearchParams(url.substring(hashIndex + 1));
    accessToken = params.get('access_token');
    refreshToken = params.get('refresh_token');
  }

  // Fallback: try query parameters (some redirect configs use these)
  if (!accessToken || !refreshToken) {
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(url.substring(queryIndex + 1));
      accessToken = accessToken || params.get('access_token');
      refreshToken = refreshToken || params.get('refresh_token');
    }
  }

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.error('Failed to set session from URL:', error);
      return null;
    }
    return { session: data.session };
  }
  return null;
}

type OAuthBrowserResult =
  | { type: 'success'; url: string }
  | { type: 'dismissed' }
  | { type: 'fallback' };

async function openOAuthBrowser(url: string, redirectUrl: string): Promise<OAuthBrowserResult> {
  try {
    const WebBrowser = require('expo-web-browser');
    // Dismiss any lingering browser session
    WebBrowser.dismissAuthSession();
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
    if (result.type === 'success' && result.url) {
      return { type: 'success', url: result.url };
    }
    // User cancelled or dismissed
    return { type: 'dismissed' };
  } catch (e) {
    console.warn('expo-web-browser not available, falling back to Linking.openURL:', e);
    return { type: 'fallback' };
  }
}

function computeIsAnonymous(user: User | null): boolean {
  if (!user) return false;
  return (
    user.is_anonymous === true ||
    user.app_metadata?.provider === 'anonymous' ||
    !user.email
  );
}

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAnonymous: boolean;
  setSession: (session: Session | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<() => void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  isAnonymous: false,

  setSession: (session) => {
    const user = session?.user || null;
    set({
      session,
      user,
      isAnonymous: computeIsAnonymous(user),
      isLoading: false,
    });
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: computeIsAnonymous(data.user) });
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    set({ session: data.session, user: data.user, isAnonymous: computeIsAnonymous(data.user) });
  },

  signInWithGoogle: async () => {
    try {
      const redirectTo = 'cogni://google-auth';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('No OAuth URL returned');

      const browserResult = await openOAuthBrowser(data.url, redirectTo);

      if (browserResult.type === 'success') {
        // In-app browser returned — extract session directly
        const result = await extractSessionFromUrl(browserResult.url);
        if (result?.session) {
          set({
            session: result.session,
            user: result.session.user || null,
            isAnonymous: computeIsAnonymous(result.session.user || null),
          });
        }
        return;
      }

      if (browserResult.type === 'dismissed') {
        // User cancelled — do nothing
        return;
      }

      // Fallback: open in system browser with event listener
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let sub: { remove: () => void } | null = null;

      const handleRedirect = async (event: { url: string }) => {
        const result = await extractSessionFromUrl(event.url);
        if (result?.session) {
          // Clean up immediately on success
          if (timeoutId !== null) clearTimeout(timeoutId);
          sub?.remove();
          set({
            session: result.session,
            user: result.session.user || null,
            isAnonymous: computeIsAnonymous(result.session.user || null),
          });
        }
      };

      sub = Linking.addEventListener('url', handleRedirect);
      await Linking.openURL(data.url);

      // Clean up listener after 5 minutes regardless
      timeoutId = setTimeout(() => {
        sub?.remove();
      }, 5 * 60 * 1000);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  },

  signInWithApple: async () => {
    try {
      if (Platform.OS === 'ios') {
        let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
        try {
          AppleAuthentication = require('expo-apple-authentication');
        } catch {
          // expo-apple-authentication not installed — fall through to OAuth
        }

        if (AppleAuthentication) {
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });
          if (!credential.identityToken) {
            throw new Error('Apple Sign-In did not return an identity token');
          }
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
          });
          if (error) throw error;
          set({ session: data.session, user: data.user, isAnonymous: computeIsAnonymous(data.user) });
          return;
        }
      }

      // Android / Web — OAuth fallback
      const redirectTo = 'cogni://apple-auth';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No OAuth URL returned');

      const browserResult = await openOAuthBrowser(data.url, redirectTo);

      if (browserResult.type === 'success') {
        const result = await extractSessionFromUrl(browserResult.url);
        if (result?.session) {
          set({
            session: result.session,
            user: result.session.user || null,
            isAnonymous: computeIsAnonymous(result.session.user || null),
          });
        }
        return;
      }

      if (browserResult.type === 'dismissed') {
        return;
      }

      // Fallback: open in system browser with event listener
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let sub: { remove: () => void } | null = null;

      const handleRedirect = async (event: { url: string }) => {
        const result = await extractSessionFromUrl(event.url);
        if (result?.session) {
          // Clean up immediately on success
          if (timeoutId !== null) clearTimeout(timeoutId);
          sub?.remove();
          set({
            session: result.session,
            user: result.session.user || null,
            isAnonymous: computeIsAnonymous(result.session.user || null),
          });
        }
      };

      sub = Linking.addEventListener('url', handleRedirect);
      await Linking.openURL(data.url);

      // Clean up listener after 5 minutes regardless
      timeoutId = setTimeout(() => {
        sub?.remove();
      }, 5 * 60 * 1000);
    } catch (error) {
      console.error('Apple Sign-In Error:', error);
      throw error;
    }
  },

  resendConfirmationEmail: async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  },

  resetPasswordForEmail: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'cogni://reset-callback',
    });
    if (error) throw error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, isAnonymous: false });
  },

  initialize: async () => {
    // Safety timeout — if initialization hangs for any reason, stop loading after 10s
    const safetyTimer = setTimeout(() => {
      set((state) => {
        if (state.isLoading) {
          console.warn('[Auth] Initialize timed out after 10s — forcing isLoading=false');
          return { isLoading: false };
        }
        return {};
      });
    }, 10000);

    try {
      // Check if app was opened via a deep link with OAuth tokens (cold start)
      let initialUrl: string | null = null;
      try {
        initialUrl = await Linking.getInitialURL();
      } catch (e) {
        console.warn('[Auth] Linking.getInitialURL failed:', e);
      }

      if (initialUrl) {
        const result = await extractSessionFromUrl(initialUrl);
        if (result?.session) {
          const user = result.session.user || null;
          clearTimeout(safetyTimer);
          set({
            session: result.session,
            user,
            isAnonymous: computeIsAnonymous(user),
            isLoading: false,
          });
          const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            const u = session?.user || null;
            set({ session, user: u, isAnonymous: computeIsAnonymous(u), isLoading: false });
          });
          const deepLinkSub = Linking.addEventListener('url', async (event) => {
            const r = await extractSessionFromUrl(event.url);
            if (r?.session) {
              const u = r.session.user || null;
              set({ session: r.session, user: u, isAnonymous: computeIsAnonymous(u), isLoading: false });
            }
          });
          return () => {
            authListener.subscription.unsubscribe();
            deepLinkSub.remove();
          };
        }
      }

      // No OAuth URL — check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user || null;
      clearTimeout(safetyTimer);
      set({ session, user, isAnonymous: computeIsAnonymous(user), isLoading: false });

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user || null;
        set({ session, user: u, isAnonymous: computeIsAnonymous(u), isLoading: false });
      });
      const deepLinkSub = Linking.addEventListener('url', async (event) => {
        const result = await extractSessionFromUrl(event.url);
        if (result?.session) {
          const u = result.session.user || null;
          set({ session: result.session, user: u, isAnonymous: computeIsAnonymous(u), isLoading: false });
        }
      });
      return () => {
        authListener.subscription.unsubscribe();
        deepLinkSub.remove();
      };
    } catch (error) {
      console.error('[Auth] Initialize failed:', error);
      clearTimeout(safetyTimer);
      set({ isLoading: false });
      return () => {};
    }
  },
}));
