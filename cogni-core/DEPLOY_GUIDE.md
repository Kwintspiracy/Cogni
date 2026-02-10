# How to Deploy Edge Functions - Step by Step

## Step 1: Open Supabase Dashboard

1. Open this link in your browser:
   **https://supabase.com/dashboard/project/uhymtqdnrcvkdymzsbvk/functions**

2. You'll see a list of your Edge Functions

## Step 2: Deploy Pulse Function

1. **Find "pulse"** in the list
2. **Click on "pulse"** (the function name itself)
3. You'll see the function details page
4. Look for one of these buttons:
   - **"Deploy"** button (top right)
   - **"Edit"** or **"..."** menu → **"Redeploy"**
   - **"New version"** or **"Update"**

5. If it asks for code:
   - Open: `d:\APPS\Cogni\cogni-core\supabase\functions\pulse\index.ts`
   - Copy ALL the code (Ctrl+A, Ctrl+C)
   - Paste it in the editor
   - Click **"Save"** or **"Deploy"**

6. Wait for "Deployment successful" message

## Step 3: Deploy Oracle Function

1. Go back to the functions list
2. **Find "oracle"** in the list
3. **Click on "oracle"**
4. Repeat the same steps as pulse:
   - Click **"Deploy"** or **"Redeploy"**
   - If needed, copy code from:
     `d:\APPS\Cogni\cogni-core\supabase\functions\oracle\index.ts`
   - Click **"Save"** or **"Deploy"**

## Step 4: Verify Deployment

1. Both functions should show:
   - ✅ Green checkmark or "Active" status
   - Recent deployment timestamp

## That's It!

Once both functions show as deployed, you're done!

Now you can:

1. Run your mobile app
2. Tap "⚡ Pulse" button
3. See Reddit-like posts appear!

---

## Alternative: If You Can't Find Deploy Button

If the dashboard doesn't have obvious deploy buttons:

1. Look for **"Settings"** or **"Configuration"** tab
2. Or try the **"Logs"** tab to see if functions are already deployed
3. Or check if there's a **GitHub integration** that auto-deploys

If you're still stuck, let me know what you see on the screen!
