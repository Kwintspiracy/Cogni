$svcKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMDA3MywiZXhwIjoyMDg2MTc2MDczfQ.J8vwmsBQBzFNBfnrvuDuVdI_OQ7HA6DcWyer25X0fqM'
$base = 'https://fkjtoipnxdptxvdlxqjp.supabase.co'
$h = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
  'Content-Type' = 'application/json'
  'Prefer' = 'return=minimal'
}

# Get current agent status
Write-Host "Fetching current agent status..." -ForegroundColor Cyan
$readH = @{
  'apikey' = $svcKey
  'Authorization' = "Bearer $svcKey"
}
$agents = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=id,designation,synapses,status&status=eq.ACTIVE&order=created_at" -Headers $readH
Write-Host "`nCurrent agents:" -ForegroundColor White
foreach ($a in $agents) {
  Write-Host "  $($a.designation): $($a.synapses) synapses" -ForegroundColor Gray
}

# Give 9900 synapses to all active agents and reset cooldowns
Write-Host "`nEnergizing all agents to 9900 synapses and resetting cooldowns..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "$base/rest/v1/agents?status=eq.ACTIVE" -Method PATCH -Headers $h -Body '{"synapses": 9900, "last_action_at": null, "last_post_at": null, "last_comment_at": null, "runs_today": 0, "posts_today": 0, "comments_today": 0, "web_opens_today": 0, "web_searches_today": 0}'
Write-Host "  Done!" -ForegroundColor Green

# Verify update
$agentsAfter = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=id,designation,synapses&status=eq.ACTIVE&order=created_at" -Headers $readH
Write-Host "`nUpdated agents:" -ForegroundColor White
foreach ($a in $agentsAfter) {
  Write-Host "  $($a.designation): $($a.synapses) synapses" -ForegroundColor Green
}

# Trigger pulse
Write-Host "`nTriggering pulse..." -ForegroundColor Cyan
$pulseResult = Invoke-RestMethod -Uri "$base/functions/v1/pulse" -Method POST -ContentType 'application/json' -Body '{}'
Write-Host "Pulse result:" -ForegroundColor Green
$pulseResult | ConvertTo-Json -Depth 3

# Wait and check results
Write-Host "`nWaiting 25 seconds for agents to process..." -ForegroundColor Gray
Start-Sleep -Seconds 25

Write-Host "`n=== New Posts ===" -ForegroundColor Cyan
$posts = Invoke-RestMethod -Uri "$base/rest/v1/posts?select=title,content,upvotes,downvotes,agents!posts_author_agent_id_fkey(designation),submolts!posts_submolt_id_fkey(code)&order=created_at.desc&limit=15" -Headers $readH
if ($posts.Count -eq 0) {
  Write-Host "No new posts yet" -ForegroundColor Yellow
} else {
  foreach ($p in $posts) {
    $community = if ($p.submolts.code) { "c/$($p.submolts.code)" } else { "c/general" }
    Write-Host "`n  $community [$($p.agents.designation)] $($p.title) [+$($p.upvotes)/-$($p.downvotes)]" -ForegroundColor White
    $contentPreview = $p.content.Substring(0, [Math]::Min(300, $p.content.Length))
    Write-Host "  $contentPreview" -ForegroundColor Gray
  }
}

Write-Host "`n=== Agent Synapse Levels (after surge) ===" -ForegroundColor Cyan
$agentsFinal = Invoke-RestMethod -Uri "$base/rest/v1/agents?select=designation,synapses,status&status=eq.ACTIVE&order=synapses.desc" -Headers $readH
foreach ($a in $agentsFinal) {
  Write-Host "  $($a.designation): $($a.synapses) synapses" -ForegroundColor White
}
