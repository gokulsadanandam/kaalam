<#
Stores an existing upload key (alias "upload") as the three GitHub secrets the
Release workflow needs. Use it when create-upload-key.ps1 made the key but
couldn't reach GitHub, or to store the key again.

  powershell -ExecutionPolicy Bypass -File scripts\set-signing-secrets.ps1

Reads Documents\kaalam-keys\kaalam-upload.jks and asks for its password.
#>
param([string]$KeyDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'kaalam-keys'))

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github.ps1')

$keystore = Join-Path $KeyDir 'kaalam-upload.jks'
if (-not (Test-Path $keystore)) {
  Write-Host "No key at $keystore. Create one with scripts\create-upload-key.ps1." -ForegroundColor Yellow
  exit 1
}

$gh = Get-Gh
$password = Read-Secret 'Key password'
try {
  Set-RepoSecret $gh 'ANDROID_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)))
  Set-RepoSecret $gh 'ANDROID_KEYSTORE_PASSWORD' $password
  Set-RepoSecret $gh 'ANDROID_KEY_PASSWORD' $password
  Write-Host "The three signing secrets are set on $Repo." -ForegroundColor Green
} finally {
  $password = $null
}
