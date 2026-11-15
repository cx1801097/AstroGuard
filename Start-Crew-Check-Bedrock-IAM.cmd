@echo off
setlocal
pushd "%~dp0" || exit /b 1
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Install Node.js with npm from https://nodejs.org/ and run this launcher again.
  goto failed
)
if not exist "node_modules\@aws-sdk\client-bedrock-runtime\package.json" (
  echo Installing the AWS SDK...
  call npm.cmd ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 goto failed
)
set "CREW_CHECK_BEDROCK_IAM=1"
set "AWS_BEARER_TOKEN_BEDROCK="
echo CREW CHECK Bedrock IAM opens at http://localhost:8092/ once the server starts.
node server.js 8092 --open
if errorlevel 1 goto failed
popd
exit /b 0

:failed
pause
popd
exit /b 1
