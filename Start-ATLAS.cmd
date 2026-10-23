@echo off
setlocal
set "ATLAS_ROOT=%~dp0."
set "ATLAS_RUNTIME=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ATLAS_RUNTIME%" (
  echo ATLAS desktop runtime was not found at:
  echo "%ATLAS_RUNTIME%"
  echo Run install-desktop-runtime.cmd inside this ATLAS folder, then try again.
  pause
  exit /b 1
)
start "" /D "%ATLAS_ROOT%" "%ATLAS_RUNTIME%" "%ATLAS_ROOT%"