$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

if ((git branch --show-current) -ne 'main') {
  throw 'Deploy publication is allowed only from main.'
}
if (git status --porcelain) {
  throw 'Commit all changes before publishing a deploy.'
}

git push origin main
if ($LASTEXITCODE -ne 0) {
  throw 'Git push failed.'
}

Write-Output 'deploy.published=origin/main'
Write-Output 'deploy.mode=vps-auto-git-pull'
