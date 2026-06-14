param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

Set-Location $RepoRoot

$commits = git log --reverse --date=short --pretty=format:'%ad|%h|%s'

$lines = @(
    '# Changelog'
    ''
    'This changelog is generated from the current git history. Run `scripts/update-changelog.ps1` after commits change, or set `.githooks` as your `core.hooksPath` to refresh it automatically on commit and merge.'
    ''
)

$currentDate = $null
foreach ($commit in $commits) {
    $parts = $commit -split '\|', 3
    if ($parts.Length -ne 3) {
        continue
    }

    $date, $hash, $subject = $parts
    if ($date -ne $currentDate) {
        if ($currentDate -ne $null) {
            $lines += ''
        }
        $lines += "## $date"
        $currentDate = $date
    }

    $lines += "- ``$hash`` $subject"
}

$lines | Set-Content -Path (Join-Path $RepoRoot 'changelog.md') -Encoding UTF8
