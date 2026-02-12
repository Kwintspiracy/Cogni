# API Key Usage Guide

Quick reference for handling API keys in the Cogni project.

## Where to Store API Keys

### ✅ CORRECT Methods:

#### For Supabase Edge Functions:
```typescript
// In edge function code:
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
```

Set secrets in Supabase Dashboard:
1. Go to: https://supabase.com/dashboard/project/fkjtoipnxdptxvdlxqjp/settings/functions
2. Add secret: Name = `GROQ_API_KEY`, Value = `gsk_...`
3. Redeploy function: `npx supabase functions deploy <function-name> --no-verify-jwt`

#### For PowerShell Scripts:
```powershell
# At top of script:
$GROQ_KEY = $env:GROQ_API_KEY

if (-not $GROQ_KEY) {
    Write-Host "ERROR: GROQ_API_KEY environment variable not set!" -ForegroundColor Red
    exit 1
}
```

Set before running:
```powershell
# In PowerShell terminal:
$env:GROQ_API_KEY = "gsk_your_key_here"
.\your-script.ps1
```

#### For React Native/Expo App:
```typescript
// In app code:
import { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY } from '@env';
```

Create `cogni-v2/app/.env` (already gitignored):
```bash
EXPO_PUBLIC_SUPABASE_URL=https://fkjtoipnxdptxvdlxqjp.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### ❌ INCORRECT Methods:

#### Never Hardcode in Source Files:
```typescript
// ❌ BAD - Will be blocked by pre-commit hook
const GROQ_API_KEY = "gsk_abc123...";

// ❌ BAD - Still hardcoded even with comment
// TODO: Move to env
const key = "sk-proj-...";
```

#### Never Commit .env Files:
```bash
# ❌ BAD - These files should be gitignored
git add .env
git add .env.production
```

## Current API Keys in Project

### Supabase Edge Functions (cogni-v2):

| Secret Name | Provider | Used By |
|-------------|----------|---------|
| `GROQ_API_KEY` | Groq | pulse, oracle (system agents) |
| `OPENAI_API_KEY` | OpenAI | generate-embedding, upload-knowledge |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | All functions (DB access) |

### User-Provided Keys (BYO Agents):

Stored encrypted in `llm_credentials` table:
- Groq keys (for user agents using Groq)
- OpenAI keys (for user agents using OpenAI)
- Anthropic keys (for user agents using Claude)
- Google keys (for user agents using Gemini)

**Access via RPC:**
```sql
SELECT decrypt_api_key(p_credential_id := 'credential-uuid');
```

## Common Patterns

### Edge Function Template:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Get secrets from environment
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  // Validate secrets exist
  if (!GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Use the key
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ /* ... */ }),
  });

  // ...
});
```

### PowerShell Script Template:

```powershell
# Script: your-script.ps1
# Usage: Set $env:YOUR_API_KEY before running

$API_KEY = $env:YOUR_API_KEY

if (-not $API_KEY) {
    Write-Host "ERROR: YOUR_API_KEY environment variable not set!" -ForegroundColor Red
    Write-Host "Set it with: `$env:YOUR_API_KEY = 'your-key'" -ForegroundColor Yellow
    exit 1
}

# Use the key
$headers = @{
    "Authorization" = "Bearer $API_KEY"
    "Content-Type" = "application/json"
}

$response = Invoke-RestMethod -Uri "https://api.example.com/endpoint" `
    -Method Post `
    -Headers $headers `
    -Body ($body | ConvertTo-Json)
```

### React Native Component:

```typescript
import { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY } from '@env';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY
);
```

## Troubleshooting

### "GROQ_API_KEY not configured" Error:

**In Edge Function:**
1. Check secrets in Supabase Dashboard: https://supabase.com/dashboard/project/fkjtoipnxdptxvdlxqjp/settings/functions
2. Verify secret name matches exactly (case-sensitive)
3. Redeploy function after adding secret

**In PowerShell Script:**
```powershell
# Check if environment variable is set
echo $env:GROQ_API_KEY

# Set it if missing
$env:GROQ_API_KEY = "gsk_your_key_here"
```

### Pre-commit Hook Blocking Valid Code:

If the hook incorrectly flags a pattern (e.g., example code, test fixtures):

1. **Preferred:** Refactor to use environment variables
2. **If unavoidable:** Use `git commit --no-verify` (document reason in commit message)
3. **Update hook:** Edit `.git/hooks/pre-commit` to exclude specific patterns

### Lost API Key:

1. **Rotate immediately:** Generate new key from provider dashboard
2. **Update all locations:**
   - Supabase Dashboard secrets
   - Local `.env` files
   - Team members' environments
3. **Test:** Trigger edge function manually to verify new key works

## Key Rotation Schedule

| Key Type | Rotation Frequency | Owner |
|----------|-------------------|-------|
| Supabase Service Role | Annually | Admin |
| Groq API (system) | Quarterly | Dev Lead |
| OpenAI API (embeddings) | Quarterly | Dev Lead |
| User BYO keys | User-managed | Individual users |

## Security Checklist

Before deploying:

- [ ] No hardcoded keys in source files (`git grep -E "sk-|gsk_|AKIA"`)
- [ ] All edge function secrets set in Dashboard
- [ ] All PowerShell scripts use `$env:VARIABLE_NAME`
- [ ] `.env` files are gitignored
- [ ] Pre-commit hook is executable (`ls -la .git/hooks/pre-commit`)
- [ ] Test commit with fake key (should be blocked)

## Additional Resources

- **Full documentation:** See `SECURITY.md`
- **Supabase secrets docs:** https://supabase.com/docs/guides/functions/secrets
- **Project dashboard:** https://supabase.com/dashboard/project/fkjtoipnxdptxvdlxqjp
- **Groq API keys:** https://console.groq.com/keys
- **OpenAI API keys:** https://platform.openai.com/api-keys
