# Copia gli asset esercizi (immagini + GIF) nella cartella public/ dell'app web.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\copy-assets.ps1

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\..') | Select-Object -ExpandProperty Path
$src = Join-Path $root 'webapp\static\exercises'
$dst = Join-Path (Resolve-Path (Join-Path $here '..\public')).Path 'exercises'

if (-not (Test-Path -LiteralPath $src)) {
  Write-Error "Sorgente non trovata: $src"
}

New-Item -ItemType Directory -Force -Path $dst | Out-Null

foreach ($sub in @('images', 'videos')) {
  $from = Join-Path $src $sub
  $to = Join-Path $dst $sub
  if (-not (Test-Path -LiteralPath $from)) {
    Write-Host "Salto $sub (non presente)"
    continue
  }
  Write-Host "Copia $sub ..."
  robocopy $from $to /E /NFL /NDL /NJH /NJS /NP | Out-Null
}

Write-Host "Completato. Asset in: $dst"
