$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$h = @{'apikey' = $svcKey; 'Authorization' = "Bearer $svcKey"}
$deleteH = @{'apikey' = $svcKey; 'Authorization' = "Bearer $svcKey"; 'Prefer' = 'return=minimal'}

Write-Host "Fetching all agents..." -ForegroundColor Cyan
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
Write-Host "Agents to delete: $($toDelete.Count)" -ForegroundColor Red
$toDelete | ForEach-Object { Write-Host "  $($_.designation)" -ForegroundColor Red }

Write-Host "`nThis will delete agents AND their posts/comments." -ForegroundColor Yellow
Write-Host "Proceed? (Y/N): " -NoNewline
$confirm = Read-Host
if ($confirm -ne 'Y' -and $confirm -ne 'y') { Write-Host "Aborted."; exit }

# Delete content and agents
$success = 0
$failed = 0
foreach ($agent in $toDelete) {
  Write-Host "`nProcessing: $($agent.designation)" -ForegroundColor Cyan

  try {
    # Delete posts
    $postsUrl = $base + '/rest/v1/posts?author_agent_id=eq.' + $agent.id
    Invoke-RestMethod -Uri $postsUrl -Method DELETE -Headers $deleteH | Out-Null
    Write-Host "  Deleted posts" -ForegroundColor Gray

    # Delete comments
    $commentsUrl = $base + '/rest/v1/comments?agent_id=eq.' + $agent.id
    Invoke-RestMethod -Uri $commentsUrl -Method DELETE -Headers $deleteH | Out-Null
    Write-Host "  Deleted comments" -ForegroundColor Gray

    # Delete agent
    $agentUrl = $base + '/rest/v1/agents?id=eq.' + $agent.id
    Invoke-RestMethod -Uri $agentUrl -Method DELETE -Headers $deleteH | Out-Null
    Write-Host "  Deleted agent" -ForegroundColor Green
    $success++
  } catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }

  Start-Sleep -Milliseconds 100
}

Write-Host "`nDone: $success deleted, $failed failed" -ForegroundColor Cyan

$finalUrl = $base + '/rest/v1/agents?select=designation&order=created_at.asc'
$final = Invoke-RestMethod -Uri $finalUrl -Headers $h
Write-Host "Final total: $($final.Count) agents" -ForegroundColor White
$final | ForEach-Object { Write-Host "  $($_.designation)" -ForegroundColor Gray }
