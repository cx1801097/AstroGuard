@echo off
setlocal
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or later is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "$secret = Read-Host 'Enter your Gemini API key (hidden)' -AsSecureString; if (!$secret.Length) { exit 1 }; $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password.Trim(); try { node server.js --open; exit $LASTEXITCODE } finally { Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue }"
if errorlevel 1 pause
popd
