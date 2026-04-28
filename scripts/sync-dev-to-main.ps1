param(
  [switch]$Push
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$necessaryPaths = @(
  ".gitignore",
  "README.md",
  "manifest.json",
  "docs",
  "scripts",
  "src"
)

Push-Location $root
try {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "dev") {
    throw "Run this script from the dev branch. Current branch: $branch"
  }

  $status = git status --porcelain
  if ($status) {
    throw "Working tree is not clean. Commit dev changes before syncing to main."
  }

  $devCommit = (git rev-parse dev).Trim()

  git checkout main | Out-Null
  try {
    foreach ($path in $necessaryPaths) {
      git checkout dev -- $path
    }

    git add -- $necessaryPaths
    $mainStatus = git status --porcelain
    if ($mainStatus) {
      git commit -m "chore: sync dev necessary files to main"
    } else {
      Write-Output "main already contains the latest necessary files from dev."
    }

    if ($Push) {
      git push origin dev
      git push origin main
    }
  } finally {
    git checkout dev | Out-Null
  }

  Write-Output "Synced dev $devCommit to main using necessary file paths."
} finally {
  Pop-Location
}
