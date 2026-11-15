$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $workspace 'docker-compose.attachments-test.yml'
$testProject = 'fixit-us009-it-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$previousPhase = $env:FIXIT_ATTACHMENT_PHASE

function Assert-ExitCode([string] $operation) {
    if ($LASTEXITCODE -ne 0) { throw "$operation failed with exit code $LASTEXITCODE. Test resources were retained: $testProject" }
}

try {
    Write-Output "Isolated project: $testProject"
    $existingContainers = docker ps -a --filter "label=com.docker.compose.project=$testProject" --format '{{.ID}}'
    Assert-ExitCode 'Inspect containers'
    $existingVolumes = docker volume ls --filter "label=com.docker.compose.project=$testProject" --format '{{.Name}}'
    Assert-ExitCode 'Inspect volumes'
    if ($existingContainers -or $existingVolumes) { throw 'Project collision; refusing to reuse resources.' }

    $env:FIXIT_ATTACHMENT_PHASE = 'write'
    docker compose -f $composeFile -p $testProject config --quiet
    Assert-ExitCode 'Validate isolated Compose'
    docker compose -f $composeFile -p $testProject up --build --abort-on-container-exit --exit-code-from api-test api-test
    Assert-ExitCode 'PostgreSQL and file integration tests'
    $firstContainer = docker compose -f $composeFile -p $testProject ps -a -q api-test
    Assert-ExitCode 'Inspect first API test container'
    if (-not $firstContainer) { throw 'Missing first API test container.' }

    $env:FIXIT_ATTACHMENT_PHASE = 'read'
    docker compose -f $composeFile -p $testProject up --no-build --force-recreate --abort-on-container-exit --exit-code-from api-test api-test
    Assert-ExitCode 'Persistence after container recreation'
    $secondContainer = docker compose -f $composeFile -p $testProject ps -a -q api-test
    Assert-ExitCode 'Inspect recreated API test container'
    if (-not $secondContainer -or $firstContainer -eq $secondContainer) { throw 'API test container was not recreated.' }
    Write-Output "Persistence verified across different containers: $firstContainer -> $secondContainer"
}
finally {
    $env:FIXIT_ATTACHMENT_PHASE = $previousPhase
    Write-Output "Resources retained for review; no volumes removed. Project: $testProject"
    Write-Output "Compose file: $composeFile"
}
