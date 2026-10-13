# 将完整 Flutter 程序、VC++ DLL 和 WebView2 固定运行时封装成免安装绿色包。
$ErrorActionPreference = 'Stop'
$betaRelease = Join-Path $PWD 'build/windows/x64/runner/Release'
$betaTemp = Join-Path $env:RUNNER_TEMP 'bbk-portable-runtime'
New-Item -ItemType Directory -Force $betaTemp | Out-Null
$betaCab = Join-Path $betaTemp 'webview2.cab'
$betaExtract = Join-Path $betaTemp 'extracted'
New-Item -ItemType Directory -Force $betaExtract | Out-Null
Invoke-WebRequest -Uri 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/01b0fbd9-6ea3-4e12-818a-a71f73f3855b/Microsoft.WebView2.FixedVersionRuntime.155.0.4283.45.x64.cab' -OutFile $betaCab
& expand.exe '-F:*' $betaCab $betaExtract
if ($LASTEXITCODE -ne 0) { throw 'WebView2 解压失败' }
$betaBrowser = Get-ChildItem $betaExtract -Recurse -Filter 'msedgewebview2.exe' | Select-Object -First 1
if (!$betaBrowser) { throw 'WebView2 固定运行时缺少主程序' }
$betaRuntime = Join-Path $betaRelease 'WebView2'
New-Item -ItemType Directory -Force $betaRuntime | Out-Null
Copy-Item (Join-Path $betaBrowser.Directory.FullName '*') $betaRuntime -Recurse -Force

$betaVs = & "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$betaCrt = Get-ChildItem (Join-Path $betaVs 'VC/Redist/MSVC/*/x64/Microsoft.VC143.CRT') -Directory | Sort-Object FullName -Descending | Select-Object -First 1
if (!$betaCrt) { throw '未找到 VC++ 可再分发 DLL' }
Copy-Item (Join-Path $betaCrt.FullName '*.dll') $betaRelease -Force
$betaReadme = @'
BBK Beta · Windows 绿色版
解压整个目录，双击 bbk_classics.exe 即可运行，无需安装。
DLL、data、WebView2 必须与 EXE 保持相对位置，不能单独复制 EXE。
在游戏面板点“键盘映射”可自行绑定按键，设置自动保存，鼠标按键也可使用。
存档和按键设置位于当前用户的应用数据目录，移动程序目录不会清除进度。
'@
Set-Content -Path (Join-Path $betaRelease '使用说明.txt') -Value $betaReadme -Encoding utf8
New-Item -ItemType Directory -Force 'build/beta' | Out-Null
Compress-Archive -Path "$betaRelease/*" -DestinationPath 'build/beta/BBK-windows-x64-portable-beta.zip' -Force
