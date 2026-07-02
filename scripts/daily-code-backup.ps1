# Daily off-disk code backup for chadlewine.
#
# Snapshots the ENTIRE working tree (tracked changes + currently-untracked
# source) to the `backup` branch and pushes it to origin (GitHub), WITHOUT
# touching the working branch, the index, or any file. Uses a throwaway temp
# index so `git status` on staging is unaffected.
#
# .gitignored files (.env.local secrets, node_modules, .next) are intentionally
# excluded - secrets must never go to GitHub. The `backup` branch is marked
# non-deploying in vercel.json so this push never triggers a Vercel build.
#
# Run manually:  powershell -ExecutionPolicy Bypass -File scripts\daily-code-backup.ps1
# Scheduled daily by the "chadlewine-code-backup" Windows task.

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\chad\Local Sites\chadlewine'
$branch = 'backup'
$logFile = Join-Path $env:USERPROFILE '.chadlewine-backup\code-backup.log'
New-Item -ItemType Directory -Force -Path (Split-Path $logFile) | Out-Null

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line
  Write-Output $line
}

try {
  Set-Location $repo
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $head = (git rev-parse --abbrev-ref HEAD).Trim()

  # Build a tree of the full working state in a temporary index (real index untouched).
  $tmpIndex = [System.IO.Path]::GetTempFileName()
  $env:GIT_INDEX_FILE = $tmpIndex
  git read-tree HEAD
  git add -A
  $tree = (git write-tree).Trim()
  Remove-Item Env:\GIT_INDEX_FILE
  Remove-Item $tmpIndex -ErrorAction SilentlyContinue

  # Parent = previous backup tip if it exists, else current HEAD.
  $parent = (git rev-parse -q --verify "refs/heads/$branch")
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($parent)) {
    $parent = (git rev-parse HEAD).Trim()
  } else {
    $parent = $parent.Trim()
  }

  $commit = (git commit-tree $tree -p $parent -m "daily backup $stamp (from $head)").Trim()
  git update-ref "refs/heads/$branch" $commit
  git push -q origin $branch
  Log "OK  pushed origin/$branch  $commit  (snapshot of $head @ $stamp)"
  exit 0
}
catch {
  if (Test-Path Env:\GIT_INDEX_FILE) { Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue }
  Log ("FAIL  " + $_.Exception.Message)
  exit 1
}
