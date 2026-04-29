param(
  [string]$Port = "9222",
  [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"

function Invoke-CdpRequest {
  param(
    [string]$Url,
    [string]$Method = "Get",
    [object]$Body = $null
  )

  if ($Body -eq $null) {
    return Invoke-RestMethod -Uri $Url -Method $Method
  }

  return Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)
}

$targetsUrl = "http://127.0.0.1:$Port/json"

try {
  $targets = Invoke-CdpRequest -Url $targetsUrl
} catch {
  Write-Error "Chrome DevTools Protocol is not available on port $Port. Start Chrome with --remote-debugging-port=$Port, then reload again."
  exit 2
}

if ($ExtensionId) {
  $extensionTargets = @($targets | Where-Object { $_.url -like "chrome-extension://$ExtensionId/*" })
} else {
  $extensionTargets = @($targets | Where-Object {
    $_.url -like "chrome-extension://*/*" -and
    ($_.type -eq "service_worker" -or $_.type -eq "background_page" -or $_.title -like "*AI Translate*")
  })
}

if (-not $extensionTargets.Length) {
  Write-Error "No matching extension target found. Open the extension once, or pass -ExtensionId if multiple extensions are loaded."
  exit 3
}

$target = $extensionTargets[0]
$webSocketUrl = $target.webSocketDebuggerUrl

if (-not $webSocketUrl) {
  Write-Error "Selected target has no webSocketDebuggerUrl."
  exit 4
}

$client = [System.Net.WebSockets.ClientWebSocket]::new()
$uri = [Uri]$webSocketUrl
$client.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

$payload = @{
  id = 1
  method = "Runtime.evaluate"
  params = @{
    expression = "chrome.runtime.reload()"
    awaitPromise = $false
  }
} | ConvertTo-Json -Depth 10

$bytes = [Text.Encoding]::UTF8.GetBytes($payload)
$segment = [ArraySegment[byte]]::new($bytes)
$client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
$client.Dispose()

Write-Output "Extension reload requested for $($target.url)"
