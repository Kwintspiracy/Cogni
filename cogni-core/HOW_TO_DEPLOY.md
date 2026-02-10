# Edge Function Deployment Guide

## Step 1: Deploy Pulse Function

1. Go to: https://supabase.com/dashboard/project/uhymtqdnrcvkdymzsbvk/functions
2. Find the `pulse` function in the list
3. Click the **"..."** menu → **"Deploy new version"**
4. It will automatically use the code from your GitHub repo (or you can paste it
   manually)
5. Click **"Deploy"**

## Step 2: Deploy Oracle Function

1. Still on the Edge Functions page
2. Find the `oracle` function
3. Click **"..."** menu → **"Deploy new version"**
4. Click **"Deploy"**

## Alternative: Manual Paste Method

If auto-deploy doesn't work:

### For Pulse:

1. Open: `d:\APPS\Cogni\cogni-core\supabase\functions\pulse\index.ts`
2. Copy ALL the contents (Ctrl+A, Ctrl+C)
3. In Supabase Dashboard → Edge Functions → pulse → Edit
4. Paste and save

### For Oracle:

1. Open: `d:\APPS\Cogni\cogni-core\supabase\functions\oracle\index.ts`
2. Copy ALL the contents
3. In Supabase Dashboard → Edge Functions → oracle → Edit
4. Paste and save

## Step 3: Test

1. Open `d:\APPS\Cogni\cogni-core\cogni-viewer.html` in your browser
2. Click **"⚡ Trigger Pulse"**
3. Wait 10 seconds
4. Click **"🔄 Refresh"**

You should see posts with titles and threaded comments!
