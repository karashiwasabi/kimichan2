# スクリプトが置かれているディレクトリを基準に動作
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# プロジェクト名を取得 (現在のディレクトリ名)
$projectName = (Get-Item -Path $baseDir).Name

# バックアップ用ディレクトリのパスを定義
$backupDir = Join-Path -Path $baseDir -ChildPath "saucebackup"

# 出力ファイルのパスを定義
$outputFile = Join-Path -Path $backupDir -ChildPath "${projectName}_source_full.txt"

# saucebackupディレクトリがなければ作成
if (-not (Test-Path -Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

# 出力ファイルが存在すれば一旦空にする
Clear-Content -Path $outputFile -ErrorAction SilentlyContinue

# 対象となるファイルの拡張子を指定
# ここに html, css, js などを追加しました。dbファイルは含まれません。
$includePatterns = @("*.go", "go.mod", "go.sum", "*.html", "*.css", "*.js", "*.json")

# 除外したいディレクトリ（バックアップフォルダやgit管理フォルダなど）
$excludeDirs = @("saucebackup", ".git", ".vscode")

Write-Host "ソースコードの出力を開始します..."

# ファイルを検索し、内容を追記していく
Get-ChildItem -Path $baseDir -Recurse -File -Include $includePatterns | Where-Object {
    # 除外ディレクトリに含まれるファイルはスキップする処理
    $dirPath = $_.DirectoryName
    $shouldExport = $true
    foreach ($exclude in $excludeDirs) {
        if ($dirPath -like "*\$exclude*" -or $dirPath -like "*\$exclude") {
            $shouldExport = $false
            break
        }
    }
    $shouldExport
} | ForEach-Object {
    $filePath = $_.FullName
    
    # コンソールに進捗を表示
    Write-Host "Exporting: $($_.Name)"

    "----- $($filePath) -----`r`n" | Add-Content -Path $outputFile
    
    # 文字コード等の問題を防ぐためUTF8で読み書きするよう明示しても良いですが、
    # Raw指定で元のスクリプトの挙動を維持します。
    Get-Content -Path $filePath -Raw | Add-Content -Path $outputFile
    
    "`r`n" | Add-Content -Path $outputFile
}

Write-Host "--------------------------------------------"
Write-Host "ソースコードの書き出しが完了しました。"
Write-Host "出力先: $outputFile"
Write-Host "--------------------------------------------"