<div align="center">

![DSH to Figma](https://raw.githubusercontent.com/Duoasa/DSH-to-Figma/main/assets/readme-hero.gif)

# DSH to Figma

**自然言語で Figma のデザインを読み取り、作成・編集。**

[![npm](https://img.shields.io/npm/v/dsh-to-figma)](https://www.npmjs.com/package/dsh-to-figma)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)

[简体中文](README.md) · [English](README.en.md) · **日本語**

[機能](#機能) · [実機デモ](#実機デモ) · [プロンプトでインストール](#プロンプトでインストール) · [npm からインストール](#npm-からインストール)

</div>

DeepSeek Harness と Figma を接続。ローカルプラグインを標準経路とし、公式 MCP 接続にも対応します。ローカルモードは公式 Figma MCP の呼び出し枠を消費しません。

## 機能

- **キャンバスの読み取り**：選択範囲、ページ、レイヤー、テキスト、寸法、レイアウト、スタイル、コンポーネント情報。名前・属性・ページで検索。
- **UI の作成・編集**：要件からの生成、スクリーンショットの再現、既存 UI からの派生ページ作成、ネイティブノードと JSON シーンの読み込み。
- **レイアウトと操作**：Auto Layout、固定サイズ・位置、制約、重なり、レイヤーロック、プロトタイプの操作。
- **コンポーネントとデザインシステム**：コンポーネント、セット、バリアント、インスタンス属性とオーバーライド。コンポーネント・スタイル・アクセス可能なチーム変数ライブラリの検索と再利用。
- **変数とテーマ**：変数作成、モード追加、値・エイリアスの設定、変数のバインド、依存関係とモード情報の読み取り。
- **デザイン参照**：仕様やアートボードの紐付け・変更・解除。プラグインに名前とサムネイルを表示し、DSH と双方向で変更を同期。
- **デザイン仕様**：ローカルのビジュアル仕様の抽出・保存・編集。エディターが API を提供する場合、ネイティブ Specs 文書とコメントを読み書き。
- **フォントとアイコン**：フォント検索、一括解決と代替フォント選択、内蔵ベクターアイコン。
- **スクリーンショットと参照画像の比較**：必要に応じた画像返却、サイズ指定、並列・重ね合わせ画像、ピクセル・色の差分、主要レイアウト属性の読み取り。
- **デザイン差分**：スナップショットと基準を保存し、構造・スタイル・内容の変更を比較。
- **素材の入出力**：画像・SVG の読み込み、画像塗りの置換、PNG・JPG・SVG・PDF の書き出し、元画像の抽出、ノードとファイルの対応付け。
- **ネイティブモーション**：キーフレーム、文字アニメーション、アニメーションスタイル、タイムラインの編集。モーションの読み取りと一部属性の CSS 変換。
- **動画出力**：エディターのネイティブ API による MP4・GIF・WebM の書き出し。
- **FigJam**：ボードの読み取り、編集可能な図形・テキスト・接続線の作成。構造化データと Mermaid フローチャートのサブセットに対応。
- **Slides**：接続中のプレゼンテーションに、編集可能なスライド、タイトル、本文、テーマレイアウト、ノートを作成。
- **Shaders**：利用可能な Shader の検索、ファイル内の使用箇所の確認、既存 Shader の読み込みと適用。
- **Web ページの読み込み**：ローカルブラウザーでページを取得し、対応する DOM 内容を編集可能なレイヤーへ変換。
- **デザインからコードへ**：意味情報を含むデザイン構造、CSS、素材の取得。プロジェクトのコンポーネント・Token・アイコン索引と、ローカルのコンポーネント／コード対応付け。
- **コードレイヤーの読み取り**：既存 Code Layers の公開された外部属性を取得。
- **スクリプトと一括操作**：キャンバススクリプト、一括編集、ローカルレシピ、段階的タスク、チェックポイントからの再開。
- **エラー回復**：構造化エラーと修正案、操作状態、書き込みログ、冪等性、対象範囲の確認、失敗した操作が作成した条件適合ノードの削除。
- **接続とヘルプ**：ペアリング済みプラグインの生成、ファイル選択、再接続、機能照会、実行状態、呼び出し時間、内蔵ガイド。
- **MCP 接続**：公式デスクトップ・リモート MCP、認証、ツール検出、リソースとプロンプトの取得。

## 実機デモ

[DSH to Figma 0.4.1 — Figma で UI とモーションを作成（X 長文記事・中国語）↗](https://x.com/double_asa/status/2120059438002561341)

## プロンプトでインストール

次の文章を DSH に送ってください。

```text
DSH to Figma をインストール、または更新してください。
https://github.com/Duoasa/DSH-to-Figma

docs/setup.md に従い、現在のホストの CLI、profile、DSH_HOME を使用してください。
dsh-to-figma@latest をインストールし、既存設定を保持して local モードを使ってください。
figma_setup を実行し、ローカルの manifest.json のパスと Figma への導入手順を案内してください。
導入済みなら同じフォルダーを更新し、Figma プラグインの再実行を案内してください。
最後に figma_status で接続を確認してください。
```

## npm からインストール

**macOS DSH Desktop** ではアプリ同梱の CLI を使用します。

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add dsh-to-figma@latest
```

**その他の DSH ホスト** では対応する CLI と profile を使用します。

```sh
dsh plugin --profile <使用中のprofile> add dsh-to-figma@latest
```

本バージョンに固定する場合は `dsh-to-figma@0.4.1` を使います。npm アカウントは不要です。DSH のプラグイン管理コマンドでインストールと有効化を行います。

1. DSH で **DSH to Figma** を有効にし、`figma_setup` で連携プラグインを生成します。
2. Figma Desktop の **Plugins → Development → Import plugin from manifest…** から、返された `manifest.json` を選びます。
3. 対象ファイルでプラグインを実行し、ウィンドウを開いたまま、DSH の `figma_status` で接続を確認します。

更新時も同じインストールコマンドを使い、`figma_setup` を実行してから Figma プラグインを閉じ、再実行します。

## ドキュメントと貢献

[接続とトラブル対応](docs/setup.md) · [機能の詳細](CAPABILITIES.md) · [変更履歴](CHANGELOG.md) · [問題を報告](https://github.com/Duoasa/DSH-to-Figma/issues)

フィードバックと貢献をいただいた [heeq666](https://github.com/heeq666)、[miztizm](https://github.com/miztizm) に感謝します。

[MIT](LICENSE) · Copyright © 2026 Duoasa.
