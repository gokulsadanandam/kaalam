<#
Stores the two secrets the "Deploy backend" workflow needs on GitHub:

  SUPABASE_ACCESS_TOKEN  pasted by you: create one named "kaalam-github-actions" at
                         https://supabase.com/dashboard/account/tokens
  SUPABASE_DB_PASSWORD   read from backend\.env (or asked for)

  powershell -ExecutionPolicy Bypass -File scripts\set-deploy-secrets.ps1
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github.ps1')

$gh = Get-Gh

$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'
$dbPassword = $null
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*SUPABASE_DB_PASSWORD\s*=' } | Select-Object -First 1
  if ($line) { $dbPassword = ($line -replace '^\s*SUPABASE_DB_PASSWORD\s*=\s*', '').Trim().Trim('"', "'") }
}
if ($dbPassword) {
  Write-Host 'Using the database password from backend\.env.'
} else {
  $dbPassword = Read-Secret 'Supabase database password (Project Settings -> Database)'
}

Write-Host 'Create an access token at https://supabase.com/dashboard/account/tokens (name it "kaalam-github-actions").'
$token = Read-Secret 'Paste the Supabase access token'
if ($token -notmatch '^sbp_\S{20,}$') {
  Write-Host "That doesn't look like a Supabase access token (they start with sbp_). Nothing was changed." -ForegroundColor Yellow
  exit 1
}

try {
  Set-RepoSecret $gh 'SUPABASE_ACCESS_TOKEN' $token
  Set-RepoSecret $gh 'SUPABASE_DB_PASSWORD' $dbPassword
  Write-Host "SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD are set on $Repo." -ForegroundColor Green
  Write-Host 'Run "Deploy backend" from the Actions tab to check them.'
} finally {
  $token = $null; $dbPassword = $null
}
