# Shared by the setup scripts: finds the GitHub CLI and stores repository
# secrets on gokulsadanandam/kaalam. Every call names the repo, so a gh login on
# another account (or another repo's folder) can't receive Kaalam's secrets.

$Repo = 'gokulsadanandam/kaalam'

function Get-Gh {
  $gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
  if (-not $gh) { $gh = "$env:ProgramFiles\GitHub CLI\gh.exe" }
  if (-not (Test-Path $gh)) {
    Write-Host 'GitHub CLI not found. Install it with "winget install GitHub.cli", open a new PowerShell window,' -ForegroundColor Yellow
    Write-Host 'then sign in with your personal account: gh auth login' -ForegroundColor Yellow
    exit 1
  }
  # gh can hold several accounts; the active one needs admin access to the repo.
  & cmd /c "`"$gh`" api repos/$Repo --jq .permissions.admin >`"$env:TEMP\kaalam-gh-check.txt`" 2>&1"
  $admin = (Get-Content "$env:TEMP\kaalam-gh-check.txt" -Raw -ErrorAction SilentlyContinue).Trim()
  Remove-Item "$env:TEMP\kaalam-gh-check.txt" -ErrorAction SilentlyContinue
  if ($admin -ne 'true') {
    Write-Host "The active GitHub CLI account can't manage secrets on $Repo." -ForegroundColor Yellow
    Write-Host 'Sign in with your personal account ("gh auth login"), or switch to it ("gh auth switch"), and run this again.' -ForegroundColor Yellow
    exit 1
  }
  return $gh
}

function Set-RepoSecret([string]$gh, [string]$name, [string]$value) {
  # Through a short-lived file and cmd's redirect: the value never appears on a
  # command line, and PowerShell's pipe would add a newline to it.
  $file = Join-Path $env:TEMP "kaalam-secret-$([guid]::NewGuid()).txt"
  try {
    [IO.File]::WriteAllText($file, $value)
    & cmd /c "`"$gh`" secret set $name --repo $Repo < `"$file`""
    if ($LASTEXITCODE -ne 0) { throw "Couldn't set $name." }
  } finally {
    Remove-Item $file -ErrorAction SilentlyContinue -Confirm:$false
  }
}

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
