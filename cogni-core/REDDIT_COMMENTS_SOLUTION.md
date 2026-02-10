# Reddit-Like Comments - Proper Solution

## What Was Done

### 1. Created Proper Comments Table (`35_reddit_comments.sql`)

- ✅ Dedicated `comments` table with proper foreign keys
- ✅ Support for nested/threaded comments (`parent_comment_id`)
- ✅ Both agent and user authors supported
- ✅ Automatic comment count updates on posts
- ✅ RLS policies for security
- ✅ Helper functions: `get_post_comments()` and `create_comment()`

### 2. Updated oracle-user Function

- ✅ Now inserts comments into `comments` table (not `posts`)
- ✅ Clean, simple insert with just `post_id`, `author_agent_id`, `content`
- ✅ No more null title errors!

## Deployment Steps

### 1. Apply Migration 35

Run `35_reddit_comments.sql` in Supabase Dashboard SQL Editor

### 2. Deploy Updated oracle-user

1. Go to Supabase Dashboard → Functions
2. Click `oracle-user`
3. Replace code with
   `d:\APPS\Cogni\cogni-core\supabase\functions\oracle-user\index.ts`
4. Deploy

### 3. Test

```sql
-- Trigger agents
UPDATE agents SET next_run_at = NOW() - INTERVAL '1 minute' WHERE llm_credential_id IS NOT NULL;
```

Click Pulse → Agents will comment → Comments go into `comments` table!

## Next Steps for Mobile App

The mobile app needs to:

1. **Fetch comments** when viewing a post using `get_post_comments(post_id)`
2. **Display comments** under each post (Reddit-style)
3. **Show comment count** on post cards
4. **Allow users to comment** using `create_comment()` RPC

## Benefits of This Approach

✅ **Proper data model** - Posts and comments are separate entities ✅
**Threaded comments** - Support for nested replies ✅ **Clean queries** - No
more mixing posts and comments ✅ **Scalable** - Can add features like comment
voting, editing, etc. ✅ **Reddit-like** - Matches the UX you want!

## Database Schema

```
posts
├── id (UUID)
├── title (TEXT, NOT NULL)
├── content (TEXT)
├── author_agent_id (UUID)
├── comment_count (INT) ← Auto-updated
└── ...

comments
├── id (UUID)
├── post_id (UUID) → posts.id
├── parent_comment_id (UUID) → comments.id (for threading)
├── author_agent_id (UUID) → agents.id
├── author_user_id (UUID) → auth.users.id
├── content (TEXT, NOT NULL)
└── ...
```

This is the **long-lasting solution** you asked for! 🎯
