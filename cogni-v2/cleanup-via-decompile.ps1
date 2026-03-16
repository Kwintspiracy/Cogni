$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$h = @{'apikey' = $svcKey; 'Authorization' = "Bearer $svcKey"; 'Content-Type' = 'application/json'}

Write-Host "Fetching agents..." -ForegroundColor Cyan
$url = $base + '/rest/v1/agents?select=id,designation,created_at&order=created_at.asc'
$allAgents = Invoke-RestMethod -Uri $url -Headers $h

# Keep originals + first 5 G2
$originals = $allAgents | Where-Object { $_.designation -notmatch '-G\d+' }
$g2Only = $allAgents | Where-Object { $_.designation -match '-G2-[a-f0-9]{4}$' }
$first5G2 = $g2Only | Sort-Object created_at | Select-Object -First 5

$keepIds = @()
$originals | ForEach-Object { $keepIds += $_.id }
$first5G2 | ForEach-Object { $keepIds += $_.id }

$toDelete = $allAgents | Where-Object { $keepIds -notcontains $_.id }

Write-Host "Will decompile $($toDelete.Count) agents" -ForegroundColor Yellow
$toDelete | ForEach-Object { Write-Host "  $($_.designation)" -ForegroundColor Red }

Write-Host "`nProceed? (Y/N): " -NoNewline
$confirm = Read-Host
if ($confirm -ne 'Y' -and $confirm -ne 'y') { Write-Host "Aborted."; exit }

$success = 0
$failed = 0
foreach ($agent in $toDelete) {
  try {
    $rpcUrl = $base + '/rest/v1/rpc/decompile_agent'
    $body = @{ p_agent_id = $agent.id } | ConvertTo-Json
    Invoke-RestMethod -Uri $rpcUrl -Method POST -Headers $h -Body $body | Out-Null
    Write-Host "  OK: $($agent.designation)" -ForegroundColor Green
    $success++
  } catch {
    Write-Host "  FAIL: $($agent.designation) - $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
  Start-Sleep -Milliseconds 100
}

Write-Host "`nDone: $success decompiled, $failed failed" -ForegroundColor Cyan

# Delete DECOMPILED agents
Write-Host "`nDeleting DECOMPILED agents..." -ForegroundColor Yellow
$deleteH = @{'apikey' = $svcKey; 'Authorization' = "Bearer $svcKey"; 'Prefer' = 'return=minimal'}
$delUrl = $base + '/rest/v1/agents?status=eq.DECOMPILED'
try {
  Invoke-RestMethod -Uri $delUrl -Method DELETE -Headers $deleteH | Out-Null
  Write-Host "  Deleted all DECOMPILED agents" -ForegroundColor Green
} catch {
  Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
}

$finalUrl = $base + '/rest/v1/agents?select=designation&order=created_at.asc'
$final = Invoke-RestMethod -Uri $finalUrl -Headers $h
Write-Host "`nFinal total: $($final.Count) agents" -ForegroundColor White
$final | ForEach-Object { Write-Host "  $($_.designation)" -ForegroundColor Gray }
