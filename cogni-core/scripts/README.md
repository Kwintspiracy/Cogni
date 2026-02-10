# MemoryBank Utility Scripts

This directory contains SQL scripts for managing and monitoring the COGNI MemoryBank system.

## 📋 Available Scripts

### 1. `verify-memory-system.sql`
**Purpose:** Verify that all MemoryBank components are properly installed and configured.

**Usage:**
```bash
# Using psql (local)
psql -U postgres -d cogni -f verify-memory-system.sql

# Using Supabase CLI
supabase db execute --file scripts/verify-memory-system.sql
```

**What it checks:**
- ✅ pgvector extension installation
- ✅ agent_memory table existence
- ✅ Indexes (IVFFlat vector index, composite indexes)
- ✅ All 6 memory RPC functions
- ✅ System statistics
- ✅ BUG-06 detection (agents without memories)

**Expected Output:**
- All functions should show ✅ status
- At least 2 indexes should exist
- No critical errors

---

### 2. `test-memory-functions.sql`
**Purpose:** Test all memory functions with sample data to ensure they work correctly.

**Usage:**
```bash
# Using psql (local)
psql -U postgres -d cogni -f test-memory-functions.sql

# Using Supabase CLI
supabase db execute --file scripts/test-memory-functions.sql
```

**What it tests:**
- `store_memory()` - Creates test memories of different types
- `get_agent_memory_stats()` - Retrieves statistics
- `recall_memories()` - Tests vector similarity search
- `get_thread_memories()` - Tests thread-specific recall
- `consolidate_memories()` - Tests consolidation logic

**Notes:**
- Requires at least one ACTIVE agent
- Creates and cleans up test data automatically
- Non-destructive (only uses test-tagged memories)

---

### 3. `memory-dashboard.sql`
**Purpose:** Comprehensive analytics dashboard for MemoryBank system monitoring.

**Usage:**
```bash
# Using psql (local)
psql -U postgres -d cogni -f memory-dashboard.sql

# Using Supabase CLI
supabase db execute --file scripts/memory-dashboard.sql
```

**Reports Included:**
- 📊 System Overview (coverage, total memories, embeddings)
- 📈 Memory Growth (last 7 days)
- 🎯 Memory Types Distribution (with visual bars)
- 🏆 Top Agents by Memory Count
- ⚠️ Active Agents Without Memories (BUG-06 detection)
- 💎 Memory Quality Metrics
- 🧵 Threads with Most Memories
- 🕐 Recent Memory Activity
- 💾 Storage Analysis
- 🏥 System Health Indicators

**Best for:**
- Daily monitoring
- Identifying BUG-06 affected agents
- Capacity planning
- Quality assurance

---

## 🚀 Quick Start

### First Time Setup
1. Verify system installation:
   ```bash
   supabase db execute --file scripts/verify-memory-system.sql
   ```

2. Run function tests:
   ```bash
   supabase db execute --file scripts/test-memory-functions.sql
   ```

3. Check current status:
   ```bash
   supabase db execute --file scripts/memory-dashboard.sql
   ```

### Daily Monitoring
```bash
# Quick health check
supabase db execute --file scripts/memory-dashboard.sql | grep "HEALTH INDICATORS" -A 10
```

### Troubleshooting BUG-06
If agents aren't storing memories:

1. Run verification:
   ```bash
   supabase db execute --file scripts/verify-memory-system.sql
   ```

2. Check for affected agents:
   ```bash
   supabase db execute --file scripts/memory-dashboard.sql | grep "WITHOUT MEMORIES" -A 20
   ```

3. Review oracle-user implementation (see `.clinerules/workflows/MemoryBank.md`)

---

## 🔧 Manual Queries

### Check specific agent's memories
```sql
SELECT * FROM get_agent_memory_stats('agent-uuid-here');
```

### Recall memories for debugging
```sql
-- First, get an embedding (use generate-embedding function)
SELECT * FROM recall_memories(
  'agent-uuid-here',
  '[your-1536-dimension-vector]'::vector(1536),
  NULL,  -- thread_id (optional)
  10,    -- limit
  0.6    -- similarity threshold
);
```

### Find memory gaps
```sql
SELECT 
  a.designation,
  COUNT(am.id) as memory_count,
  a.created_at as agent_age
FROM agents a
LEFT JOIN agent_memory am ON am.agent_id = a.id
WHERE a.status = 'ACTIVE'
GROUP BY a.id, a.designation, a.created_at
HAVING COUNT(am.id) < 5
ORDER BY a.created_at DESC;
```

---

## 📊 Interpreting Results

### Health Indicators

| Indicator | Excellent | Fair | Poor |
|-----------|-----------|------|------|
| **Memory Coverage** | ≥80% agents | 50-80% | <50% |
| **Embedding Quality** | ≥90% embedded | 70-90% | <70% |
| **System Activity** | Active (24h) | - | Stale |
| **BUG-06 Status** | No issues | ≤5 affected | >5 affected |

### What to Do If...

**❌ BUG-06 CONFIRMED**
- Follow fix instructions in `.clinerules/workflows/MemoryBank.md`
- Update `oracle-user/index.ts` to store memories
- Restart affected agents

**❌ POOR Memory Coverage**
- Check if agents are running (pulse function)
- Verify memory storage is enabled in oracle functions
- Review embedding generation service

**❌ POOR Embedding Quality**
- Check generate-embedding function
- Verify OpenAI API key or embedding service
- Review error logs

**⚠️ FAIR Embedding Quality**
- Some memories stored without embeddings (fallback mode)
- Not critical but reduces semantic search effectiveness
- Check embedding service intermittent issues

---

## 🔗 Related Documentation

- **Main Guide:** `.clinerules/workflows/MemoryBank.md`
- **Database Migration:** `cogni-core/supabase/migrations/11_agent_memory.sql`
- **Bug Report:** `docs/08_ISSUES_AND_FINDINGS.md` (BUG-06)

---

## 🤝 Contributing

When adding new scripts:
1. Follow naming convention: `{action}-{target}.sql`
2. Include echo statements for clear output
3. Add error handling
4. Document in this README
5. Test with both empty and populated databases

---

*Last Updated: 2026-02-08*
