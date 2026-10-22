# NOVA PDF Master — unified icon factory (Owner order 2026-10-22)
# Draws ONE logo — a dark rounded tile with the lime→ice gradient document mark
# (exactly the favicon.svg design) — and emits every raster the product needs:
#   public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png (180),
#   assets/nova-pdf.ico (16→256) and the desktop shortcut.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $root 'public'
$assetDir = Join-Path $root 'assets'
$null = New-Item -ItemType Directory -Force -Path $assetDir

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-IconBitmap([int]$size, [bool]$fullBleed = $false) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [float]$size

  # 1) tile background (#0a0c11) — rounded for PWA/desktop, full square for iOS
  if ($fullBleed) {
    $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 12, 17))
  } else {
    $radius = $s * 0.23
    $tile = New-RoundedPath 0 0 $s $s $radius
    $tileBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 12, 17))
    $g.FillPath($tileBrush, $tile)
    $tile.Dispose(); $tileBrush.Dispose()
  }

  # 2) lime → ice gradient stroke
  $gbrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    ([System.Drawing.PointF]::new(0, 0)),
    ([System.Drawing.PointF]::new($s, $s)),
    [System.Drawing.Color]::FromArgb(255, 201, 255, 77),
    [System.Drawing.Color]::FromArgb(255, 134, 217, 255))
  $sw = [Math]::Max(1.0, $s * 0.05)
  $pen = New-Object System.Drawing.Pen($gbrush, $sw)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  # document outline (same normalized points as favicon.svg viewBox 64)
  $doc = New-Object System.Drawing.Drawing2D.GraphicsPath
  $doc.StartFigure()
  $doc.AddLines(@(
    ([System.Drawing.PointF]::new($s * 0.28125, $s * 0.125)),
    ([System.Drawing.PointF]::new($s * 0.59375, $s * 0.125)),
    ([System.Drawing.PointF]::new($s * 0.59375, $s * 0.3125)),
    ([System.Drawing.PointF]::new($s * 0.78125, $s * 0.3125)),
    ([System.Drawing.PointF]::new($s * 0.78125, $s * 0.875)),
    ([System.Drawing.PointF]::new($s * 0.28125, $s * 0.875))
  ))
  $doc.CloseFigure()
  $g.DrawPath($pen, $doc)

  # squiggle line inside the document
  $squig = New-Object System.Drawing.Drawing2D.GraphicsPath
  $squig.StartFigure()
  $squig.AddLines(@(
    ([System.Drawing.PointF]::new($s * 0.375, $s * 0.59375)),
    ([System.Drawing.PointF]::new($s * 0.453125, $s * 0.75)),
    ([System.Drawing.PointF]::new($s * 0.515625, $s * 0.640625)),
    ([System.Drawing.PointF]::new($s * 0.578125, $s * 0.703125)),
    ([System.Drawing.PointF]::new($s * 0.671875, $s * 0.578125))
  ))
  $g.DrawPath($pen, $squig)

  $gbrush.Dispose(); $pen.Dispose()
  $doc.Dispose(); $squig.Dispose(); $g.Dispose()
  return $bmp
}

function Save-Png([int]$size, [string]$path, [bool]$fullBleed = $false) {
  $bmp = New-IconBitmap $size $fullBleed
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "png  $path"
}

# --- raster PNGs ---
Save-Png 192 (Join-Path $publicDir 'icon-192.png')
Save-Png 512 (Join-Path $publicDir 'icon-512.png')
Save-Png 180 (Join-Path $publicDir 'apple-touch-icon.png') $true

# --- multi-resolution .ico (PNG-compressed entries) ---
$iconPath = Join-Path $assetDir 'nova-pdf.ico'
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
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
  $d = [byte]($(if ($p.size -ge 256) { 0 } else { $p.size }))
  $bw.Write($d); $bw.Write($d); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$p.bytes.Length); $bw.Write([UInt32]$offset)
  $offset += $p.bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.bytes) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($iconPath, $out.ToArray())
$bw.Dispose(); $out.Dispose()
Write-Host "ico  $iconPath ($((Get-Item $iconPath).Length) bytes)"

# --- stable copy + desktop shortcut ---
$stableDir = Join-Path $env:LOCALAPPDATA 'NovaPDFMaster'
$null = New-Item -ItemType Directory -Force -Path $stableDir
$stableIcon = Join-Path $stableDir 'nova-pdf.ico'
Copy-Item -Path $iconPath -Destination $stableIcon -Force
Write-Host "stable icon: $stableIcon"

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
Write-Host 'DONE'
