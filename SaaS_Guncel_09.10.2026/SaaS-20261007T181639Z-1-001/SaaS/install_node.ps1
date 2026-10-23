# $version = 'v24.21.0'
# $zipName = "node-$version-win-x64.zip"
# $url = "https://nodejs.org/dist/$version/$zipName"
# $destDir = "$env:LOCALAPPDATA\Programs\nodejs"
# $zipPath = "$env:TEMP\$zipName"

# Write-Host "Downloading Node.js $version from $url ..."
# [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

# Write-Host "Extracting to $destDir ..."
# if (Test-Path $destDir) { Remove-Item -Recurse -Force $destDir }
# New-Item -ItemType Directory -Force -Path $destDir | Out-Null
# Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\node_extract" -Force
# Copy-Item -Path "$env:TEMP\node_extract\node-$version-win-x64\*" -Destination $destDir -Recurse -Force

# Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
# Remove-Item -Recurse -Force "$env:TEMP\node_extract" -ErrorAction SilentlyContinue

# Write-Host "Adding to User PATH..."
# $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
# if ($userPath -notlike "*$destDir*") {
#     [Environment]::SetEnvironmentVariable('Path', "$destDir;$userPath", 'User')
# }
# Write-Host "Node installed successfully!"
