# Security: API Key Protection

This document describes the three-layer defense system implemented to prevent API key leaks in the Cogni repository.

## Layer 1: Root .gitignore

**File:** `D:\APPS\Cogni\.gitignore`

Prevents sensitive files from being tracked by git:

- **Environment files:** `.env`, `.env.*`, `*.env` (with exception for `.env.example`)
- **Credentials:** `**/secrets/`, `**/credentials/`, `*.pem`, `*.key`, `*.cert`
- **Supabase local:** `**/supabase/.temp/`, `**/supabase/.branches/`
- **Development scripts:** PowerShell test/debug/check scripts (often contain hardcoded values during development)
- **Standard exclusions:** `node_modules/`, `.vscode/`, `.DS_Store`, `Thumbs.db`, `nul`

**Usage:**
Files matching these patterns will never appear in `git status` and cannot be accidentally committed.

## Layer 2: Pre-commit Hook

**File:** `D:\APPS\Cogni\.git\hooks\pre-commit` (executable)

Scans all staged files for common API key patterns before allowing a commit:

### Detected Patterns:

| Pattern | Description |
|---------|-------------|
| `sk-proj-[a-zA-Z0-9_-]{100,}` | OpenAI project keys |
| `sk-[a-zA-Z0-9]{20,}` | OpenAI API keys |
| `gsk_[a-zA-Z0-9]{20,}` | Groq API keys |
| `AKIA[0-9A-Z]{16}` | AWS access keys |
| `ghp_[a-zA-Z0-9]{36}` | GitHub personal access tokens |
| `xoxb-`, `xoxp-` | Slack tokens |
| `AIza[0-9A-Za-z_-]{35}` | Google API keys |

### Behavior:

- **Scans only staged files** (not the entire repository)
- **Skips safe locations:** `node_modules/`, `.env` files, binary files
- **Blocks commit** if secrets are detected, showing:
  - File path and line number
  - Masked version of the secret
- **Can be bypassed** with `git commit --no-verify` (not recommended)

### Testing:

```bash
# Create test file with fake key
echo 'const key = "sk-proj-AAAAA..."' > test.ts

# Try to commit (will be blocked)
git add test.ts
git commit -m "Test"

# Expected output: "COMMIT BLOCKED: Secrets detected!"
```

## Layer 3: Code Remediation

### Fixed Files:

#### 1. `cogni-core/supabase/functions/generate-embedding/index.ts`

**Before:**
```typescript
// TEMPORARY: Hardcoded for debugging
const OPENAI_API_KEY = "sk-proj-ZjTOsgWhSoHy1dvO6tCjRhMLh...";
```

**After:**
```typescript
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
```

**Deployment:** Ensure the `OPENAI_API_KEY` secret is set in Supabase Dashboard under Edge Functions → Secrets.

#### 2. `cogni-core/test-openai-direct.ps1`

**Before:**
```powershell
# REPLACE THIS with your actual OpenAI key
$OPENAI_KEY = "sk-proj-ZjTOsgWhSoHy1dvO6tCjRhMLh..."
```

**After:**
```powershell
# Set your OpenAI key as environment variable: $env:OPENAI_API_KEY = "your-key"
$OPENAI_KEY = $env:OPENAI_API_KEY

if (-not $OPENAI_KEY) {
    Write-Host "ERROR: OPENAI_API_KEY environment variable not set!" -ForegroundColor Red
    Write-Host "Set it with: `$env:OPENAI_API_KEY = 'your-key'" -ForegroundColor Yellow
    exit 1
}
```

**Usage:**
```powershell
# Set environment variable before running
$env:OPENAI_API_KEY = "your-key"
.\test-openai-direct.ps1
```

## Best Practices

### For Developers:

1. **Never hardcode secrets** in source files
2. **Use environment variables** (`.env` files for local, Supabase Dashboard for edge functions)
3. **Test the pre-commit hook** periodically to ensure it's working
4. **Review git status** before committing to catch any newly created files with secrets

### For Edge Functions:

All Supabase Edge Functions require secrets to be set in the Dashboard:

```bash
# Secrets required for cogni-v2 edge functions:
- GROQ_API_KEY          # For LLM inference (system agents)
- OPENAI_API_KEY        # For embeddings and BYO agents
- SUPABASE_SERVICE_ROLE_KEY  # For database operations
```

**Setting secrets:**
1. Go to: https://supabase.com/dashboard/project/fkjtoipnxdptxvdlxqjp/settings/functions
2. Click "Add Secret"
3. Enter name and value
4. Redeploy affected functions

### For Local Development:

Create `cogni-v2/app/.env` (already gitignored):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://fkjtoipnxdptxvdlxqjp.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Never commit .env files!** The `.gitignore` rules protect against this.

## Verification

### Test Layer 1 (.gitignore):

```bash
# Create test .env file
echo "SECRET_KEY=test" > .env.test

# Verify it's ignored
git status  # Should NOT show .env.test
```

### Test Layer 2 (pre-commit hook):

```bash
# Create file with fake key
echo 'const key = "sk-proj-AAAA..."' > test.ts

# Try to commit
git add test.ts
git commit -m "Test"

# Expected: "COMMIT BLOCKED: Secrets detected!"
```

### Test Layer 3 (code fixes):

```bash
# Verify no hardcoded keys in generate-embedding
grep -n "sk-proj-" cogni-core/supabase/functions/generate-embedding/index.ts
# Expected: No results

# Verify no hardcoded keys in test script
grep -n "sk-proj-" cogni-core/test-openai-direct.ps1
# Expected: No results
```

## Incident Response

If a secret is accidentally committed:

1. **Rotate the compromised key immediately** (create new key, revoke old one)
2. **Remove from git history:**
   ```bash
   # Use git filter-branch or BFG Repo-Cleaner
   # See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
   ```
3. **Force push** to overwrite remote history (coordinate with team)
4. **Update environment** with new key

## Maintenance

- **Review .gitignore** quarterly to add new patterns
- **Update pre-commit hook** if new API key formats emerge
- **Audit codebase** periodically with: `git grep -E "sk-|gsk_|AKIA"`

## Additional Resources

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [git-secrets tool](https://github.com/awslabs/git-secrets) (alternative/additional protection)
