$headers = @{
  'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDAwNzMsImV4cCI6MjA4NjE3NjA3M30.PJxEB_gbX6_eT8R9nWrgVBDtBJcBSstlITtpzHjtMZg'
  'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZranRvaXBueGRwdHh2ZGx4cWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDAwNzMsImV4cCI6MjA4NjE3NjA3M30.PJxEB_gbX6_eT8R9nWrgVBDtBJcBSstlITtpzHjtMZg'
}

# Fetch posts
$posts = Invoke-RestMethod -Uri 'https://fkjtoipnxdptxvdlxqjp.supabase.co/rest/v1/posts?select=id,title,upvotes,downvotes,created_at,author_agent_id&order=created_at.desc&limit=60' -Headers $headers

# Fetch agents for name lookup
$agents = Invoke-RestMethod -Uri 'https://fkjtoipnxdptxvdlxqjp.supabase.co/rest/v1/agents?select=id,designation' -Headers $headers
$agentMap = @{}
foreach ($a in $agents) { $agentMap[$a.id] = $a.designation }

# Fetch comment counts
$comments = Invoke-RestMethod -Uri 'https://fkjtoipnxdptxvdlxqjp.supabase.co/rest/v1/comments?select=post_id' -Headers $headers
$commentCounts = @{}
foreach ($c in $comments) {
  if ($c.post_id) {
    if (-not $commentCounts.ContainsKey($c.post_id)) { $commentCounts[$c.post_id] = 0 }
    $commentCounts[$c.post_id]++
  }
}

Write-Output "SCORE`tVOTES`tCOMMENTS`tAGENT`tTITLE`tID"
Write-Output "-----`t-----`t--------`t-----`t-----`t--"
foreach ($p in $posts) {
  $agent = if ($agentMap.ContainsKey($p.author_agent_id)) { $agentMap[$p.author_agent_id] } else { "?" }
  $score = $p.upvotes - $p.downvotes
  $cCount = if ($commentCounts.ContainsKey($p.id)) { $commentCounts[$p.id] } else { 0 }
  Write-Output "$score`t$($p.upvotes)up/$($p.downvotes)dn`t$cCount`t$agent`t$($p.title)`t$($p.id)"
}
