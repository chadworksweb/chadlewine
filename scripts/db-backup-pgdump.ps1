# Daily logical backup of the chadlewine Supabase database via pg_dump.
#
# No Supabase Pro tier = no managed backups / PITR, so this is the primary DB
# backup. Produces a custom-format (-Fc), compressed, turnkey pg_restore-able
# dump of the ENTIRE database (all schemas incl. public + auth + storage).
#
# pg_dump 17.6 lives in a user-local folder (no admin install, no PG service):
#   C:\Users\chad\.chadlewine-backup\pgsql\bin\pg_dump.exe
# Auth: PGPASSWORD from %USERPROFILE%\.chadlewine-backup\db.env (NOT in repo).
#   Rotate the DB password -> update that one file.
#
# Output:    <Dropbox>\Backups\chadlewine-db\chadlewine-YYYY-MM-DD.dump
# Restore:   pg_restore --no-owner --no-privileges -d "<target conn>" <file.dump>
# Retention: keeps the most recent 30 daily dumps.
#
# Run manually:  powershell -ExecutionPolicy Bypass -File scripts\db-backup-pgdump.ps1
# Scheduled daily by the "chadlewine-db-backup" Windows task.

$ErrorActionPreference = 'Stop'
$bin     = 'C:\Users\chad\.chadlewine-backup\pgsql\bin'
$envFile = Join-Path $env:USERPROFILE '.chadlewine-backup\db.env'
$outDir  = Join-Path $env:USERPROFILE 'Dropbox\Backups\chadlewine-db'
$logFile = Join-Path $env:USERPROFILE '.chadlewine-backup\db-backup.log'
$host_   = 'db.dyjvcjbgnvjkubrsqnym.supabase.co'
$retain  = 30

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line
  Write-Output $line
}

try {
  New-Item -ItemType Directory -Force -Path $outDir, (Split-Path $logFile) | Out-Null
  $env:PGPASSWORD = ((Get-Content $envFile -Raw) -replace 'PGPASSWORD=', '').Trim()
  $env:PGSSLMODE  = 'require'
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  $out = Join-Path $outDir "chadlewine-$stamp.dump"
  $errFile = Join-Path $env:TEMP 'chadlewine-pgdump.err'

  & "$bin\pg_dump.exe" -Fc --no-owner --no-privileges -h $host_ -p 5432 -U postgres -d postgres -f $out 2> $errFile
  $code = $LASTEXITCODE
  Remove-Item Env:\PGPASSWORD, Env:\PGSSLMODE -ErrorAction SilentlyContinue

  if ($code -ne 0) {
    $errTxt = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
    throw "pg_dump exit $code : $errTxt"
  }
  $kb = [math]::Round((Get-Item $out).Length / 1KB, 0)
  Log "OK  $out  ($kb KB)"

  # Retention: keep the most recent $retain daily dumps.
  $files = Get-ChildItem $outDir -Filter 'chadlewine-*.dump' | Sort-Object Name
  $stale = $files | Select-Object -First ([math]::Max(0, $files.Count - $retain))
  foreach ($f in $stale) { Remove-Item $f.FullName -Force }
  if ($stale.Count) { Log "pruned $($stale.Count) dump(s) older than the last $retain" }
  exit 0
}
catch {
  if (Test-Path Env:\PGPASSWORD) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
  Log ("FAIL  " + $_.Exception.Message)
  exit 1
}
