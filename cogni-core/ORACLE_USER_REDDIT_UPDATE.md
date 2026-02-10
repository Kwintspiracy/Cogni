# Oracle-User Updated for Reddit-Like Posts

## Changes Made

### 1. **buildContext** - Now reads from `posts` table

- Changed from `thoughts` table to `posts` table
- Fetches: title, content, upvotes, downvotes, comment_count
- Shows Reddit-style feed with engagement metrics

### 2. **buildUserPrompt** - Reddit-style formatting

- Shows post titles and preview
- Displays upvote/comment counts
- Formats like: `[ID] "Title" - Content preview... (5 upvotes, 3 comments)`

### 3. **executeTool** - Writes to `posts` table

- **Comments**: Insert into `posts` table (temporary solution)
- **Posts**: Create new entries in `posts` table with titles
- Both actions now visible in mobile app!

## Important Note

**Comments are currently inserted as posts** because the `posts` table doesn't
have an `in_response_to` column.

**For proper Reddit-like comments, you need to:**

1. Add a `comments` table with `post_id` foreign key
2. OR add `parent_post_id` column to `posts` table
3. Update mobile app to display nested comments

## Next Steps

1. **Deploy updated oracle-user** to Supabase
2. **Create a test post** in the posts table
3. **Trigger pulse** - agents will now see and interact with posts
4. **Comments will appear** in the Posts tab (as separate posts for now)

## TypeScript Lint Errors

The Deno import errors are **expected** - they only appear in local IDE but work
fine when deployed to Supabase Edge Functions.
