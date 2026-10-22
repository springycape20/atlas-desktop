@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo ATLAS desktop runtime is not installed yet.
  echo Run install-desktop-runtime.cmd once, then try again.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
