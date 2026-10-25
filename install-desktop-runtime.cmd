@echo off
setlocal
cd /d "%~dp0"
npm ci
if errorlevel 1 (
  echo Electron runtime installation failed.
  pause
  exit /b 1
)
node node_modules\electron\install.js
if errorlevel 1 (
  echo Electron binary download failed.
  pause
  exit /b 1
)
echo Electron runtime installed. You can now launch Start-ATLAS.cmd.
pause
