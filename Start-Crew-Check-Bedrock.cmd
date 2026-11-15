@echo off
setlocal
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or later is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "if (!$env:AWS_BEARER_TOKEN_BEDROCK) { $secret = Read-Host 'Enter your Amazon Bedrock API key (hidden)' -AsSecureString; if (!$secret.Length) { exit 1 }; $env:AWS_BEARER_TOKEN_BEDROCK = [System.Net.NetworkCredential]::new('', $secret).Password.Trim() }; try { node server.js --open; exit $LASTEXITCODE } finally { Remove-Item Env:AWS_BEARER_TOKEN_BEDROCK -ErrorAction SilentlyContinue }"
if errorlevel 1 pause
popd
