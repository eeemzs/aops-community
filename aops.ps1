$ErrorActionPreference = 'Stop'
$maximumArgumentCount = 256
$maximumArgumentCharacters = 8192
$maximumPayloadBytes = 16384
if ($args.Count -gt $maximumArgumentCount) { throw 'community_launcher_powershell_argv_count_exceeded' }
foreach ($argument in $args) {
  if ($null -eq $argument -or $argument.GetType().FullName -ne 'System.String') { throw 'community_launcher_powershell_argv_type_invalid' }
  if ($argument.Length -gt $maximumArgumentCharacters -or $argument.IndexOf([char]0) -ne -1) { throw 'community_launcher_powershell_argv_value_invalid' }
}
$argumentJson = ConvertTo-Json -InputObject ([object[]]$args) -Compress
$argumentBytes = [System.Text.Encoding]::UTF8.GetBytes($argumentJson)
if ($argumentBytes.Length -gt $maximumPayloadBytes) { throw 'community_launcher_powershell_argv_payload_exceeded' }
$transportName = 'AOPS_CLONE_LAUNCHER_TRANSPORT'
$payloadName = 'AOPS_CLONE_LAUNCHER_ARGV_B64'
$priorTransport = [System.Environment]::GetEnvironmentVariable($transportName, "Process")
$priorPayload = [System.Environment]::GetEnvironmentVariable($payloadName, "Process")
$node = Get-Command node -CommandType Application -ErrorAction Stop
$launcher = Join-Path -Path $PSScriptRoot -ChildPath 'deploy/community/aops-launcher.mjs'
try {
  [System.Environment]::SetEnvironmentVariable($transportName, 'powershell-json-base64-v1', 'Process')
  [System.Environment]::SetEnvironmentVariable($payloadName, [System.Convert]::ToBase64String($argumentBytes), "Process")
  & $node.Source $launcher
  if ($null -eq $LASTEXITCODE) { $childExitCode = 1 } else { $childExitCode = $LASTEXITCODE }
} finally {
  [System.Environment]::SetEnvironmentVariable($transportName, $priorTransport, "Process")
  [System.Environment]::SetEnvironmentVariable($payloadName, $priorPayload, "Process")
}
exit $childExitCode
