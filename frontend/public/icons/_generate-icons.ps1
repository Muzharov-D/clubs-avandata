# PWA icon generator. ASCII-only to be safe with default PowerShell encoding.
#
# Usage:
#   1. Save your logo as icon-source.png in this folder (square, 512x512+).
#   2. Open PowerShell here.
#   3. Run:  powershell -ExecutionPolicy Bypass -File ./_generate-icons.ps1
#
# Outputs: web-app-manifest-512x512.png, 192x192, apple-touch-icon.png,
# favicon-96x96.png, icon-512.png, icon-192.png

Add-Type -AssemblyName System.Drawing

$here = $PSScriptRoot
$src  = Join-Path $here 'icon-source.png'
if (-not (Test-Path $src)) {
    Write-Error "icon-source.png not found in $here. Save the logo there first."
    exit 1
}

$source = [System.Drawing.Image]::FromFile($src)
Write-Host ("Source: {0}x{1}" -f $source.Width, $source.Height)

function Resize-Save {
    param(
        [int]$Size,
        [string]$OutName
    )
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($source, 0, 0, $Size, $Size)
    $g.Dispose()
    $out = Join-Path $here $OutName
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("  OK  {0}  ({1}x{1})" -f $OutName, $Size)
}

Resize-Save -Size 512 -OutName 'web-app-manifest-512x512.png'
Resize-Save -Size 192 -OutName 'web-app-manifest-192x192.png'
Resize-Save -Size 180 -OutName 'apple-touch-icon.png'
Resize-Save -Size 96  -OutName 'favicon-96x96.png'
Resize-Save -Size 512 -OutName 'icon-512.png'
Resize-Save -Size 192 -OutName 'icon-192.png'

$source.Dispose()
Write-Host ""
Write-Host "Done. Verify site.webmanifest references match these filenames."
