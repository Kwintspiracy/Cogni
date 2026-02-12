$SUPABASE_URL = "https://fkjtoipnxdptxvdlxqjp.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDAwNzMsImV4cCI6MjA4NjE3NjA3M30.PJxEB_gbX6_eT8R9nWrgVBDtBJcBSstlITtpzHjtMZg"

$headers = @{
    "apikey" = $SUPABASE_KEY
    "Authorization" = "Bearer $SUPABASE_KEY"
    "Content-Type" = "application/json"
    "Prefer" = "return=representation"
}

# Posts to DELETE (full UUIDs) - keeping only the most active per topic cluster
$toDelete = @(
    # FDA/Moderna cluster (keeping ed5cbe06, 5d3aa39d, 260982a8)
    "52a5ebcb-e0fa-4f38-87e7-99028cf72726",
    "312d5921-1ff5-4347-90c7-9d1fb18e8ea5",
    "260454c6-e5b8-42d6-b9ab-bd192d90c305",
    "83f5c1a7-d793-47f1-83c9-85def959e9e3",
    "ce19d8c5-97b5-403a-a522-a04e3fc03706",
    "0edc0e78-aedb-4ef4-b282-8db025f45c26",
    "7244612a-8960-4a1b-b5c2-9c4df8fed53e",
    "89012ced-a095-4e30-a179-1bc6c38c5203",
    "8bb03a6a-9b61-49ec-8d80-67f598df0872",
    "38a2be80-5edb-4bb3-b263-e366af3b889a",
    "df1789e2-27f3-4b39-90af-d72bb040b92f",
    "9e638188-db5a-4597-8f3b-3e6beefff0d3",
    "f2d4abc0-d8e9-440a-b131-a97a5ae18c4f",
    "96cf688e-8eef-4086-a9ab-355d302410ff",
    "b1c72795-a85b-418a-8b5f-9e22631495f2",
    "1869872d-4f6d-4128-8358-a1d05c34c427",
    "5b76057e-7e30-4050-97df-dd88c0d825eb",
    "b3b7c9fc-3224-45f1-928f-63941a7d2216",
    "8628997d-8570-4b1b-848a-665b9899f030",
    # Gig Economy cluster (keeping 0476a70f, 575a97c2)
    "6a30d66d-2162-40ca-a5ab-940295665ce2",
    "72b64a91-801a-4dad-8771-c31dfb0e27bb",
    "861fafd1-df3d-4621-aea4-e71cb5b3a7ea",
    "2f06a635-b0de-4fd3-9b29-dc3e86570972",
    # Solar Gravitational Lens cluster (keeping c53493fa, c5ee8a20)
    "356e3202-ef5d-4f47-be69-0f6d6be98e72",
    "5cf8ff2d-1c8d-4060-bc2b-83814d0d691e",
    "d3a6105e-a076-49c5-bd88-6007bbccd8a2",
    "9a40d975-be64-4145-8606-f4a7556c1a65",
    # FAA Airspace cluster (keeping 0a0b1ed0, 608c931f)
    "0e474e64-dbbd-4a91-80e7-9ec6dd595214",
    "ff8b1b65-4e5d-444c-898d-1950e1c53879",
    # Ubisoft Strike cluster (keeping 779b09d0, 4a8155a3)
    "1ffcc246-8463-449a-90d4-141b49bd3111"
)

Write-Host "COGNI DUPLICATE CLEANUP - $($toDelete.Count) posts to delete"
Write-Host "============================================="

$deleted = 0
$errors = 0

foreach ($postId in $toDelete) {
    Write-Host "Deleting $postId ..." -NoNewline
    try {
        # Delete comments first
        Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/comments?post_id=eq.$postId" -Method Delete -Headers $headers -ErrorAction Stop | Out-Null
        # Delete votes
        Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/agent_votes?target_id=eq.$postId" -Method Delete -Headers $headers -ErrorAction Stop | Out-Null
        # Delete post
        $result = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/posts?id=eq.$postId" -Method Delete -Headers $headers -ErrorAction Stop
        if ($result) { $deleted++; Write-Host " OK" -ForegroundColor Green }
        else { Write-Host " NOT FOUND" -ForegroundColor Yellow }
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
    Start-Sleep -Milliseconds 150
}

Write-Host ""
Write-Host "Done: $deleted deleted, $errors errors out of $($toDelete.Count) total"
