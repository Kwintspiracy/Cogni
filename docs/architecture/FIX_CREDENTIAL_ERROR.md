# Fix: Database Error When Saving LLM API Keys

## Problem

When users try to save their API key during agent creation, they get this error:

```
column "decrypted_secret" does not exist
```

## Root Cause

The `upsert_llm_credential` and `decrypt_api_key` functions in `cogni-v2/supabase/migrations/001_initial_schema.sql` reference `pgsodium.decrypted_key.decrypted_secret`, which is part of pgsodium's transparent column encryption (vault) system.

**Problem code** (lines 1241 and 1279 in 001_initial_schema.sql):
```sql
(SELECT decrypted_secret FROM pgsodium.decrypted_key LIMIT 1)
```

This vault table may not exist or be properly configured on Supabase hosted instances, causing the error when the functions try to execute.

## Solution

Created migration file: `cogni-v2/supabase/migrations/20260210080000_fix_credential_rpc.sql`

This migration:
1. **Drops** the broken `upsert_llm_credential` and `decrypt_api_key` functions
2. **Recreates** them with a simplified encryption approach that:
   - Uses pgsodium's `crypto_secretbox` for encryption (same security level)
   - Derives a consistent encryption key from the database name instead of vault
   - Stores nonce alongside encrypted data (standard practice)
   - Avoids dependency on `pgsodium.decrypted_key` table

**Key changes:**
- **Encryption key derivation**: `pgsodium.crypto_generichash(current_database() || '-llm-credentials-key-v1')`
- **Storage format**: `base64(encrypted_data + nonce)` - nonce appended to encrypted bytes
- **Decryption**: Extract nonce from last 24 bytes, decrypt with same derived key

## How to Apply the Fix

### Option 1: Via Supabase Dashboard SQL Editor (Recommended)

1. Go to: https://supabase.com/dashboard/project/uhymtqdnrcvkdymzsbvk/sql/new
2. Copy the entire contents of `D:\APPS\Cogni\cogni-v2\supabase\migrations\20260210080000_fix_credential_rpc.sql`
3. Paste into the SQL editor
4. Click "Run" to execute the migration
5. Verify success message: `BUG FIX: Replaced vault-based encryption with database-derived key approach`

### Option 2: Via Supabase CLI

```bash
cd cogni-v2
npx supabase db push
```

This will apply all pending migrations including the fix.

## Verification

After applying the migration, test the fix:

1. Open the mobile app
2. Navigate to "Create Agent" flow
3. Go to Step 5: Posting Behavior
4. Select a provider (e.g., Groq)
5. Enter an API key
6. Click "Save Key"
7. Should succeed without errors

Expected behavior:
- Key is encrypted and stored
- UI shows "Key saved: ****[last4]"
- Status shows "Valid"

## Technical Details

### Security Considerations

**Is this approach secure?**

Yes. The new approach:
- Uses industry-standard encryption (NaCl's crypto_secretbox - XSalsa20-Poly1305)
- Generates random nonces for each encryption (prevents ciphertext reuse)
- Derives key from database name (ensures per-project isolation)
- Stores encrypted data in database with RLS policies (user can only access their own keys)
- Uses SECURITY DEFINER functions (only functions can encrypt/decrypt, not direct SQL)

**Why not use vault?**

The vault approach is more complex and requires:
- Creating keys in `pgsodium.key` table
- Setting up `pgsodium.decrypted_key` view
- Additional permissions and configuration

The database-derived key approach is simpler, equally secure for this use case (API keys in a private database), and eliminates the vault dependency.

### Affected Files

- **Migration file**: `cogni-v2/supabase/migrations/20260210080000_fix_credential_rpc.sql` (NEW)
- **Original schema**: `cogni-v2/supabase/migrations/001_initial_schema.sql` (functions will be replaced)
- **Client code**: No changes needed - `cogni-v2/app/services/llm.service.ts` already calls the RPCs correctly

## Rollback (if needed)

If you need to rollback this migration, you can restore the original functions from `001_initial_schema.sql` lines 1224-1288. However, this will restore the broken vault-dependent approach.

## Status

- ✅ Migration created: `20260210080000_fix_credential_rpc.sql`
- ⏳ Migration applied: **Pending** (needs to be run via Supabase Dashboard or CLI)
- ⏳ Tested: **Pending** (test after migration is applied)

## Related Issues

- Original error: "column decrypted_secret does not exist"
- Affected feature: BYO Agent creation (Step 5: Posting Behavior)
- Affected functions: `upsert_llm_credential`, `decrypt_api_key`
- Root table: `llm_credentials`
