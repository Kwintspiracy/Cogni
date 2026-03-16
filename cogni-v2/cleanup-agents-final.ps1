$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$h = @{'apikey' = $svcKey; 'Authorization' = "Bearer $svcKey"}
$deleteH = @{'apikey' = $svcKey; 'Authorization' = "Bearer $svcKey"; 'Prefer' = 'return=minimal'}

Write-Host "Fetching all agents..." -ForegroundColor Cyan
$url = $base + '/rest/v1/agents?select=id,designation,created_at&order=created_at.asc'
$allAgents = Invoke-RestMethod -Uri $url -Headers $h

Write-Host "Total agents: $($allAgents.Count)" -ForegroundColor White

# Keep originals
$originals = $allAgents | Where-Object { $_.designation -notmatch '-G\d+' } | Sort-Object created_at
Write-Host "`nOriginal agents to keep: $($originals.Count)" -ForegroundColor Green
$originals | ForEach-Object { Write-Host "  $_($_.designation)" -ForegroundColor Green }

# Keep first 5 G2 only
$g2Only = $allAgents | Where-Object { $_.designation -match '-G2-[a-f0-9]{4}$' } | Sort-Object created_at
$first5G2 = $g2Only | Select-Object -First 5
Write-Host "`nFirst 5 G2 agents to keep: $($first5G2.Count)" -ForegroundColor Green
$first5G2 | ForEach-Object { Write-Host "  $($_.designation)" -ForegroundColor Green }

# Build keep list
$keepIds = @()
$originals | ForEach-Object { $keepIds += $_.id }
$first5G2 | ForEach-Object { $keepIds += $_.id }

# Build delete list
$toDelete = $allAgents | Where-Object { $keepIds -notcontains $_.id }
Write-Host "`nAgents to delete: $($toDelete.Count)" -ForegroundColor Red

Write-Host "`nSummary: Keep $($keepIds.Count), Delete $($toDelete.Count)" -ForegroundColor Cyan
Write-Host "Proceed? (Y/N): " -ForegroundColor Yellow -NoNewline
$confirm = Read-Host
if ($confirm -ne 'Y' -and $confirm -ne 'y') { Write-Host "Aborted."; exit }

Write-Host "`nDeleting..." -ForegroundColor Yellow
$success = 0
$failed = 0
foreach ($agent in $toDelete) {
  try {
    $delUrl = $base + '/rest/v1/agents?id=eq.' + $agent.id
    Invoke-RestMethod -Uri $delUrl -Method DELETE -Headers $deleteH | Out-Null
    Write-Host "  OK: $($agent.designation)" -ForegroundColor Green
    $success++
  } catch {
    Write-Host "  FAIL: $($agent.designation)" -ForegroundColor Red
    $failed++
  }
  Start-Sleep -Milliseconds 50
}

Write-Host "`nDone: $success deleted, $failed failed" -ForegroundColor Cyan
$finalUrl = $base + '/rest/v1/agents?select=designation&order=created_at.asc'
$final = Invoke-RestMethod -Uri $finalUrl -Headers $h
Write-Host "Final total: $($final.Count) agents" -ForegroundColor White
