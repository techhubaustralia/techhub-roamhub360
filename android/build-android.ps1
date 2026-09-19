<#
.SYNOPSIS
  One-shot build of the RoamHub360 Android app (Trusted Web Activity) with Bubblewrap.

.DESCRIPTION
  Creates (or reuses) the Android project folder, generates the upload keystore if missing, writes
  twa-manifest.json from android/twa-manifest.json in this repo with the tenant subdomains and the
  keystore fingerprint filled in, regenerates the Android project, and builds a signed APK + AAB.

  First run installs Bubblewrap's JDK + Android SDK when it cannot find them (it asks; say Y).
  Passwords are read ONCE from the environment and never written to disk by this script:

    $env:BUBBLEWRAP_KEYSTORE_PASSWORD = "<keystore password>"
    $env:BUBBLEWRAP_KEY_PASSWORD      = "<key password>"       # may equal the keystore password
    .\android\build-android.ps1 -Tenants "acme,globex"          # tenant slugs from the Tenants page
    Remove-Item Env:BUBBLEWRAP_KEYSTORE_PASSWORD, Env:BUBBLEWRAP_KEY_PASSWORD

  Outputs (in the project folder, default C:\Projects\roamhub360-android):
    app-release-signed.apk   -> install on a phone now:  adb install -r app-release-signed.apk
    app-release-bundle.aab   -> upload to Play Console (internal testing) when the account exists
    android.keystore         -> BACK THIS UP (password vault). Losing it = a new app identity.

  The SHA-256 fingerprint it prints must go on the droplet as ANDROID_ASSETLINKS_SHA256 (comma-
  separated with the Play App Signing fingerprint once Play Console shows one), then
  `docker compose -f docker-compose.cohost.yml up -d`. Without it the app opens with a browser bar.
#>
param(
    [string]$ProjectDir = "C:\Projects\roamhub360-android",
    [string]$Tenants = "",                # comma-separated workspace slugs, e.g. "acme,globex"
    [string]$VersionName = "",            # e.g. 1.0.1 (blank = keep the manifest's value)
    [int]$VersionCode = 0,                # e.g. 2 (0 = keep; Play requires a higher code every upload)
    [switch]$SkipBuild                    # only (re)generate the project + manifest
)

$ErrorActionPreference = "Stop"
$repoAndroid = $PSScriptRoot
$template = Join-Path $repoAndroid "twa-manifest.json"

if (-not $env:BUBBLEWRAP_KEYSTORE_PASSWORD -or -not $env:BUBBLEWRAP_KEY_PASSWORD) {
    throw "Set BUBBLEWRAP_KEYSTORE_PASSWORD and BUBBLEWRAP_KEY_PASSWORD in this shell first (see the header)."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is required (npx @bubblewrap/cli)." }

New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null
Push-Location $ProjectDir
try {
    # 1. Upload keystore (generated once; Play App Signing re-signs for users, this key signs uploads).
    $keystore = Join-Path $ProjectDir "android.keystore"
    if (-not (Test-Path $keystore)) {
        $keytool = Get-Command keytool -ErrorAction SilentlyContinue
        if (-not $keytool) {
            $jdk = Get-ChildItem "$env:USERPROFILE\.bubblewrap\jdk", "$env:ProgramFiles\Java", "$env:ProgramFiles\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue |
                Get-ChildItem -Filter "bin" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($jdk) { $keytool = Get-Command (Join-Path $jdk.FullName "keytool.exe") }
        }
        if (-not $keytool) { throw "keytool not found. Install a JDK 17 (or run 'npx @bubblewrap/cli doctor' once so Bubblewrap installs one) and re-run." }
        Write-Host "Generating upload keystore $keystore" -ForegroundColor Cyan
        & $keytool.Source -genkeypair -v -keystore $keystore -alias roamhub360 -keyalg RSA -keysize 2048 -validity 10000 `
            -storepass $env:BUBBLEWRAP_KEYSTORE_PASSWORD -keypass $env:BUBBLEWRAP_KEY_PASSWORD `
            -dname "CN=RoamHub360, O=TechHub Australia, L=Sydney, ST=NSW, C=AU"
        if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
    }

    # 2. SHA-256 fingerprint of the upload key -> asset links + manifest.
    $ktool = (Get-Command keytool -ErrorAction SilentlyContinue)
    if (-not $ktool -and $env:JAVA_HOME) { $ktool = Get-Command (Join-Path $env:JAVA_HOME "bin\keytool.exe") -ErrorAction SilentlyContinue }
    if (-not $ktool) { $ktool = Get-Command (Join-Path (Get-ChildItem "$env:USERPROFILE\.bubblewrap\jdk" -Directory | Select-Object -First 1).FullName "bin\keytool.exe") }
    $fpLine = (& $ktool.Source -list -v -keystore $keystore -alias roamhub360 -storepass $env:BUBBLEWRAP_KEYSTORE_PASSWORD 2>&1 | Select-String "SHA256:").Line
    $fingerprint = ($fpLine -replace ".*SHA256:\s*", "").Trim().ToUpper()
    if ($fingerprint -notmatch "^([0-9A-F]{2}:){31}[0-9A-F]{2}$") { throw "Could not read the SHA-256 fingerprint from the keystore ($fpLine)" }

    # 3. twa-manifest.json = repo template + tenants + fingerprint (+ optional version bump).
    $m = Get-Content $template -Raw | ConvertFrom-Json
    $origins = @()
    foreach ($t in ($Tenants -split "," | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })) { $origins += "$t.roamhub360.com" }
    $m.additionalTrustedOrigins = $origins
    $m.fingerprints = @(@{ name = "Upload key"; value = $fingerprint })
    if ($VersionName) { $m.appVersionName = $VersionName }
    if ($VersionCode -gt 0) { $m.appVersionCode = $VersionCode }
    $m | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $ProjectDir "twa-manifest.json") -Encoding utf8
    Write-Host "twa-manifest.json written: $($origins.Count) tenant origin(s), version $($m.appVersionName) ($($m.appVersionCode))" -ForegroundColor Cyan

    # 4. Point Bubblewrap at the JDK 17 + Android SDK already on this PC (else its first run asks to
    #    download its own copies). Written once to ~/.bubblewrap/config.json.
    #    Every Bubblewrap command prompts interactively while that file is missing, so it is written
    #    here rather than through the CLI.
    $bwConfig = Join-Path $env:USERPROFILE ".bubblewrap\config.json"
    if (-not (Test-Path $bwConfig)) {
        $jdkPath = if ($env:JAVA_HOME -and (Test-Path $env:JAVA_HOME)) { $env:JAVA_HOME } else { (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
        $sdkPath = if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { $env:ANDROID_HOME } elseif (Test-Path "$env:LOCALAPPDATA\Android\Sdk") { "$env:LOCALAPPDATA\Android\Sdk" } else { $null }
        if ($jdkPath -and $sdkPath) {
            Write-Host "Configuring Bubblewrap: JDK $jdkPath, SDK $sdkPath" -ForegroundColor Cyan
            New-Item -ItemType Directory -Force -Path (Split-Path $bwConfig) | Out-Null
            @{ jdkPath = $jdkPath; androidSdkPath = $sdkPath } | ConvertTo-Json | Set-Content $bwConfig -Encoding utf8
        } else {
            Write-Host "No JDK 17 / Android SDK found — Bubblewrap will offer to install its own (answer Y, then re-run)." -ForegroundColor Yellow
        }
    }

    # 5. Generate / refresh the Android project from the manifest, then build.
    Write-Host "Regenerating Android project (npx @bubblewrap/cli update)..." -ForegroundColor Cyan
    npx --yes @bubblewrap/cli update --skipVersionUpgrade
    if ($LASTEXITCODE -ne 0) { throw "bubblewrap update failed (first run: answer Y to installing the JDK/SDK, then re-run)" }
    if (-not $SkipBuild) {
        Write-Host "Building signed APK + AAB (npx @bubblewrap/cli build)..." -ForegroundColor Cyan
        npx --yes @bubblewrap/cli build --skipPwaValidation
        if ($LASTEXITCODE -ne 0) { throw "bubblewrap build failed" }
    }

    Write-Host ""
    Write-Host "Upload-key SHA-256 (put in the droplet .env as ANDROID_ASSETLINKS_SHA256):" -ForegroundColor Green
    Write-Host "  $fingerprint"
    Write-Host ""
    Write-Host "Outputs in $ProjectDir`:" -ForegroundColor Green
    Get-ChildItem $ProjectDir -Filter "app-release-*" | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length/1MB,1)) MB" }
    Write-Host "Install on a connected phone:  adb install -r `"$(Join-Path $ProjectDir 'app-release-signed.apk')`""
}
finally { Pop-Location }
