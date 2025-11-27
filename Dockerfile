# 1. Goの公式イメージ（バージョン1.24）をベースにする
FROM golang:1.24

# 2. コンテナ内の作業場所を決める
WORKDIR /app

# 3. 依存関係のファイルを先にコピーしてダウンロード（キャッシュ利用のため）
COPY go.mod go.sum ./
RUN go mod download

# 4. ソースコードを全てコンテナ内にコピー
COPY . .

# 5. SQLiteを使うためにCGOを有効化してビルド
# （Linux用の実行ファイル "main" を作る）
ENV CGO_ENABLED=1
ENV GOOS=linux
RUN go build -o main .

# 6. ポート8080を開ける
EXPOSE 8080

# 7. アプリを起動するコマンド
CMD ["./main"]