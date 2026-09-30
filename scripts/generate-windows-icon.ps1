$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'renderer\assets\watteau-app-icon-256.png'
$outDir = Join-Path $root 'artifacts\r8'
$output = Join-Path $outDir 'watteau-windows-icon.png'

if (-not (Test-Path $source)) {
  throw "Icône source introuvable : $source"
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$src = [System.Drawing.Image]::FromFile($source)
try {
  if ($src.Width -ne 256 -or $src.Height -ne 256) {
    throw "Icône source inattendue : $($src.Width)x$($src.Height), 256x256 attendu."
  }

  # Le cadre blanc historique réduit fortement le bâtiment aux petites tailles.
  # On conserve l'illustration Watteau et on recadre seulement la zone utile.
  $crop = New-Object System.Drawing.Rectangle(45, 10, 201, 242)
  $dest = New-Object System.Drawing.Bitmap(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $dest.SetResolution(96, 96)
    $graphics = [System.Drawing.Graphics]::FromImage($dest)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $target = New-Object System.Drawing.Rectangle(8, 8, 240, 240)
      $graphics.DrawImage($src, $target, $crop.X, $crop.Y, $crop.Width, $crop.Height, [System.Drawing.GraphicsUnit]::Pixel)
    }
    finally {
      $graphics.Dispose()
    }

    $dest.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $dest.Dispose()
  }
}
finally {
  $src.Dispose()
}

$generated = [System.Drawing.Image]::FromFile($output)
try {
  if ($generated.Width -ne 256 -or $generated.Height -ne 256) {
    throw "Icône Windows générée invalide : $($generated.Width)x$($generated.Height)."
  }
}
finally {
  $generated.Dispose()
}

$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $stream = [System.IO.File]::OpenRead($output)
  try {
    $hashBytes = $sha.ComputeHash($stream)
  }
  finally {
    $stream.Dispose()
  }
}
finally {
  $sha.Dispose()
}
$hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
Write-Host "R8_WINDOWS_ICON_READY path=$output sha256=$hash"
