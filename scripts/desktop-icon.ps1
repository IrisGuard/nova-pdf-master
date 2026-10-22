# NOVA PDF Master - desktop icon (Owner order 2026-10-22)
# Draws a multi-resolution .ico (dark rounded tile + paper page + lime PDF band)
# and drops a "NOVA PDF Master" shortcut on the Windows Desktop pointing at the app.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $repoRoot 'assets'
$null = New-Item -ItemType Directory -Force -Path $assetDir
$iconPath = Join-Path $assetDir 'nova-pdf.ico'

function New-RoundedRect([System.Drawing.RectangleF]$r, [float]$radius) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $radius * 2
  $p.AddArc($r.X, $r.Y, $d, $d, 180, 90)
  $p.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
  $p.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
  $p.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-IconBitmap([int]$size) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $s = [float]$size
  $pad = $s * 0.055
  $tile = [System.Drawing.RectangleF]::new($pad, $pad, $s - 2 * $pad, $s - 2 * $pad)
  $tilePath = New-RoundedRect $tile ([float]($s * 0.21))

  # tile background: graphite gradient
  $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    ([System.Drawing.PointF]::new(0, 0)),
    ([System.Drawing.PointF]::new($s, $s)),
    [System.Drawing.Color]::FromArgb(255, 22, 25, 33),
    [System.Drawing.Color]::FromArgb(255, 8, 9, 13))
  $g.FillPath($bgBrush, $tilePath)

  # lime hairline
  $penLine = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 201, 255, 77), [float]([Math]::Max(1, $s * 0.022)))
  $g.DrawPath($penLine, $tilePath)

  # page shape (paper)
  $pw = $s * 0.40
  $ph = $s * 0.50
  $px = $s * 0.30
  $py = $s * 0.245
  $fold = $s * 0.13
  $page = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $page.AddLine($px, $py, $px + $pw - $fold, $py)
  $page.AddLine($px + $pw - $fold, $py, $px + $pw, $py + $fold)
  $page.AddLine($px + $pw, $py + $fold, $px + $pw, $py + $ph)
  $page.AddLine($px + $pw, $py + $ph, $px, $py + $ph)
  $page.CloseFigure()
  $paper = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 246, 245, 239))
  $g.FillPath($paper, $page)

  # folded corner
  $corner = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $corner.AddLine($px + $pw - $fold, $py, $px + $pw - $fold, $py + $fold)
  $corner.AddLine($px + $pw - $fold, $py + $fold, $px + $pw, $py + $fold)
  $corner.CloseFigure()
  $cornerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 214, 216, 208))
  $g.FillPath($cornerBrush, $corner)
  $edge = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 168, 172, 162), [float]([Math]::Max(1, $s * 0.012)))
  $g.DrawPath($edge, $page)

  # lime "PDF" band
  $bandH = $s * 0.175
  $band = [System.Drawing.RectangleF]::new(($px - $s * 0.045), ($py + $ph * 0.50), ($pw + $s * 0.09), $bandH)
  $bandPath = New-RoundedRect $band ([float]($s * 0.035))
  $lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 201, 255, 77))
  $g.FillPath($lime, $bandPath)

  if ($size -ge 32) {
    $fontSize = [float]($s * 0.115)
    $font = [System.Drawing.Font]::new('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = [System.Drawing.StringFormat]::new()
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 10, 12, 10))
    $g.DrawString('PDF', $font, $ink, $band, $fmt)
    $font.Dispose(); $ink.Dispose()
  }

  # baseline text lines on the page (suggest text under the band)
  if ($size -ge 48) {
    $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 196, 199, 190), [float]([Math]::Max(1, $s * 0.016)))
    for ($i = 0; $i -lt 3; $i++) {
      $y = $py + $ph * 0.80 + $i * $s * 0.045
      $g.DrawLine($linePen, $px + $pw * 0.14, $y, $px + $pw * 0.86, $y)
    }
    $linePen.Dispose()
  }

  $bgBrush.Dispose(); $penLine.Dispose(); $paper.Dispose(); $cornerBrush.Dispose(); $edge.Dispose()
  $lime.Dispose(); $tilePath.Dispose(); $page.Dispose(); $corner.Dispose(); $bandPath.Dispose()
  $g.Dispose()
  return $bmp
}

# --- build the .ico (PNG-compressed entries, Vista+) ---
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @()
foreach ($sz in $sizes) {
  $bmp = New-IconBitmap $sz
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , @{ size = $sz; bytes = $ms.ToArray() }
  $ms.Dispose(); $bmp.Dispose()
}

$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # type = icon
$bw.Write([UInt16]$pngs.Count)       # count
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
  $d = [byte]($(if ($p.size -ge 256) { 0 } else { $p.size }))
  $bw.Write($d)                      # width
  $bw.Write($d)                      # height
  $bw.Write([byte]0)                 # palette
  $bw.Write([byte]0)                 # reserved
  $bw.Write([UInt16]1)               # planes
  $bw.Write([UInt16]32)              # bit depth
  $bw.Write([UInt32]$p.bytes.Length) # data length
  $bw.Write([UInt32]$offset)         # data offset
  $offset += $p.bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.bytes) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($iconPath, $out.ToArray())
$bw.Dispose(); $out.Dispose()
Write-Host "icon written: $iconPath ($((Get-Item $iconPath).Length) bytes)"

# --- keep a stable copy for the shortcut ---
$stableDir = Join-Path $env:LOCALAPPDATA 'NovaPDFMaster'
$null = New-Item -ItemType Directory -Force -Path $stableDir
$stableIcon = Join-Path $stableDir 'nova-pdf.ico'
Copy-Item -Path $iconPath -Destination $stableIcon -Force
Write-Host "stable icon: $stableIcon"

# --- desktop shortcut ---
$desktop = [Environment]::GetFolderPath('Desktop')
$urlFile = Join-Path $desktop 'NOVA PDF Master.url'
$lines = @(
  '[InternetShortcut]',
  'URL=https://pdf.novaecosystem.live/',
  "IconFile=$stableIcon",
  'IconIndex=0',
  'HotKey=0',
  ''
)
[System.IO.File]::WriteAllLines($urlFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "shortcut: $urlFile"

# --- also expose the 256px png for the repo/favicon tooling ---
$bmp256 = New-IconBitmap 256
$a = [System.Drawing.Rectangle]::new(0, 0, 256, 256)
$bmp256.Save((Join-Path $assetDir 'nova-pdf-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Dispose()

Write-Host 'DONE'

