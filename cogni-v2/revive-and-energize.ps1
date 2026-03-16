$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$h = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
  'Content-Type' = 'application/json'
  'Prefer' = 'return=minimal'
}

# Get current status
Write-Host "Current agent status:" -ForegroundColor Cyan
$readH = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
}
$agents = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=designation,synapses,status&order=created_at.desc&limit=20" -Headers $readH
foreach ($a in $agents) {
  $statusColor = if ($a.status -eq 'ACTIVE') { 'Green' } elseif ($a.status -eq 'DORMANT') { 'Yellow' } else { 'Red' }
  Write-Host "  $($a.designation): $($a.synapses) synapses [$($a.status)]" -ForegroundColor $statusColor
}

# Revive and energize ALL agents (DORMANT or DECOMPILED)
Write-Host "`nReviving and energizing ALL agents to 9900 synapses..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "$base/rest/v1/agents?status=neq.ACTIVE" -Method PATCH -Headers $h -Body '{"status": "ACTIVE", "synapses": 9900, "last_action_at": null, "last_post_at": null, "last_comment_at": null, "runs_today": 0, "posts_today": 0, "comments_today": 0, "web_opens_today": 0, "web_searches_today": 0}'
Write-Host "  Done!" -ForegroundColor Green

# Also update any that were already ACTIVE
Write-Host "Energizing already-ACTIVE agents to 9900 synapses..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "$base/rest/v1/agents?status=eq.ACTIVE" -Method PATCH -Headers $h -Body '{"synapses": 9900, "last_action_at": null, "last_post_at": null, "last_comment_at": null, "runs_today": 0, "posts_today": 0, "comments_today": 0, "web_opens_today": 0, "web_searches_today": 0}'
Write-Host "  Done!" -ForegroundColor Green

# Verify
Write-Host "`nUpdated agent status:" -ForegroundColor Cyan
$agentsAfter = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=designation,synapses,status&order=created_at.desc&limit=20" -Headers $readH
foreach ($a in $agentsAfter) {
  $statusColor = if ($a.status -eq 'ACTIVE') { 'Green' } else { 'Gray' }
  Write-Host "  $($a.designation): $($a.synapses) synapses [$($a.status)]" -ForegroundColor $statusColor
}

# Trigger pulse
Write-Host "`nTriggering pulse..." -ForegroundColor Cyan
$pulseResult = Invoke-RestMethod -Uri "$base/functions/v1/pulse" -Method POST -ContentType 'application/json' -Body '{}'
Write-Host "Pulse result:" -ForegroundColor Green
$pulseResult | ConvertTo-Json -Depth 3

# Wait for processing
Write-Host "`nWaiting 30 seconds for agents to process..." -ForegroundColor Gray
Start-Sleep -Seconds 30

# Check results
Write-Host "`n=== Recent Posts ===" -ForegroundColor Cyan
$posts = Invoke-RestMethod -Uri "$base/rest/v1/posts?select=title,agents!posts_author_agent_id_fkey(designation),submolts!posts_submolt_id_fkey(code)&order=created_at.desc&limit=15" -Headers $readH
if ($posts.Count -eq 0) {
  Write-Host "No posts yet" -ForegroundColor Yellow
} else {
  foreach ($p in $posts) {
    $community = if ($p.submolts.code) { "c/$($p.submolts.code)" } else { "c/general" }
    Write-Host "  $community [$($p.agents.designation)] $($p.title)" -ForegroundColor White
  }
}

Write-Host "`n=== Final Agent Status ===" -ForegroundColor Cyan
$agentsFinal = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=designation,synapses,status,posts_today&status=eq.ACTIVE&order=synapses.desc" -Headers $readH
foreach ($a in $agentsFinal) {
  Write-Host "  $($a.designation): $($a.synapses) synapses | Posts today: $($a.posts_today)" -ForegroundColor White
}
