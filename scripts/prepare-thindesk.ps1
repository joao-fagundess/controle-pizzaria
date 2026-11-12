# Prepara uma cópia restrita do ZIP para homologação, com configuração e credenciais próprias.
# A configuração original de acesso é excluída do contexto de build.
param(
    [string]$ZipPath = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'thindesk.zip')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cacheRoot = Join-Path $projectRoot '.cache'
$sandboxRoot = Join-Path $cacheRoot 'thindesk-homologation'
$sourceRoot = Join-Path $sandboxRoot 'source'
$propertiesTemplate = [IO.File]::ReadAllText((Join-Path $projectRoot 'integration/thindesk/application.properties'))
$archivePath = (Resolve-Path -LiteralPath $ZipPath).Path
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($archiveHash -ne 'CECBA3087577848DF5A975217F42AEE4821DB30B61E3D0DA326F90AB3E2E73C7') {
    throw 'O ZIP difere da versão inspecionada. Inspecione a nova origem antes de preparar a homologação.'
}
foreach ($directory in @($cacheRoot, $sandboxRoot, $sourceRoot)) {
    if (Test-Path -LiteralPath $directory) {
        if ((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'O diretório de homologação não pode ser um link para outro local.'
        }
    } else { [IO.Directory]::CreateDirectory($directory) | Out-Null }
}
$manifestPath = Join-Path $sandboxRoot 'source-manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
    $existingManifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    if ($existingManifest.archive_sha256 -ne $archiveHash) { throw 'A cópia local pertence a outro ZIP.' }
    foreach ($copied in $existingManifest.copied_files) {
        $existingFile = Join-Path $sourceRoot $copied.path
        if (!(Test-Path -LiteralPath $existingFile) -or (Get-FileHash -LiteralPath $existingFile).Hash -ne $copied.sha256) {
            throw 'A cópia local foi modificada. Preserve as alterações antes de preparar outro ambiente.'
        }
    }
} else {
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    $copiedFiles = [Collections.Generic.List[object]]::new()
    $totalBytes = 0L
    try {
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName
            if ($name -notmatch '^thindesk/(pom\.xml|src/main/java/.+\.java|src/main/resources/templates/.+\.html|src/main/resources/static/.+\.(css|js|png|jpg|svg))$') { continue }
            $relative = $name.Substring('thindesk/'.Length)
            if ($relative -match '(^|/|\\)\.\.(/|\\|$)' -or $relative.Contains('\') -or $relative.Contains(':')) {
                throw 'Caminho inesperado no ZIP.'
            }
            $totalBytes += $entry.Length
            if ($totalBytes -gt 20MB) { throw 'O código selecionado excede o limite de 20 MiB.' }
            $destination = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
            if (![IO.Path]::GetRelativePath($sourceRoot, $destination).StartsWith('..')) {
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
                $inputStream = $entry.Open()
                $outputStream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
                try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
                $copiedFiles.Add(@{ path = $relative; sha256 = (Get-FileHash -LiteralPath $destination).Hash })
            } else { throw 'Extração fora do diretório de homologação recusada.' }
        }
    } finally { $archive.Dispose() }
    if ($copiedFiles.Count -lt 10) { throw 'O ZIP não forneceu os módulos esperados.' }
    [IO.File]::WriteAllText((Join-Path $sourceRoot 'src/main/resources/application.properties'), $propertiesTemplate)
    $manifest = @{ archive_sha256 = $archiveHash; copied_files = $copiedFiles.ToArray(); copied_bytes = $totalBytes;
        excluded = @('application.properties original', 'chamados.json original', 'target/', 'Maven Wrapper', 'arquivos fora da lista permitida');
        generated_configuration = 'src/main/resources/application.properties' }
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8) + "`n")
}
$preparedProperties = [IO.File]::ReadAllText((Join-Path $sourceRoot 'src/main/resources/application.properties'))
if ($preparedProperties.Replace("`r`n", "`n").TrimEnd() -ne $propertiesTemplate.Replace("`r`n", "`n").TrimEnd()) {
    throw 'A configuração da cópia local foi modificada; as alterações foram preservadas.'
}
$environmentPath = Join-Path $sandboxRoot '.env'
if (!(Test-Path -LiteralPath $environmentPath)) {
    function New-HomologationSecret { return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
    $environment = "# Credenciais geradas somente para esta homologação local.`n" +
        "THINDESK_LOGIN_USERNAME=homologacao`nTHINDESK_LOGIN_PASSWORD=$(New-HomologationSecret)`n" +
        "THINDESK_MONGO_PASSWORD=$(New-HomologationSecret)`nTHINDESK_PG_PASSWORD=$(New-HomologationSecret)`n" +
        "THINDESK_API_TOKEN=$(New-HomologationSecret)`nTHINDESK_PORT=8081`nTHINDESK_DASHBOARD_PORT=8180`n"
    $environmentFile = [IO.File]::Open($environmentPath, [IO.FileMode]::CreateNew)
    try { $bytes = [Text.Encoding]::UTF8.GetBytes($environment); $environmentFile.Write($bytes) } finally { $environmentFile.Dispose() }
}
[IO.File]::WriteAllText((Join-Path $sourceRoot '.dockerignore'), "target/`n.env`n.env.*`n*.log`n")
Write-Output 'Cópia de homologação preparada em .cache/thindesk-homologation/source.'
Write-Output 'Credenciais locais em .cache/thindesk-homologation/.env; valores preservados e não exibidos.'
