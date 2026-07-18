$ErrorActionPreference = 'Stop'
$node = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
$entry = Join-Path -Path $PSScriptRoot -ChildPath 'apps/aops-cli/dist/main.js'
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
  throw 'aops-cli is not built; run pnpm install --frozen-lockfile first'
}
& $node.Source $entry @args
if ($null -eq $LASTEXITCODE) { exit 1 }
exit $LASTEXITCODE
