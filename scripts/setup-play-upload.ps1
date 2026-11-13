<#
Lets the Release workflow upload to Google Play: creates (or reuses) a Google
Cloud project, turns on the Google Play Android Developer API, creates a
"play-upload" service account with a JSON key, and stores the key as the
PLAY_SERVICE_ACCOUNT_JSON GitHub secret. The key file is deleted afterwards
(make a new one by running this again).

Needs the Google Cloud CLI signed in ("gcloud auth login") and the GitHub CLI
signed in with your personal account ("gh auth login"). The app must already
exist in Play Console (package com.kaalam.rasipalan), with one bundle uploaded
by hand. Then, once, in Play Console -> Users and permissions, invite the
service account email this prints, with "Release apps to testing tracks" for Kaalam.

  powershell -ExecutionPolicy Bypass -File scripts\setup-play-upload.ps1

Tuitly's project can be reused: -ProjectName 'Tuitly Play' (the same service
account then uploads both apps; invite it for Kaalam too).
#>
param([string]$ProjectName = 'Kaalam Play')

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github.ps1')

$gcloud = (Get-Command gcloud -ErrorAction SilentlyContinue).Source
if (-not $gcloud) {
  $gcloud = @("$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $gcloud) { throw 'gcloud not found. Install it with "winget install Google.CloudSDK", then run "gcloud auth login".' }
$gh = Get-Gh

# gcloud is a .cmd script; run it through cmd so its progress on stderr isn't
# an error. Its output then includes notes like "Listed 0 items.", so callers
# match the exact values they expect.
function Invoke-Gcloud([string]$arguments) {
  $output = & cmd /c "`"$gcloud`" $arguments --quiet 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "gcloud $arguments failed:`n$($output -join "`n")" }
  return $output
}

$account = Invoke-Gcloud 'auth list --filter=status:ACTIVE --format="value(account)"' |
  Where-Object { $_ -match '^\S+@\S+$' } | Select-Object -First 1
if (-not $account) { throw 'Sign in first: gcloud auth login' }
Write-Host "Google account: $account"

$project = Invoke-Gcloud "projects list --filter=`"name='$ProjectName'`" --format=`"value(projectId)`"" |
  Where-Object { $_ -match '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' } | Select-Object -First 1
if ($project) {
  Write-Host "Using the existing project $project"
} else {
  $project = 'kaalam-play-' + (Get-Random -Minimum 10000 -Maximum 99999)
  Invoke-Gcloud "projects create $project --name=`"$ProjectName`"" | Out-Null
  Write-Host "Created the project $project"
}

Invoke-Gcloud "services enable androidpublisher.googleapis.com --project=$project" | Out-Null
Write-Host 'Google Play Android Developer API is on.'

$email = "play-upload@$project.iam.gserviceaccount.com"
$existing = Invoke-Gcloud "iam service-accounts list --project=$project --format=`"value(email)`"" |
  Where-Object { $_ -eq $email }
if (-not $existing) {
  Invoke-Gcloud "iam service-accounts create play-upload --display-name=`"Play upload`" --project=$project" | Out-Null
  Write-Host "Created the service account $email"
}

$keyFile = Join-Path $env:TEMP "kaalam-play-upload-$([guid]::NewGuid()).json"
try {
  Invoke-Gcloud "iam service-accounts keys create `"$keyFile`" --iam-account=$email --project=$project" | Out-Null
  Set-RepoSecret $gh 'PLAY_SERVICE_ACCOUNT_JSON' ([IO.File]::ReadAllText($keyFile))
  Write-Host "Stored the key as the PLAY_SERVICE_ACCOUNT_JSON secret on $Repo." -ForegroundColor Green
} finally {
  Remove-Item $keyFile -ErrorAction SilentlyContinue -Confirm:$false
}

Write-Host ''
Write-Host 'Last step, in Play Console -> Users and permissions -> Invite new users:' -ForegroundColor Cyan
Write-Host "  email: $email"
Write-Host '  App permissions -> Kaalam -> "Release apps to testing tracks"'
