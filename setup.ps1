param([switch]$CheckOnly)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$localDirectory = Join-Path $projectRoot ".local"
$slskdDirectory = Join-Path $localDirectory "slskd"
$dataDirectory = Join-Path $localDirectory "data"
$songsDirectory = Join-Path $projectRoot "songs"
$incompleteDirectory = Join-Path $dataDirectory "incomplete"
$envFile = Join-Path $projectRoot ".env"
$configFile = Join-Path $dataDirectory "slskd.yml"
$slskdExe = Join-Path $slskdDirectory "slskd.exe"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-NewFile([string]$Path, [string]$Content) {
    # Never replace an existing configuration file.
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew)
    try {
        $bytes = $utf8.GetBytes($Content)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Dispose()
    }
}

function ConvertTo-YamlString([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

try {
    if ($env:OS -ne "Windows_NT") {
        throw "This setup script supports Windows only."
    }
    if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Install Node.js 22.12 or newer, then run setup again."
    }
    $nodeVersion = & node.exe --version
    if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion.TrimStart("v") -lt [version]"22.12.0") {
        throw "Node.js 22.12 or newer is required."
    }

    $hasFFmpeg = $null -ne (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)
    Write-Host "Node.js: $nodeVersion"
    Write-Host "FFmpeg available: $hasFFmpeg"
    Write-Host "slskd installed: $(Test-Path -LiteralPath $slskdExe)"
    Write-Host "Bot configuration exists: $(Test-Path -LiteralPath $envFile)"
    Write-Host "slskd configuration exists: $(Test-Path -LiteralPath $configFile)"

    if ($CheckOnly) { exit 0 }

    if (!$hasFFmpeg) {
        throw "Install FFmpeg and add its bin directory to PATH, then run setup again."
    }
    if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm.cmd was not found. Repair your Node.js installation."
    }

    Push-Location $projectRoot
    try {
        Write-Host "Installing bot dependencies..."
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed. Run setup again after fixing the npm error." }
    } finally {
        Pop-Location
    }

    foreach ($directory in @($localDirectory, $slskdDirectory, $dataDirectory, $songsDirectory, $incompleteDirectory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    if (!(Test-Path -LiteralPath $slskdExe)) {
        $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
        if ($architecture -eq "x64") { $platform = "win-x64" }
        elseif ($architecture -eq "arm64") { $platform = "win-arm64" }
        else { throw "Unsupported Windows architecture: $architecture" }

        $version = "0.26.2"
        $archive = Join-Path $localDirectory "slskd-$version-$platform.zip"
        $url = "https://github.com/slskd/slskd/releases/download/$version/slskd-$version-$platform.zip"
        Write-Host "Downloading slskd $version from GitHub..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
        Expand-Archive -LiteralPath $archive -DestinationPath $slskdDirectory -Force
        if (!(Test-Path -LiteralPath $slskdExe)) { throw "The slskd download did not contain slskd.exe." }
        Remove-Item -LiteralPath $archive
    } else {
        Write-Host "Keeping the existing slskd installation."
    }

    $apiKey = [guid]::NewGuid().ToString("N")
    $hasEnv = Test-Path -LiteralPath $envFile
    $hasConfig = Test-Path -LiteralPath $configFile

    if ($hasEnv -and !$hasConfig) {
        $match = [regex]::Match([IO.File]::ReadAllText($envFile), '(?m)^SLSKD_API_KEY=([A-Za-z0-9_-]{16,255})\s*$')
        if (!$match.Success) {
            throw "Existing .env has no simple API key to reuse. Set SLSKD_API_KEY to a 16-255 character unquoted key, then run setup again. Existing files were preserved."
        }
        $apiKey = $match.Groups[1].Value
    }
    if ($hasConfig -and !$hasEnv) {
        throw "slskd.yml already exists. Create .env from .env.example and enter its matching API key, then run setup again. Existing configuration was preserved."
    }

    if (!$hasEnv) {
        Write-NewFile $envFile "DISCORD_TOKEN=`r`nSLSKD_URL=http://127.0.0.1:5030`r`nSLSKD_API_KEY=$apiKey`r`n"
        Write-Host "Created .env. Enter your Discord bot token locally."
    } else {
        Write-Host "Keeping the existing .env."
    }

    if (!$hasConfig) {
        $webPassword = [guid]::NewGuid().ToString("N")
        $downloadsPath = ConvertTo-YamlString $songsDirectory
        $incompletePath = ConvertTo-YamlString $incompleteDirectory
        $config = @"
directories:
  downloads: $downloadsPath
  incomplete: $incompletePath
web:
  ip_address: 127.0.0.1
  https:
    disabled: true
  authentication:
    username: botdylan
    password: '$webPassword'
    api_keys:
      botdylan:
        key: '$apiKey'
        role: readwrite
        cidr: 127.0.0.1/32
soulseek:
  username: ''
  password: ''
"@
        Write-NewFile $configFile $config
        Write-Host "Created .local/data/slskd.yml. Enter your Soulseek username and password locally."
    } else {
        Write-Host "Keeping the existing slskd.yml."
    }

    Write-Host ""
    Write-Host "Setup complete. Configuration files and credentials stay local."
    Write-Host "1. Fill any empty credentials in .env and .local/data/slskd.yml."
    Write-Host "2. Enable Message Content Intent and invite the bot to Discord."
    Write-Host "3. From the project folder, start slskd:"
    Write-Host '   .\.local\slskd\slskd.exe --app-dir .\.local\data'
    Write-Host "4. In another terminal, run: npm.cmd start"
    Write-Host "If Windows Firewall asks, allow slskd TCP port 50300 and Node.js voice traffic."
} catch {
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
