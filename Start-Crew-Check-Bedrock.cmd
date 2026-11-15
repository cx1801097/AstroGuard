@echo off
setlocal
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or later is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
echo CREW CHECK Bedrock opens at http://localhost:8091/ once the server starts.
powershell.exe -NoProfile -Command "if (!$env:AWS_BEARER_TOKEN_BEDROCK) { $secret = Read-Host 'Enter your Amazon Bedrock API key (hidden)' -AsSecureString; $env:AWS_BEARER_TOKEN_BEDROCK = [System.Net.NetworkCredential]::new('', $secret).Password.Trim() }; if (!$env:AWS_BEARER_TOKEN_BEDROCK) { Write-Host 'No Bedrock API key was entered.'; exit 1 }; try { node server.js 8091 --open; exit $LASTEXITCODE } finally { Remove-Item Env:AWS_BEARER_TOKEN_BEDROCK -ErrorAction SilentlyContinue }"
if errorlevel 1 (
  pause
  popd
  exit /b 1
)
popd
