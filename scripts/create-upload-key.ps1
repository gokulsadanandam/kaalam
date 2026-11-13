<#
Creates Kaalam's Android upload key (alias "upload"), then stores it as the
three GitHub secrets the Release workflow needs.

Run it in your own PowerShell window, from the repo folder:

  powershell -ExecutionPolicy Bypass -File scripts\create-upload-key.ps1

The key is written outside the repo (Documents\kaalam-keys by default).
Back it up: losing it means asking Google to reset the upload key.
If the GitHub CLI isn't ready yet, store the secrets later with
scripts\set-signing-secrets.ps1.
#>
param([string]$OutDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'kaalam-keys'))

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github.ps1')

function Find-Keytool {
  $onPath = Get-Command keytool -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  # A JDK installed with winget or Android Studio isn't always on PATH.
  $roots = @("$env:USERPROFILE\.jdks", "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java",
    "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Android\Android Studio\jbr")
  foreach ($root in $roots) {
    if (Test-Path $root) {
      $found = Get-ChildItem $root -Filter keytool.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($found) { return $found.FullName }
    }
  }
  return $null
}

$keytool = Find-Keytool
if (-not $keytool) {
  Write-Host 'keytool not found. Install a JDK first, then open a new PowerShell window and run this again:' -ForegroundColor Yellow
  Write-Host '  winget install EclipseAdoptium.Temurin.17.JDK'
  exit 1
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$keystore = Join-Path $OutDir 'kaalam-upload.jks'
if (Test-Path $keystore) {
  Write-Host "$keystore already exists, so nothing was changed. To store it in GitHub, run scripts\set-signing-secrets.ps1." -ForegroundColor Yellow
  Write-Host "Delete it first only if you're sure it was never uploaded to Play." -ForegroundColor Yellow
  exit 1
}

Write-Host 'Creating the Kaalam upload key.'
$name = (Read-Host 'Your name, as it should appear in the certificate') -replace '[,=+<>#;"\\]', ''
$city = (Read-Host 'Your city') -replace '[,=+<>#;"\\]', ''
do {
  $password = Read-Secret 'Choose a password (at least 8 characters)'
  $again = Read-Secret 'Type it again'
  $ok = $password.Length -ge 8 -and $password -ceq $again
  if (-not $ok) { Write-Host "The passwords didn't match or were too short. Try again." -ForegroundColor Yellow }
} until ($ok)

& $keytool -genkeypair -keystore $keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $password -keypass $password -dname "CN=$name, L=$city, C=IN" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'keytool failed; see the message above.' -ForegroundColor Red; exit 1 }
Write-Host "Key created: $keystore" -ForegroundColor Green
Write-Host 'Back up now: put the .jks file and the password in your password manager, plus one other safe place.' -ForegroundColor Yellow
Write-Host ''

$gh = Get-Gh
try {
  Set-RepoSecret $gh 'ANDROID_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)))
  Set-RepoSecret $gh 'ANDROID_KEYSTORE_PASSWORD' $password
  Set-RepoSecret $gh 'ANDROID_KEY_PASSWORD' $password
  Write-Host "The three signing secrets are set on $Repo." -ForegroundColor Green
} finally {
  $password = $null; $again = $null
}
