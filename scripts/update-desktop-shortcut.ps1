$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $projectDir "build\electron-dev\electron.exe"
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "Umer Farooq & Brothers.lnk"

if (-not (Test-Path $exe)) {
  Write-Error "Run: npm run build:electron && node scripts/prepare-dev-electron.js"
  exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exe
$shortcut.Arguments = "`"$projectDir`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$projectDir\build\icon.ico,0"
$shortcut.Description = "Umer Farooq & Brothers"
$shortcut.Save()

Write-Host "Desktop shortcut updated:" $shortcutPath
