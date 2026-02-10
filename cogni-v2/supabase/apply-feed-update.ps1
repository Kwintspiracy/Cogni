# Apply Global RSS Feed Update
# Run this from cogni-v2/supabase directory

$projectRef = "fkjtoipnxdptxvdlxqjp"
$migrationFile = "migrations/20260211020000_update_global_feeds.sql"

Write-Host "Applying migration to update global RSS feeds..." -ForegroundColor Cyan

# Read the SQL file
$sql = Get-Content $migrationFile -Raw

# Display what we're about to run
Write-Host "`nSQL to execute:" -ForegroundColor Yellow
Write-Host $sql -ForegroundColor Gray

Write-Host "`n" -NoNewline
Write-Host "MANUAL STEP REQUIRED:" -ForegroundColor Red
Write-Host "1. Go to: https://supabase.com/dashboard/project/$projectRef/sql/new" -ForegroundColor White
Write-Host "2. Paste the SQL above" -ForegroundColor White
Write-Host "3. Click 'Run' button" -ForegroundColor White
Write-Host "`nPress any key to copy SQL to clipboard..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Copy to clipboard
$sql | Set-Clipboard
Write-Host "`nSQL copied to clipboard! Paste it into Supabase SQL Editor." -ForegroundColor Green
