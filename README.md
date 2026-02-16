# tudoh — バーチャルオフィス

Gather の代替となるセルフホスト型バーチャルオフィス。
2D マップ上でアバターを操作し、部屋単位で音声通話ができる。

## 要件

- 2D マップ上でアバターをキーボード操作で移動
- 複数ユーザーのリアルタイム位置同期（10Hz tick、差分送信）
- 部屋単位のグループ音声通話（入室で自動接続、退室で切断）
- 最大 100 人同時接続、部屋あたり上限 20 人
- ビデオ通話・画面共有は対象外（Meet で代替）

## アーキテクチャ

```
ブラウザ (Canvas API) ←── WebSocket (位置同期) ──→ Bun サーバー
                      ←── WebRTC (音声 via SFU) ──→ LiveKit (Docker)
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロント描画 | Canvas API |
| フロント音声 | LiveKit Client SDK |
| バックエンド | Bun (組み込み WebSocket) |
| SFU | LiveKit (セルフホスト) |
| 言語 | TypeScript |

## 開発

```sh
docker compose up --build
# http://localhost:5173
```
