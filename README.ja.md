<div align="center">

![DSH to Figma — デザイン・編集・開発](assets/readme-hero.png)

# DSH to Figma

**Figma のキャンバス操作を DeepSeek Harness に。**

DSH のネイティブプラグインと、自動ペアリングされる Figma プラグインで、キャンバスの読み取り・編集・スクリーンショット取得ができます。初回にインポートすれば、次回からは起動するだけで接続できます。

[![Checks](https://github.com/Duoasa/DSH-to-Figma/actions/workflows/ci.yml/badge.svg)](https://github.com/Duoasa/DSH-to-Figma/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-native%20plugin-536DFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Stage](https://img.shields.io/badge/status-preview-orange)](docs/verification.md)

[简体中文](README.md) · [English](README.en.md) · **日本語**

[活用例](#活用例) · [クイックスタート](#クイックスタート) · [ツール](#ツール) · [設定](#設定) · [検証記録](docs/verification.md)

</div>

## DSH to Figma の特徴

- **ローカルモードでは Figma 公式 MCP の呼び出し枠を消費しません。** ローカルの連携プラグインで読み取り・編集・スクリーンショット・エクスポートを繰り返せます。
- **DSH にネイティブ統合。** ツール、スキル、画像添付にホストの拡張機構を使用します。検証済みの DSH コアは **0.2.0-rc.2** と **0.2.1-rc.2** です。ホストのバージョンによる読み込み制限は設けず、後続バージョンで実際に互換性の問題が発生した場合に修正します。
- **編集できるデザインを作成。** 公開 Figma Plugin API を使い、フレーム、テキスト、オートレイアウト、コンポーネント、バリアント、スタイル、変数を作成・変更します。
- **デザインからコードへ。** レイヤー、レイアウト、CSS、素材を読み取り、ホストの Agent が現在のワークスペースで実装します。
- **画像で確認。** スクリーンショットを DSH の画像添付として返します。画像非対応モデルには、その制約を明示します。
- **推奨手順ではキーのコピーが不要。** DSH がこの端末専用のペアリング済みプラグインを生成します。

**0.2.1 は実際の Figma Design で検証済み：** 自動ペアリング、単一ファイルへの接続、フレームとテキストの作成、独立した読み戻しと更新、スクリーンショット、PNG エクスポートを確認しました。全機能・全エディターの検証を意味するものではありません。[検証記録](docs/verification.md)をご覧ください。

## 活用例

以下は既定のローカルモードでの使い方です。対象ファイルで Figma プラグインを起動し、ウィンドウを開いたままにしてください。

| 用途 | Agent への依頼例 |
| --- | --- |
| 既存 UI からフロントエンドを実装 | 選択したログイン画面を読み取り、現在のプロジェクトの構成とコンポーネントを確認してから実装してください。 |
| 画像や要件から編集可能な UI を作成 | 幅 1440、高さ 900 のタスク管理画面を、編集可能なテキストとオートレイアウトで作成してください。 |
| 一括編集と反復作業 | このフレームの主要ボタンを高さ 40px、角丸 8px にし、文字のはみ出しを確認してスクリーンショットを返してください。 |
| コンポーネントと変数を活用 | このページのボタンと入力欄、ファイル内の色変数を調べ、それらを使って設定画面を作成してください。 |
| 素材を開発に引き渡す | このフレームで使うアイコンと画像を書き出し、プロジェクトの素材ディレクトリに整理してください。 |

プラグインはデザイン情報と素材を提供し、コードの実装はホストのモデルとワークスペースツールが担当します。自動双方向同期ではありません。デザインシステムの検索は実装されたローカル範囲が対象で、クラウド全体の検索ではありません。ローカルのコンポーネント参照は公式 Code Connect マッピングとは異なります。

### 実際の作成例

2026-10-18 に実行した、参照画像から編集可能な UI を作る例です。

![DSH への参照画像と指示](assets/examples/screenshot-to-ui-prompt.png)

![Figma 上の編集可能なレイヤー](assets/examples/screenshot-to-ui-figma.png)

画面は 1440 × 900 のフレーム内に作成され、テキストや図形を個別に編集できます。この例は全機能の検証やピクセル単位の一致を保証するものではありません。

## クイックスタート

対応する DSH ホストと、開発プラグインをインポートできる Figma デスクトップアプリを用意してください。推奨手順では Git や手動のビルドは不要です。

### 1. DSH パッケージをインストール

[Releases](https://github.com/Duoasa/DSH-to-Figma/releases/latest) から **dsh-to-figma-0.2.3.tgz** をダウンロードし、同じリリースの `SHA256SUMS` で確認します。**npm には公開していません。** 使用中のホストの CLI で Release の URL から直接インストールできます。

```sh
dsh plugin --profile web add https://github.com/Duoasa/DSH-to-Figma/releases/download/v0.2.3/dsh-to-figma-0.2.3.tgz
```

`web` は実際の profile 名に置き換えます。公式 macOS DSH Desktop では、アプリに同梱された CLI を使用します。

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "file:/absolute/path/dsh-to-figma-0.2.3.tgz"
```

**プラグイン → DSH to Figma** で実行中になっていることを確認し、自動で再読み込みされない場合はホストを再起動します。別途インストールした古い `dsh` CLI では `desktop` profile を管理できない場合があります。旧開発版と現行版を同時に有効にしないでください。

### 2. ペアリング済み Figma プラグインをインポート

DSH に次のように依頼します。

> figma_setup を実行し、ペアリング済みプラグインの manifest のパスを教えてください。キーを表示したり、生成されたコードを読み取ったりしないでください。

既定の DSH home では、次の場所に生成されます。実際の場所は `figma_setup` の結果を使用してください。

```text
~/.dsh/figma/companion/manifest.json
```

1. Figma デスクトップで **Plugins → Development → Import plugin from manifest…** を選びます。
2. 生成された manifest を指定します。macOS では **⌘⇧G** でパスを入力できます。
3. 対象の Design ファイルを開き、**DSH to Figma · Local** を実行します。
4. 自動接続後もプラグインのウィンドウを開いたままにします。

生成されたディレクトリを移動・削除しないでください。DSH プラグイン更新後は Figma プラグインを再実行します。生成された専用プラグインと `DSH-to-Figma-paired.zip` には端末の認証情報が含まれるため、公開・共有しないでください。

### 3. 接続を確認して使う

> figma_status で接続を確認し、接続中の Figma ファイルに「Hello from DSH」という見出しの独立したオートレイアウトカードを作成してください。ノード ID を返し、読み戻してスクリーンショットを取得してください。既存のデザインは変更しないでください。

接続ファイルが一つなら最初の操作で自動選択されます。複数ある場合は対象を明示します。書き込み失敗時は一部が変更済みの可能性があるため、確認してから再試行してください。

**0.1.5 からの更新：** 明示的に `backend: desktop` を設定している場合、`local` に変更して再起動・再読み込みします。既存設定はパッケージの既定値では上書きされません。

### 手動ペアリングの代替手順

公開リリースの `DSH-to-Figma-companion-0.2.3.zip` は認証情報を含まない汎用パッケージで、手動ペアリング用です。推奨手順では不要です。DSH が生成する専用版を使用してください。詳しくは[セットアップガイド](docs/setup.md)をご覧ください。

## ツール

ローカルモードは `mcp__figma__…` という名前の **17 個のキャンバスツール**と、5 個の接続・ガイド用ツールを提供します。

| 用途 | ツール |
| --- | --- |
| キャンバススクリプト | `use_figma`, `import_scene` |
| 構造の確認 | `get_selection`, `list_fonts`, `get_metadata` |
| 画像とデザイン情報 | `get_screenshot`, `get_design_context`, `get_figjam` |
| デザインシステム | `get_variable_defs`, `get_libraries`, `search_design_system`, `get_component_context` |
| コンポーネントとコードの参照 | `get_local_component_links`, `set_local_component_links` |
| モーション情報 | `get_motion_context` |
| 素材の転送 | `upload_assets`, `download_assets` |
| 接続とガイド | `figma_setup`, `figma_status`, `figma_select_document`, `figma_read_guide`, `figma_reconnect` |

`figma-workbench` スキルと用途別ガイドを同梱しています。クラウド専用機能との差は[機能一覧](CAPABILITIES.md)をご覧ください。FigJam / Slides を含むエディター別の実機検証は未完了です。

## 設定

ホストのプラグイン設定で `dsh-figma` エントリーを設定します。以下はエントリー内の config フィールドです。

| フィールド | 既定値 | 用途 |
| --- | --- | --- |
| `backend` | `local` | `local`, `desktop`, `remote` |
| `bridgePort` | `3055` | ローカルブリッジのポート |
| `desktopServerUrl` | `http://127.0.0.1:3845/mcp` | 公式デスクトップ MCP |
| `toolCallTimeoutMs` | `120000` | タイムアウト。設定範囲は 1–300 秒 |
| `oauthClientId` | 空 | 必要な場合、承認されたリモート OAuth client ID |

- **local：** 既定のモード。自動生成した Figma プラグイン経由で接続します。
- **desktop：** Figma の公式デスクトップ MCP を有効にします。読み取りとスクリーンショット用で、`use_figma` による書き込みには対応しません。
- **remote：** `dsh-figma login` で認証します。利用できる機能は Figma のクライアント承認、アカウント、席位、実際のツール一覧に依存します。Codex の認証情報は流用しません。
- **無効化：** ホストのプラグイン管理を使用するか、環境変数 `DSH_FIGMA_DISABLED=1` を設定して起動します。

複数ホストでは異なるポートと、それぞれが生成したプラグインを使用してください。ポートを変更した場合は DSH を再起動し、必要に応じて生成されたプラグインを再実行・再インポートします。

## データと実行

ローカルブリッジは loopback のみで待ち受け、Host / Origin とペアリングキーを確認します。認証情報はローカルの非公開ファイルに保存し、Figma 文書には保存しません。OAuth 認証情報は OS キーチェーンでは暗号化されていません。

スクリプトは Figma エディター内で実行され、DSH 側はホストプロセスの権限で動作します。同じ文書への操作は順番に実行されますが、キャンバスの変更はトランザクションではありません。結果不明の書き込みは自動再実行しません。

素材のアップロード元は現在の Work ワークスペース内に限定され、エクスポート先は新しい `.figma/assets/<batch>/` ディレクトリです。スクリーンショットは会話の一部として設定済みのモデル提供元に送信される場合があります。

## 開発

開発環境には Node **24+** を使用してください。

```sh
npm ci --ignore-scripts
npm run test:all
npm pack --ignore-scripts
```

`check` は `companion/code.js` を再生成し、構文とパッケージを検証します。自動テスト内の Figma API は fixture を使用します。実際のエディターでの結果は[検証記録](docs/verification.md)で区別しています。

問題を報告する際は DSH のバージョン、backend、再現手順とエラーを添え、キーや非公開のデザイン情報は削除してください。

## 謝辞とライセンス

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[Figma Plugin API](https://developers.figma.com/docs/plugins/api/figma/)、[Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) を使用しています。

README の構成は [dsh-context](https://github.com/bowenliang123/dsh-context)、[dsh-plugin-shop](https://github.com/LivXue/dsh-plugin-shop)、[dsh-openpencil](https://github.com/ZSeven-W/dsh-openpencil) を参考にしています。これらのコードやスクリーンショットは同梱していません。

[MIT](LICENSE) · Copyright © 2026 Duoasa.
