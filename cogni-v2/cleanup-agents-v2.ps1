$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$h = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
}
$deleteH = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
  'Prefer' = 'return=minimal'
}

# Fetch all agents
Write-Host "`nFetching all agents..." -ForegroundColor Cyan
$allAgents = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=id,designation,created_at&order=created_at.asc" -Headers $h

Write-Host "Total: $($allAgents.Count) agents`n" -ForegroundColor White

# Categorize agents
$keep = @()
$delete = @()

# Get originals (no generation suffix)
$originals = $allAgents | Where-Object { $_.designation -notmatch '-G\d+' } | Sort-Object created_at
Write-Host "Original agents: $($originals.Count)" -ForegroundColor Green
foreach ($a in $originals) {
  Write-Host "  KEEP: $($a.designation)" -ForegroundColor Green
  $keep += $a
}

# Get first 5 G2 agents (only G2, not G3/G4)
$g2Only = $allAgents | Where-Object { $_.designation -match '-G2-[a-f0-9]{4}$' } | Sort-Object created_at
$first5G2 = $g2Only | Select-Object -First 5

Write-Host "`nFirst 5 G2 agents:" -ForegroundColor Green
foreach ($a in $first5G2) {
  Write-Host "  KEEP: $($a.designation)" -ForegroundColor Green
  $keep += $a
}

# Everything else gets deleted
$allKeepIds = $keep | ForEach-Object { $_.id }
$delete = $allAgents | Where-Object { $allKeepIds -notcontains $_.id }

Write-Host "`nAgents to delete: $($delete.Count)" -ForegroundColor Red
foreach ($a in $delete) {
  Write-Host "  DELETE: $($a.designation)" -ForegroundColor Red
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "  Keep: $($keep.Count) agents" -ForegroundColor Green
Write-Host "  Delete: $($delete.Count) agents" -ForegroundColor Red

# Confirm
Write-Host "`nProceed with deletion? (Y/N): " -ForegroundColor Yellow -NoNewline
$confirm = Read-Host
if ($confirm -ne 'Y' -and $confirm -ne 'y') {
  Write-Host "Aborted." -ForegroundColor Gray
  exit
}

# Delete agents one by one
Write-Host "`nDeleting agents..." -ForegroundColor Yellow
$successCount = 0
$failCount = 0

foreach ($a in $delete) {
  try {
    Invoke-RestMethod -Uri "$base/rest/v1/agents?id=eq.$($a.id)" -Method DELETE -Headers $deleteH | Out-Null
    Write-Host "  ✓ $($a.designation)" -ForegroundColor Green
    $successCount++
  } catch {
    Write-Host "  ✗ $($a.designation): $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
  }
  Start-Sleep -Milliseconds 100
}

Write-Host "`nDeletion complete: $successCount deleted, $failCount failed" -ForegroundColor Cyan

# Final count
Write-Host "`nFinal agent list:" -ForegroundColor Cyan
$final = Invoke-RestMethod -Uri ($base + '/rest/v1/agents?select=designation&order=created_at.asc') -Headers $h
Write-Host "Total: $($final.Count) agents" -ForegroundColor White
foreach ($a in $final) {
  $name = $a.designation
  Write-Host "  $name" -ForegroundColor Gray
}
