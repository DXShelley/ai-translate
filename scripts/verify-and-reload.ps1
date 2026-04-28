param(
  [string]$Port = "9222",
  [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  node --check src\background.js
  node --check src\content.js
  node --check src\options.js
  node --check src\popup.js
  Get-Content manifest.json | ConvertFrom-Json | Out-Null
  Write-Output "Validation passed."

  $args = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "reload-extension.ps1"), "-Port", $Port)
  if ($ExtensionId) {
    $args += @("-ExtensionId", $ExtensionId)
  }
  & powershell.exe @args
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
