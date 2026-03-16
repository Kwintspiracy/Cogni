---
name: auth-screens
description: Generate a complete sign-in/sign-up authentication flow with email+password, Google OAuth, and Apple Sign-In for React Native (Expo) apps using Supabase Auth.
disable-model-invocation: true
argument-hint: "[app-name]"
---

# Auth Screens Skill

Generate a production-ready authentication flow for a React Native (Expo) app with Supabase Auth.
The flow includes: Sign In, Sign Up, OAuth redirect handlers, AuthContext, and supporting utilities.

Use `$ARGUMENTS` as the app name if provided, otherwise ask the user.

## Architecture Overview

The auth system consists of these files:

| File | Purpose |
|------|---------|
| `app/signin.tsx` | Sign-in screen (email/password + Google + Apple buttons) |
| `app/signup.tsx` | Sign-up screen (email + password + confirm password) |
| `app/google-auth.tsx` | OAuth redirect handler for Google (Android workaround) |
| `app/auth-callback.tsx` | Deep link callback handler for email confirmation / password reset |
| `src/context/AuthContext.tsx` | Central auth state, all sign-in/out methods, session recovery, RevenueCat sync |
| `src/services/storageService.ts` | Secure token storage (SecureStore on native, sessionStorage on web) |
| `src/components/AppModal.tsx` | Reusable modal for auth errors/confirmations |
| `src/components/Icons.tsx` | EyeIcon / EyeSlashIcon for password visibility toggle |
| `src/theme/` | Design tokens (colors, typography, spacing) |

## Dependencies

```json
{
  "@supabase/supabase-js": "^2.x",
  "expo-router": "^4.x",
  "expo-linking": "*",
  "expo-web-browser": "*",
  "expo-auth-session": "*",
  "expo-apple-authentication": "*",
  "expo-secure-store": "*",
  "@react-native-async-storage/async-storage": "*",
  "react-native-safe-area-context": "*",
  "react-native-svg": "*",
  "react-native-purchases": "*"
}
```

## Detailed Reference

For the exact implementation of each file, see the reference files in this skill directory:

- [signin-screen.md](signin-screen.md) - Sign In screen with full styles
- [signup-screen.md](signup-screen.md) - Sign Up screen with full styles
- [auth-context.md](auth-context.md) - AuthContext provider (all auth logic)
- [design-tokens.md](design-tokens.md) - Color palette, typography, and component styles

## Key Patterns

### 1. Session Initialization (AuthContext)
```
1. Try getSession() with 5s timeout
2. If no session, try recovery from Keychain (SecureStore)
3. If still no session, signInAnonymously() (guest flow)
4. If refresh token is invalid, clear session + sign in anonymously
```

### 2. OAuth Flow (Native)
```
1. Get app scheme from expo config
2. Call supabase.auth.signInWithOAuth({ skipBrowserRedirect: true })
3. Open browser with WebBrowser.openAuthSessionAsync()
4. Parse tokens from redirect URL (hash fragment or query params)
5. Call supabase.auth.setSession() with extracted tokens
```

### 3. OAuth Flow (Web)
```
1. Call supabase.auth.signInWithOAuth() (no skipBrowserRedirect)
2. Supabase handles redirect automatically
3. On SIGNED_IN event, clear URL hash to prevent stale token errors on reload
```

### 4. Apple Sign-In (iOS Native)
```
1. Use expo-apple-authentication for native credential
2. Pass identityToken to supabase.auth.signInWithIdToken()
3. Falls back to OAuth flow on Android/Web
```

### 5. Sign Out -> Re-Anonymous
```
1. supabase.auth.signOut()
2. Clear local state + delete recovery token
3. Immediately signInAnonymously() to create fresh guest session
4. Log out of RevenueCat if was logged in
```

### 6. Deep Link Routes
- `{scheme}://google-auth` - Google OAuth redirect (Android back-nav workaround)
- `{scheme}://auth-callback` - Email confirmation / sign-up verification
- `{scheme}://reset-callback` - Password reset flow

### 7. Secure Storage Strategy
- **Native**: `expo-secure-store` (OS Keychain/Keystore, survives iOS uninstalls)
- **Web**: `sessionStorage` for tokens (cleared on tab close, limits XSS exposure)
- **Web**: `localStorage` for non-sensitive data (gallery index, onboarding state)

## UI Design Specifications

### Sign In Screen Layout
```
SafeAreaView (dark bg #2C2F3A)
├── Back Button (top-left, blue accent)
├── KeyboardAvoidingView
│   └── ScrollView
│       ├── Main Content (centered, px=40)
│       │   ├── Header ("Sign in" h1 + subtitle)
│       │   ├── Form
│       │   │   ├── Email Input (border 2px, rounded 6)
│       │   │   ├── Password Input (with eye toggle)
│       │   │   ├── Error Text (red, with resend link if email unconfirmed)
│       │   │   └── Sign In Button (blue #2C59FF, h=48)
│       │   ├── "Alternatively" divider text
│       │   └── Social Buttons
│       │       ├── Google (white bg, multicolor G icon)
│       │       └── Apple (dark bg #1D1D1D, white Apple icon)
│       └── Bottom Section (px=40, pb=40)
│           ├── Create Account Button (dark bg, h=48)
│           └── Forgot Password (small pill button)
└── AppModal (for confirmations/errors)
```

### Sign Up Screen Layout
```
SafeAreaView (dark bg)
├── Header Bar (back chevron + "Back" text)
├── KeyboardAvoidingView
│   └── ScrollView
│       └── Main Content (centered, px=40, pt=110)
│           ├── Header ("Create Account" h1 + subtitle)
│           └── Form
│               ├── Email Input
│               ├── Password Input (with eye toggle)
│               ├── Confirm Password Input (with eye toggle)
│               ├── Error Text
│               └── Sign Up Button (blue, h=48)
└── AppModal
```

### Style Constants
- **Border radius**: 6px for inputs/buttons, 32px for modals
- **Input border**: 2px, rgba(255,255,255,0.05)
- **Font**: SF Pro Display (iOS) / Roboto (Android)
- **Letter spacing**: -0.41px throughout
- **Button height**: 48px
- **Horizontal padding**: 40px (main content areas)
- **Gap**: 8px (inputs), 16px (form groups), 24px (sections), 32px (main areas)

## Implementation Checklist

When generating for a new project:

1. [ ] Set up Supabase project with Google + Apple OAuth providers
2. [ ] Configure app scheme in `app.json` for deep linking
3. [ ] Add redirect URLs in Supabase dashboard (e.g., `myapp://google-auth`, `myapp://auth-callback`)
4. [ ] Install all dependencies listed above
5. [ ] Create theme/design tokens (adapt colors to target app)
6. [ ] Create `storageService.ts` with secure token storage
7. [ ] Create `AuthContext.tsx` with full session lifecycle
8. [ ] Create `signin.tsx` screen
9. [ ] Create `signup.tsx` screen
10. [ ] Create `google-auth.tsx` and `auth-callback.tsx` redirect routes
11. [ ] Create `AppModal.tsx` component
12. [ ] Add EyeIcon/EyeSlashIcon SVG components
13. [ ] Wire AuthProvider into app root layout
14. [ ] Test: email sign-up + confirmation flow
15. [ ] Test: Google OAuth on iOS, Android, Web
16. [ ] Test: Apple Sign-In on iOS (native) + Android/Web (OAuth fallback)
17. [ ] Test: session recovery after app restart
18. [ ] Test: invalid refresh token recovery (falls back to anonymous)
