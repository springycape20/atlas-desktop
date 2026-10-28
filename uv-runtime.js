const VERSION = '0.13.6';
const SHA256 = 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f';
const URL = `https://github.com/astral-sh/uv/releases/download/${VERSION}/uv-x86_64-pc-windows-msvc.zip`;
function installScript(directory) {
  const quote = (value) => "'" + value.replace(/'/g, "''") + "'";
  return (
    "$ErrorActionPreference='Stop'; $destination=" +
    quote(directory) +
    '; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; ' +
    "$stage=Join-Path ([IO.Path]::GetTempPath()) ('atlas-uv-'+[guid]::NewGuid().ToString()); New-Item -ItemType Directory -Path $stage | Out-Null; " +
    "try { $archive=Join-Path $stage 'uv.zip'; Invoke-WebRequest -UseBasicParsing -Uri '" +
    URL +
    "' -OutFile $archive; " +
    "if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '" +
    SHA256 +
    "') { throw 'uv runtime checksum mismatch.' }; " +
    "Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $stage 'unpacked'); New-Item -ItemType Directory -Force -Path $destination | Out-Null; " +
    "foreach ($name in @('uv.exe','uvx.exe')) { $file=Get-ChildItem -LiteralPath (Join-Path $stage 'unpacked') -Filter $name -File -Recurse | Select-Object -First 1; if (!$file) { throw 'uv archive is incomplete.' }; Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $destination $name) } " +
    "} finally { $resolved=[IO.Path]::GetFullPath($stage); $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\\')+'\\'; if (!$resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe temporary cleanup path.' }; Remove-Item -LiteralPath $resolved -Recurse -Force }"
  );
}
module.exports = { VERSION, SHA256, URL, installScript };
