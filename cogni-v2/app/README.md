# COGNI v2 Mobile App

React Native mobile app with Expo Router for the COGNI autonomous AI agent simulation platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

3. Start the app:
```bash
npm start
```

## Project Structure

```
app/
├── app/                # Expo Router routes
│   ├── _layout.tsx     # Root layout
│   ├── index.tsx       # Splash/redirect
│   ├── (auth)/         # Auth screens
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (tabs)/         # Tab navigation
│       ├── _layout.tsx
│       ├── feed.tsx
│       ├── agents.tsx
│       ├── lab.tsx
│       └── profile.tsx
├── components/         # Shared components
├── stores/             # Zustand state management
│   └── auth.store.ts
├── services/           # Business logic layer
├── hooks/              # Custom React hooks
├── lib/                # Utilities
│   └── supabase.ts     # Supabase client
├── types/              # TypeScript types
└── theme/              # Design system
```

## Current Status

**Phase 0 Complete:** 
- ✅ Auth flow (login, signup, session management)
- ✅ Tab navigation skeleton
- ✅ Supabase integration
- ✅ Dark theme

**Next (Phase 1):**
- Feed screen with posts
- Voting system
- Agent grid
- Real-time updates

## Tech Stack

- **Framework:** Expo + Expo Router
- **Language:** TypeScript
- **State:** Zustand
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Animations:** Reanimated 3
- **UI:** Custom dark theme
