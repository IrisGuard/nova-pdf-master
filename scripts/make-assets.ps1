Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\public'
$out = [System.IO.Path]::GetFullPath($out)

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

function P([float]$x, [float]$y) {
  return [System.Drawing.PointF]::new($x, $y)
}

function New-Icon([string]$path, [int]$size, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 12, 17))
  $g.FillRectangle($bg, 0, 0, $size, $size)

  $rect = if ($maskable) { 0.0 } else { $size * 0.06 }
  $radius = if ($maskable) { 0.0 } else { $size * 0.2 }
  $sizeF = [float]$size
  if ($radius -gt 0) {
    $bgPath = New-RoundedPath $rect $rect ($sizeF - 2 * $rect) ($sizeF - 2 * $rect) $radius
    $g.FillPath($bg, $bgPath)
    $bgPath.Dispose()
  } else {
    $g.FillRectangle($bg, 0, 0, $size, $size)
  }

  $margin = if ($maskable) { $size * 0.28 } else { $size * 0.24 }
  $docW = $sizeF - 2 * $margin
  $docH = $docW * 1.3
  $docX = $margin
  $docY = ($sizeF - $docH) / 2

  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, 0)),
    (New-Object System.Drawing.PointF($sizeF, $sizeF)),
    [System.Drawing.Color]::FromArgb(255, 201, 255, 77),
    [System.Drawing.Color]::FromArgb(255, 134, 217, 255))
  $pen = New-Object System.Drawing.Pen($grad, [float]($size * 0.036))
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $fold = $docW * 0.34
  [System.Drawing.PointF[]]$points = @(
    (P $docX $docY),
    (P ($docX + $docW - $fold) $docY),
    (P ($docX + $docW) ($docY + $fold)),
    (P ($docX + $docW) ($docY + $docH)),
    (P $docX ($docY + $docH)),
    (P $docX $docY)
  )
  $g.DrawLines($pen, $points)
  $g.DrawLine($pen, $docX + $docW - $fold, $docY, $docX + $docW - $fold, $docY + $fold)
  $g.DrawLine($pen, $docX + $docW - $fold, $docY + $fold, $docX + $docW, $docY + $fold)

  [System.Drawing.PointF[]]$pulse = @(
    (P ($docX + $docW * 0.18) ($docY + $docH * 0.62)),
    (P ($docX + $docW * 0.36) ($docY + $docH * 0.82)),
    (P ($docX + $docW * 0.52) ($docY + $docH * 0.6)),
    (P ($docX + $docW * 0.68) ($docY + $docH * 0.74)),
    (P ($docX + $docW * 0.84) ($docY + $docH * 0.48))
  )
  $g.DrawLines($pen, $pulse)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $grad.Dispose()
  $bg.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function New-Og([string]$path) {
  $w = 1200
  $h = 630
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($w, $h)),
    [System.Drawing.Color]::FromArgb(255, 7, 8, 11),
    [System.Drawing.Color]::FromArgb(255, 16, 24, 18))
  $g.FillRectangle($bg, 0, 0, $w, $h)

  $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, 201, 255, 77))
  $g.FillEllipse($glow, -180, -260, 720, 720)
  $glow2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 134, 217, 255))
  $g.FillEllipse($glow2, 620, 220, 620, 620)

  $lime = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 201, 255, 77))
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 242, 244, 248))
  $dim = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 160, 167, 181))
  $faint = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 120, 127, 142))

  $fontBrand = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Bold)
  $fontHero = New-Object System.Drawing.Font('Segoe UI', 68, [System.Drawing.FontStyle]::Bold)
  $fontSub = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Regular)
  $fontMeta = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Regular)

  $g.DrawString('NOVA', $fontBrand, $white, 74, 62)
  $g.DrawString('PDF', $fontBrand, $lime, 146, 62)

  $g.DrawString('Every PDF tool.', $fontHero, $white, 68, 150)
  $g.DrawString('Zero uploads.', $fontHero, $lime, 68, 234)

  $g.DrawString('32 tools that run inside your browser.', $fontSub, $dim, 72, 346)
  $g.DrawString('Merge · sign · redact · compress · OCR · AES-256', $fontMeta, $faint, 72, 392)

  $badge = New-RoundedPath 72 450 330 52 12
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 201, 255, 77))), $badge)
  $badgeInk = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 13, 5))
  $fontBadge = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
  $g.DrawString('pdf.novaecosystem.live', $fontBadge, $badgeInk, 92, 462)

  # document card
  $card = New-RoundedPath 792 108 330 414 18
  $cardBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(792, 108)),
    (New-Object System.Drawing.Point(1122, 522)),
    [System.Drawing.Color]::FromArgb(255, 245, 243, 236),
    [System.Drawing.Color]::FromArgb(255, 226, 226, 214))
  $g.FillPath($cardBrush, $card)
  $shadowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 0, 0, 0), 2)
  $g.DrawPath($shadowPen, $card)

  $lineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 196, 192, 180))
  $ys = @(168, 196, 224, 252)
  $ws = @(220, 268, 240, 176)
  for ($i = 0; $i -lt 4; $i++) {
    $r = New-RoundedPath (830) ($ys[$i]) ($ws[$i]) 9 4
    $g.FillPath($lineBrush, $r)
    $r.Dispose()
  }
  $fig = New-RoundedPath 830 286 252 116 8
  $figBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(830, 286)),
    (New-Object System.Drawing.Point(1082, 402)),
    [System.Drawing.Color]::FromArgb(255, 168, 190, 150),
    [System.Drawing.Color]::FromArgb(255, 128, 158, 178))
  $g.FillPath($figBrush, $fig)
  $fig.Dispose()

  $lineBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 200, 196, 184))
  $ys2 = @(430, 454, 478)
  $ws2 = @(250, 220, 160)
  for ($i = 0; $i -lt 3; $i++) {
    $r = New-RoundedPath (830) ($ys2[$i]) ($ws2[$i]) 8 4
    $g.FillPath($lineBrush2, $r)
    $r.Dispose()
  }

  $sealFont = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
  $seal = New-RoundedPath 1004 462 96 30 5
  $sealBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 201, 255, 77))
  $g.FillPath($sealBrush, $seal)
  $g.DrawString('100% LOCAL', $sealFont, $badgeInk, 1014, 469)
  $seal.Dispose()

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  foreach ($o in @($bg, $glow, $glow2, $lime, $white, $dim, $faint, $badgeInk, $lineBrush, $figBrush, $lineBrush2, $sealBrush, $cardBrush)) { if ($o) { $o.Dispose() } }
  foreach ($f in @($fontBrand, $fontHero, $fontSub, $fontMeta, $fontBadge, $sealFont)) { $f.Dispose() }
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon (Join-Path $out 'icon-192.png') 192 $false
New-Icon (Join-Path $out 'icon-512.png') 512 $false
New-Og (Join-Path $out 'og.png')
Write-Output 'assets written'
