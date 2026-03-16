# AuthContext Reference

## Provider Shape

```tsx
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  resetGuestSession: () => Promise<void>;
  isAnonymous: boolean;
}
```

## Session Initialization Flow

```
initSession():
  1. getSession() with 5s timeout
  2. If error with "Refresh Token Not Found" or "Invalid Refresh Token":
     - signOut({ scope: 'local' })
     - deleteRecoveryToken()
     - signInAnonymously() as fallback
  3. If no session and native: try recovery from SecureStore
     - setSession({ refresh_token: recoveryToken, access_token: '' })
  4. If still no session: signInAnonymously()
  5. Save recovery token for anonymous sessions
  6. Link RevenueCat user (fire-and-forget)
```

## Auth State Listener Events

- `TOKEN_REFRESH_NOT_UPDATED` - Force sign out (clear state)
- `PASSWORD_RECOVERY` - Navigate to `/update-password` after 500ms delay
- `SIGNED_IN` (web) - Clear URL hash to prevent stale tokens on reload
- Any event - Update session/user state, sync recovery token, sync RevenueCat

## OAuth Implementation (Google)

```tsx
// Web: Let Supabase handle redirect
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: window.location.origin },
});

// Native: Manual browser + token exchange
const scheme = Constants.expoConfig?.scheme;
const redirectUrl = `${scheme}://google-auth`;
await WebBrowser.dismissAuthSession(); // Clear stale sessions
const { data } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
});
const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
if (result.type === 'success') handleAuthResult(result.url);
```

## OAuth Implementation (Apple)

```tsx
// iOS: Native Apple Authentication
const credential = await AppleAuthentication.signInAsync({
  requestedScopes: [FULL_NAME, EMAIL],
});
await supabase.auth.signInWithIdToken({
  provider: 'apple',
  token: credential.identityToken,
});

// Android/Web: Falls back to OAuth flow (same pattern as Google)
```

## Token Extraction from Redirect URL

```tsx
const handleAuthResult = async (url: string) => {
  // Dedup check with lastAuthUrlRef
  const parsed = Linking.parse(url);
  let params = parsed.queryParams || {};

  // Hash fragment fallback (tokens often come via #)
  if (!params.access_token && url.includes('#')) {
    const fragment = url.split('#')[1];
    const hashParams = new URLSearchParams(fragment);
    params.access_token = hashParams.get('access_token');
    params.refresh_token = hashParams.get('refresh_token');
  }

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
};
```

## Sign Out Flow

```
1. supabase.auth.signOut()
2. Clear session/user state
3. Delete recovery token
4. signInAnonymously() immediately (return to guest state)
5. Save new anonymous recovery token
6. RevenueCat logOut (if was logged in)
```

## isAnonymous Detection

```tsx
const isAnonymous = !!(
  user?.is_anonymous ||
  user?.app_metadata?.provider === 'anonymous' ||
  (user && !user.email)
);
```

## Recovery Token Strategy

- Anonymous sessions: save refresh_token to SecureStore
- Real accounts: delete recovery token (don't mix account types)
- On token refresh events: update stored token
- On sign out: delete token, then save new anonymous token

## Redirect Routes

### google-auth.tsx
- Android: `router.back()` via useEffect (prevents route stacking)
- iOS/Web: `<Redirect href="/" />`

### auth-callback.tsx
- Shows "Verifying..." spinner
- Redirects to `/` after 1500ms (auth listener processes URL in background)
