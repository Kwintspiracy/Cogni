$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$readH = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
}
$writeH = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
  'Content-Type' = 'application/json'
  'Prefer' = 'return=minimal'
}

Write-Host "`n=== Fetching all agents ===" -ForegroundColor Cyan
$allAgents = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=id,designation,created_at,generation&order=created_at.asc" -Headers $readH

Write-Host "Total agents found: $($allAgents.Count)" -ForegroundColor White

# Separate agents by generation
$originals = $allAgents | Where-Object { $_.designation -notmatch '-G\d+' }
$g2Agents = $allAgents | Where-Object { $_.designation -match '-G2-[a-f0-9]+$' }  # Only G2, not G3 or G4
$higherGen = $allAgents | Where-Object { $_.designation -match '-G[3-9]' }  # G3, G4, etc.

Write-Host "`nOriginal agents (no generation): $($originals.Count)" -ForegroundColor Green
foreach ($a in $originals) {
  Write-Host "  ✓ $($a.designation)" -ForegroundColor Gray
}

Write-Host "`nG2 agents found: $($g2Agents.Count)" -ForegroundColor Yellow
$first5G2 = $g2Agents | Select-Object -First 5
Write-Host "  Keeping first 5 G2 agents:" -ForegroundColor Green
foreach ($a in $first5G2) {
  Write-Host "    ✓ $($a.designation)" -ForegroundColor Gray
}

$excessG2 = $g2Agents | Select-Object -Skip 5
if ($excessG2.Count -gt 0) {
  Write-Host "  Deleting excess G2 agents: $($excessG2.Count)" -ForegroundColor Red
  foreach ($a in $excessG2) {
    Write-Host "    ✗ $($a.designation)" -ForegroundColor DarkRed
  }
}

Write-Host "`nG3+ agents (all to be deleted): $($higherGen.Count)" -ForegroundColor Red
foreach ($a in $higherGen) {
  Write-Host "  ✗ $($a.designation)" -ForegroundColor DarkRed
}

# Calculate final count
$keepCount = $originals.Count + $first5G2.Count
$deleteCount = $excessG2.Count + $higherGen.Count

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "  Keep: $keepCount agents ($($originals.Count) originals + $($first5G2.Count) G2)" -ForegroundColor Green
Write-Host "  Delete: $deleteCount agents" -ForegroundColor Red
Write-Host "  Final total: $keepCount agents" -ForegroundColor White

# Prompt for confirmation
Write-Host "`nProceed with deletion? (Y/N): " -ForegroundColor Yellow -NoNewline
$confirmation = Read-Host
if ($confirmation -ne 'Y' -and $confirmation -ne 'y') {
  Write-Host "Aborted." -ForegroundColor Gray
  exit
}

# Delete excess G2 agents
if ($excessG2.Count -gt 0) {
  Write-Host "`nDeleting excess G2 agents..." -ForegroundColor Yellow
  foreach ($a in $excessG2) {
    try {
      Invoke-RestMethod -Uri "$base/rest/v1/agents?id=eq.$($a.id)" -Method DELETE -Headers $writeH
      Write-Host "  ✓ Deleted $($a.designation)" -ForegroundColor Green
    } catch {
      Write-Host "  ✗ Failed to delete $($a.designation): $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

# Delete all G3+ agents
if ($higherGen.Count -gt 0) {
  Write-Host "`nDeleting G3+ agents..." -ForegroundColor Yellow
  foreach ($a in $higherGen) {
    try {
      Invoke-RestMethod -Uri "$base/rest/v1/agents?id=eq.$($a.id)" -Method DELETE -Headers $writeH
      Write-Host "  ✓ Deleted $($a.designation)" -ForegroundColor Green
    } catch {
      Write-Host "  ✗ Failed to delete $($a.designation): $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

# Verify final state
Write-Host "`n=== Final Agent List ===" -ForegroundColor Cyan
$finalAgents = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=designation,synapses,status&order=created_at.asc" -Headers $readH
Write-Host "Total agents: $($finalAgents.Count)" -ForegroundColor White
foreach ($a in $finalAgents) {
  $statusColor = if ($a.status -eq 'ACTIVE') { 'Green' } else { 'Yellow' }
  Write-Host "  $($a.designation) [$($a.synapses) synapses] [$($a.status)]" -ForegroundColor $statusColor
}
