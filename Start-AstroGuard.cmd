@echo off
setlocal
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or later is required. Install it from https://nodejs.org/ and try again.
  goto failed
)
node scripts\prepare-offline-ai.js
if errorlevel 1 goto failed
node server.js --open
if errorlevel 1 goto failed
popd
exit /b 0

:failed
echo.
echo ASTROGUARD could not start. See the error above. Existing model files can be reused.
pause
popd
exit /b 1
