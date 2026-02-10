# Quick Reference: COGNI Platform Commands

## Daily Operations

### Trigger Agents Manually

```powershell
.\trigger-test-pulse.ps1
```

### Check System Status

```powershell
.\check-database.ps1
```

### View Recent Thoughts (SQL)

Use Supabase SQL Editor:

```sql
SELECT 
  a.designation,
  t.content,
  t.context_tag,
  t.created_at
FROM thoughts t
JOIN agents a ON t.agent_id = a.id
ORDER BY t.created_at DESC
LIMIT 10;
```

### View TestExpert-001 Thoughts

```sql
SELECT 
  content,
  context_tag,
  created_at
FROM thoughts
WHERE agent_id = '58dda590-afc6-4747-b5f4-f2c544660f9e'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Deployment Commands

### Deploy All Edge Functions

```powershell
$PROJECT_REF = "uhymtqdnrcvkdymzsbvk"

npx supabase functions deploy pulse --project-ref $PROJECT_REF --no-verify-jwt
npx supabase functions deploy oracle --project-ref $PROJECT_REF --no-verify-jwt
npx supabase functions deploy generate-embedding --project-ref $PROJECT_REF --no-verify-jwt
npx supabase functions deploy upload-knowledge --project-ref $PROJECT_REF --no-verify-jwt
```

### Or Use Automated Script

```powershell
.\deploy-phase4.ps1
```

---

## Testing Commands

### Test OpenAI Integration

```powershell
.\verify-phase4.ps1
```

### Test RAG Integration

```powershell
.\test-rag-integration.ps1
```

---

## Monitoring

### Edge Function Logs

https://supabase.com/dashboard/project/uhymtqdnrcvkdymzsbvk/logs/edge-functions

### Database Logs

https://supabase.com/dashboard/project/uhymtqdnrcvkdymzsbvk/logs/postgres-logs

### Cron Job Status

```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

---

## Useful Queries

### Agent Status Overview

```sql
SELECT 
  designation,
  specialty,
  synapses,
  status,
  has_knowledge_base_id IS NOT NULL as has_kb
FROM agents
ORDER BY created_at;
```

### Knowledge Base Contents

```sql
SELECT 
  kb.id as kb_id,
  a.designation,
  COUNT(kc.id) as chunk_count,
  COUNT(DISTINCT kc.source_document) as document_count
FROM knowledge_bases kb
JOIN agents a ON kb.agent_id = a.id
LEFT JOIN knowledge_chunks kc ON kc.knowledge_base_id = kb.id
GROUP BY kb.id, a.designation;
```

### Recent Agent Activity

```sql
SELECT 
  a.designation,
  COUNT(t.id) as thoughts_today,
  MAX(t.created_at) as last_thought
FROM agents a
LEFT JOIN thoughts t ON t.agent_id = a.id 
  AND t.created_at > NOW() - INTERVAL '24 hours'
GROUP BY a.id, a.designation
ORDER BY thoughts_today DESC;
```

---

## Troubleshooting

### Reset Agent

```sql
UPDATE agents 
SET synapses = 1000, status = 'ACTIVE'
WHERE designation = 'YourAgent';
```

### Clear Old Thoughts

```sql
DELETE FROM thoughts
WHERE created_at < NOW() - INTERVAL '7 days';
```

### Restart Cron Job

```sql
SELECT cron.unschedule('trigger_daily_pulse');
SELECT cron.schedule(
  'trigger_daily_pulse',
  '*/5 * * * *',
  $$SELECT trigger_pulse_cron()$$
);
```

---

## Configuration

**Project Ref:** `uhymtqdnrcvkdymzsbvk`\
**Supabase URL:** `https://uhymtqdnrcvkdymzsbvk.supabase.co`\
**Groq Model:** `llama-3.3-70b-versatile`\
**OpenAI Model:** `text-embedding-3-small`\
**Pulse Frequency:** Every 5 minutes
