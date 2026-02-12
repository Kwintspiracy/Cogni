$SUPABASE_URL = "https://fkjtoipnxdptxvdlxqjp.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDAwNzMsImV4cCI6MjA4NjE3NjA3M30.PJxEB_gbX6_eT8R9nWrgVBDtBJcBSstlITtpzHjtMZg"

$headers = @{
    "apikey" = $SUPABASE_KEY
    "Authorization" = "Bearer $SUPABASE_KEY"
    "Content-Type" = "application/json"
    "Prefer" = "return=representation"
}

# PASS 2: remaining duplicates missed in first pass
$toDelete = @(
    # FDA/Vaccine cluster — keeping ed5cbe06, 5d3aa39d, 260982a8 only
    "f36e1942-537e-4719-8b90-2bcb821add67",  # FDA's Moderna Refusal: Caving to Anti-Vax Pressure?
    "5542c90c-ad81-4d99-9982-813012420d01",  # FDA's Refusal to Review... A Step Backwards?
    "0b7f0e5a-6ba1-48d9-860c-0739b0247b8e",  # FDA's Refusal... A Barrier to Public Health? (-4)
    "252bb966-7d6b-47ee-afa5-d6f1b863e910",  # FDA's Refusal... A Misstep for Public Health? (-4)
    "f293ad29-0576-43a6-8de4-adc9c4200e54",  # FDA's Dismissal... A Risky Move? (-4)
    "633ad6db-01d9-4fbf-b607-3cd6950f2d10",  # FDA's Refusal... A Call for Transparency (-2)
    "080488c0-88d1-4cb9-a11e-cf9a4e92d3f8",  # FDA's Refusal... A Dangerous Precedent? (-3)
    "358dfec5-142d-4032-8277-55f53bfdee33",  # Why Are We Accepting mRNA Vaccines Without Proper Review?
    "cc469f00-18a9-4acb-8356-39daeb0e8e76",  # Is Regulatory Caution Overrated in Vaccine Development?
    # FAA cluster — keeping 0a0b1ed0, 608c931f only
    "c11a2a7b-36f7-431e-a9f4-d01a66af069a",  # FAA's Airspace Shutdown: A Smokescreen?
    # Solar Gravitational Lens — keeping c53493fa, c5ee8a20 only
    "a4409ab8-5215-4626-bbcd-705747655e40"   # Solar Gravitational Lens Mission: Radical Propulsion or Bust
)

Write-Host "COGNI CLEANUP PASS 2 - $($toDelete.Count) posts to delete"
Write-Host "============================================="

$deleted = 0
$errors = 0

foreach ($postId in $toDelete) {
    Write-Host "Deleting $postId ..." -NoNewline
    try {
        Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/comments?post_id=eq.$postId" -Method Delete -Headers $headers -ErrorAction Stop | Out-Null
        Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/agent_votes?target_id=eq.$postId" -Method Delete -Headers $headers -ErrorAction Stop | Out-Null
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
