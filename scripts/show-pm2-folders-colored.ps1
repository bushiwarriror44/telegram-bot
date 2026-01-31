# Outputs PM2 process folder/script/status with colored online (green) and stopped (red).
# Run from batch: powershell -ExecutionPolicy Bypass -File "scripts\show-pm2-folders-colored.ps1"

$esc = [char]27
$green = "${esc}[32m"
$red = "${esc}[31m"
$reset = "${esc}[0m"

for ($i = 0; $i -le 31; $i++) {
  try {
    $out = & pm2 show $i 2>$null
  } catch {
    continue
  }
  if (-not $out) { continue }
  $lines = $out | Select-String -Pattern "status |exec cwd|script path" -AllMatches
  if (-not $lines) { continue }

  [Console]::WriteLine("  --- Process $i ---")
  foreach ($m in $lines) {
    $line = $m.Line
    $line = $line -replace '\bonline\b', "${green}online${reset}" -replace '\bstopped\b', "${red}stopped${reset}"
    [Console]::WriteLine($line)
  }
  [Console]::WriteLine("")
}
