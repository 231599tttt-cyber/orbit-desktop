$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$results = [System.Collections.Generic.List[object]]::new()

function Add-ShortcutFolder {
  param(
    [string]$Folder,
    [string]$Source
  )

  if (-not $Folder -or -not (Test-Path -LiteralPath $Folder -PathType Container)) {
    return
  }

  $windowsShell = New-Object -ComObject WScript.Shell
  Get-ChildItem -LiteralPath $Folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $shortcut = $windowsShell.CreateShortcut($_.FullName)
      $results.Add([PSCustomObject]@{
        Name = $_.BaseName
        Kind = 'shortcut'
        Source = $Source
        ShortcutPath = $_.FullName
        TargetPath = $shortcut.TargetPath
        Arguments = $shortcut.Arguments
        WorkingDirectory = $shortcut.WorkingDirectory
        IconLocation = $shortcut.IconLocation
        Aumid = $null
        LogoPath = $null
      })
    } catch {}
  }
}

Add-ShortcutFolder -Folder ([Environment]::GetFolderPath('Programs')) -Source 'start-menu-user'
Add-ShortcutFolder -Folder ([Environment]::GetFolderPath('CommonPrograms')) -Source 'start-menu-system'
Add-ShortcutFolder -Folder ([Environment]::GetFolderPath('Desktop')) -Source 'desktop-user'
Add-ShortcutFolder -Folder (Join-Path $env:PUBLIC 'Desktop') -Source 'desktop-public'

$registryRoots = @(
  'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths',
  'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths',
  'Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths'
)

foreach ($registryRoot in $registryRoots) {
  if (-not (Test-Path -LiteralPath $registryRoot)) {
    continue
  }

  Get-ChildItem -LiteralPath $registryRoot -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $properties = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
      $targetPath = $properties.'(default)'
      if (-not $targetPath) {
        $targetPath = $properties.Path
      }
      if ($targetPath) {
        $targetPath = [Environment]::ExpandEnvironmentVariables([string]$targetPath).Trim('"')
      }
      $results.Add([PSCustomObject]@{
        Name = [IO.Path]::GetFileNameWithoutExtension($_.PSChildName)
        Kind = 'executable'
        Source = 'registry'
        ShortcutPath = $null
        TargetPath = $targetPath
        Arguments = $null
        WorkingDirectory = if ($targetPath) { [IO.Path]::GetDirectoryName($targetPath) } else { $null }
        IconLocation = $targetPath
        Aumid = $null
        LogoPath = $null
      })
    } catch {}
  }
}

if (Get-Command Get-StartApps -ErrorAction SilentlyContinue) {
  $packageByFamily = @{}
  Get-AppxPackage -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.PackageFamilyName) {
      $packageByFamily[$_.PackageFamilyName] = $_
    }
  }

  Get-StartApps -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $aumid = [string]$_.AppID
      if (-not $aumid.Contains('!')) {
        return
      }

      $logoPath = $null
      $packageFamily = $aumid.Split('!')[0]
      $package = $packageByFamily[$packageFamily]
      if ($package -and $package.InstallLocation) {
        $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
        if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
          [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop
          $visual = $manifest.SelectSingleNode("//*[local-name()='VisualElements']")
          $relativeLogo = $visual.GetAttribute('Square44x44Logo')
          if (-not $relativeLogo) { $relativeLogo = $visual.GetAttribute('SmallLogo') }
          if (-not $relativeLogo) { $relativeLogo = $visual.GetAttribute('Logo') }
          if ($relativeLogo -and -not $relativeLogo.StartsWith('ms-resource:')) {
            $directLogo = Join-Path $package.InstallLocation $relativeLogo
            if (Test-Path -LiteralPath $directLogo -PathType Leaf) {
              $logoPath = $directLogo
            } else {
              $logoDirectory = Split-Path -Parent $directLogo
              $logoStem = [IO.Path]::GetFileNameWithoutExtension($directLogo)
              if (Test-Path -LiteralPath $logoDirectory -PathType Container) {
                $variant = Get-ChildItem -LiteralPath $logoDirectory -File -ErrorAction SilentlyContinue |
                  Where-Object { $_.BaseName -like "$logoStem*" -and $_.Extension -match '^\.(png|jpg|jpeg)$' } |
                  Sort-Object @{ Expression = { if ($_.BaseName -match 'targetsize-48') { 0 } elseif ($_.BaseName -match 'scale-200') { 1 } else { 2 } } } |
                  Select-Object -First 1
                if ($variant) { $logoPath = $variant.FullName }
              }
            }
          }
        }
      }

      $results.Add([PSCustomObject]@{
        Name = [string]$_.Name
        Kind = 'uwp'
        Source = 'uwp'
        ShortcutPath = $null
        TargetPath = $null
        Arguments = $null
        WorkingDirectory = $null
        IconLocation = $null
        Aumid = $aumid
        LogoPath = $logoPath
      })
    } catch {}
  }
}

@($results) | ConvertTo-Json -Depth 4 -Compress
