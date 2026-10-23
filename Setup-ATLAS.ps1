param([switch]$SkipDependencies)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    throw 'This installer currently supports Windows x64 only.'
}
if (-not $SkipDependencies) {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS, reopen PowerShell, then run setup again.' }
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & node node_modules/electron/install.js
    if ($LASTEXITCODE -ne 0) { throw 'Electron runtime installation failed.' }
}
$cache = Join-Path $PSScriptRoot '.setup-cache'
$runtime = Join-Path $PSScriptRoot 'speech/whisper/Release'
$models = Join-Path $PSScriptRoot 'speech/models'
New-Item -ItemType Directory -Force $cache, $runtime, $models | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $runtime 'whisper-server.exe'))) {
    $archive = Join-Path $cache 'whisper-v1.8.7-x64.zip'
    Write-Host 'Downloading the official whisper.cpp Windows runtime...'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.7/whisper-bin-x64.zip' -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'd9627486e1c34a03745880485593473e047294260ce9a3cb0aa8deaf15b99af6') { throw 'Speech runtime checksum mismatch.' }
    $unpacked = Join-Path $cache 'whisper-v1.8.7'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
    $cli = Get-ChildItem -LiteralPath $unpacked -Filter whisper-cli.exe -File -Recurse | Select-Object -First 1
    if (-not $cli) { throw 'Speech runtime archive did not contain whisper-cli.exe.' }
    Get-ChildItem -LiteralPath $cli.DirectoryName -File | Copy-Item -Destination $runtime
}
foreach ($model in @('ggml-tiny.en.bin', 'ggml-small.en-q5_1.bin')) {
    $destination = Join-Path $models $model
    if (-not (Test-Path -LiteralPath $destination)) {
        Write-Host "Downloading $model..."
        Invoke-WebRequest -UseBasicParsing -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$model" -OutFile "$destination.partial"
        Move-Item -LiteralPath "$destination.partial" -Destination $destination
    }
}
$shortcutPath = Join-Path $PSScriptRoot 'ATLAS.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSScriptRoot 'Start-ATLAS.cmd'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Launch ATLAS desktop assistant'
$shortcut.Save()
Write-Host 'Setup complete. Sign into your provider CLIs, then run ATLAS.lnk or Start-ATLAS.cmd.'
