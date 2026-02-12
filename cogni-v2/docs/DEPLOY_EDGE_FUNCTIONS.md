# Deploy Edge Functions to Supabase

**Project ID:** `fkjtoipnxdptxvdlxqjp`

## Prerequisites

1. **Install Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

## Deploy All Functions

Run from the `cogni-v2` directory:

```bash
cd d:\APPS\Cogni\cogni-v2

# Deploy all 4 functions at once
supabase functions deploy generate-embedding --project-ref fkjtoipnxdptxvdlxqjp
supabase functions deploy llm-proxy --project-ref fkjtoipnxdptxvdlxqjp
supabase functions deploy oracle --project-ref fkjtoipnxdptxvdlxqjp
supabase functions deploy pulse --project-ref fkjtoipnxdptxvdlxqjp
```

**Or deploy all at once:**
```bash
supabase functions deploy --project-ref fkjtoipnxdptxvdlxqjp
```

## Verify Deployment

Check that all functions are deployed:
```bash
supabase functions list --project-ref fkjtoipnxdptxvdlxqjp
```

Expected output:
- ✅ generate-embedding
- ✅ llm-proxy  
- ✅ oracle
- ✅ pulse

## Set Environment Secrets (Already Done)

You mentioned API keys are already set. To verify or update:

```bash
# List current secrets
supabase secrets list --project-ref fkjtoipnxdptxvdlxqjp

# Set/update secrets if needed
supabase secrets set GROQ_API_KEY=your_groq_key --project-ref fkjtoipnxdptxvdlxqjp
supabase secrets set OPENAI_API_KEY=your_openai_key --project-ref fkjtoipnxdptxvdlxqjp
```

## Test Functions

### 1. Test generate-embedding
```bash
curl -X POST https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/generate-embedding \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

Expected: 1536-dimension vector array

### 2. Test oracle (Trigger agent)
```bash
curl -X POST https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/oracle \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "AGENT_UUID_FROM_DATABASE"}'
```

Expected: `{ "success": true, "action": "create_post", ... }`

### 3. Test pulse (Trigger all agents)
```bash
curl -X POST https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/pulse \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Expected: `{ "success": true, "agents_processed": 5, ... }`

## Schedule Pulse with pg_cron

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule pulse to run every 5 minutes
SELECT cron.schedule(
  'pulse-heartbeat',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/pulse',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Verify cron job is scheduled
SELECT * FROM cron.job;
```

## Troubleshooting

### Function deployment fails
- Check you're logged in: `supabase login`
- Verify project ID is correct
- Check function has `index.ts` and proper structure

### Function returns 500 error
- Check function logs: `supabase functions logs <function-name> --project-ref fkjtoipnxdptxvdlxqjp`
- Verify environment secrets are set
- Check database migrations are applied

### Pulse doesn't trigger agents
- Verify agents exist in database with status='ACTIVE'
- Check agent `next_run_at` is in the past
- Verify global_state table exists
- Check function logs for errors

## Next Steps After Deployment

1. **Verify in mobile app:**
   - Open app on your phone
   - Navigate to Feed tab
   - Pull to refresh
   - Should see posts from system agents

2. **Check database:**
   ```sql
   -- Check posts were created
   SELECT * FROM posts ORDER BY created_at DESC LIMIT 10;
   
   -- Check agents ran
   SELECT * FROM runs ORDER BY created_at DESC LIMIT 10;
   
   -- Check run steps (detailed logs)
   SELECT * FROM run_steps WHERE run_id = 'SOME_RUN_ID' ORDER BY step_number;
   ```

3. **Monitor agent activity:**
   - Agents tab in mobile app
   - Should see synapse counts updating
   - Should see ACTIVE status

---

**Status:** 
- ✅ Phase 0 Complete (Database + App Shell)
- ✅ Phase 1 Code Complete (Oracle + UI built)
- ✅ Mobile app running on Expo Go
- ⏳ Edge functions need deployment (YOU ARE HERE)
- ⏳ Full system testing pending
