# vue-grab アーキテクチャ

このドキュメントでは、vue-grab の内部設計と各モジュールの責務を解説します。

## 全体構成

```
vue-grab/
├── src/
│   ├── index.ts        # Vue 3 プラグイン（エントリポイント）
│   ├── core.ts         # コアロジック（ツリーウォーキング、オーバーレイ、プロンプト生成）
│   └── composable.ts   # useVueGrab() Composable API
├── index.html          # 開発用デモページ
├── vite.config.ts      # Vite ビルド設定（ライブラリモード）
├── tsconfig.json       # TypeScript 設定
└── package.json
```

## モジュール構成と依存関係

```
┌─────────────────────────────────────────────────────┐
│                   ユーザーアプリ                       │
│                                                     │
│  app.use(VueGrab)  /  useVueGrab()  /  activate()   │
└────────┬──────────────────┬──────────────┬──────────┘
         │                  │              │
         ▼                  ▼              │
┌─────────────────┐  ┌──────────────┐     │
│   index.ts      │  │ composable.ts│     │
│   (Plugin)      │  │ (Composable) │     │
│                 │  │              │     │
│ - install()     │  │ - useVueGrab │     │
│ - provide/inject│  │ - ref 管理   │     │
│ - globalProps   │  │ - onUnmounted│     │
└────────┬────────┘  └──────┬───────┘     │
         │                  │              │
         ▼                  ▼              ▼
┌──────────────────────────────────────────────────┐
│                    core.ts                        │
│                                                  │
│  ┌──────────────┐  ┌────────────────────────┐    │
│  │ ツリーウォーカ  │  │ オーバーレイレンダラ      │    │
│  │              │  │                        │    │
│  │ walkComponent│  │ showOverlay()          │    │
│  │ Tree()       │  │ showBanner()           │    │
│  │ getVueInst() │  │ hideOverlay()          │    │
│  │ getComponent │  │ removeAllUI()          │    │
│  │ Name()       │  │ ensureStyles()         │    │
│  └──────────────┘  └────────────────────────┘    │
│                                                  │
│  ┌──────────────┐  ┌────────────────────────┐    │
│  │ プロンプト生成 │  │ グラブモードコントローラ   │    │
│  │              │  │                        │    │
│  │ formatPrompt │  │ activate() / deactivate│    │
│  │ ()           │  │ toggle()               │    │
│  │              │  │ isGrabActive()         │    │
│  │              │  │ setupShortcut()        │    │
│  └──────────────┘  └────────────────────────┘    │
└──────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│         Vue 3 内部 API（開発モード）                │
│                                                  │
│  element.__vueParentComponent                    │
│  ├── .type.__name / .type.name   → コンポーネント名│
│  ├── .type.__file               → ファイルパス     │
│  ├── .vnode.loc.start.line      → 行番号          │
│  ├── .props                     → Props          │
│  └── .parent                    → 親コンポーネント  │
└──────────────────────────────────────────────────┘
```

## 各モジュールの詳細

### `src/core.ts` — コアロジック

全てのフレームワーク非依存ロジックが集約されたモジュールです。Vue のランタイム (`vue` パッケージ) をインポートしません。

#### コンポーネントツリーウォーカ

Vue 3 の開発モードでは、各 DOM 要素に `__vueParentComponent` プロパティが付与されます。これは Vue の内部コンポーネントインスタンス (`VueInternalInstance`) への参照です。

```
DOM Element
  └── __vueParentComponent: VueInternalInstance
        ├── type.__name: "MyComponent"     ← SFC のコンパイル時に設定
        ├── type.name: "MyComponent"       ← defineComponent の name
        ├── type.__file: "/src/MyComp.vue" ← Vite が注入
        ├── vnode.loc.start.line: 42       ← テンプレートコンパイラが付与
        ├── props: { title: "Hello" }      ← ランタイム Props
        └── parent: VueInternalInstance    ← 親コンポーネント
              └── parent: ...              ← ルートまで辿れる
```

**`walkComponentTree(el: HTMLElement): ComponentInfo[]`**

1. 引数の DOM 要素から `__vueParentComponent` を取得
2. 見つからなければ `parentElement` を辿って最も近い Vue コンポーネントを探す
3. 見つかったら `instance.parent` チェーンを辿ってルートまで全てのコンポーネント情報を収集
4. 結果は「最も近いコンポーネント → ルート」の順で配列として返す

**コンポーネント名の解決優先順位:**

1. `instance.type.__name` — `<script setup>` 使用時にコンパイラが自動設定
2. `instance.type.name` — `defineComponent({ name: '...' })` で明示設定
3. `instance.type.__file` からファイル名を抽出 — 上記がない場合のフォールバック
4. `'Anonymous'` — いずれも取得できない場合

#### オーバーレイレンダラ

グラブモード中の UI を DOM に直接レンジする軽量レンダラです。Vue のレンダリングパイプラインを経由しないため、ホストアプリに干渉しません。

**UI 要素:**

| 要素 | ID | z-index | 役割 |
|------|-----|---------|------|
| バナー | `__vue-grab-banner` | 999999 | 画面上部のグラデーションバー + ステータスメッセージ |
| オーバーレイ | `__vue-grab-overlay` | 999998 | ホバー中の要素をハイライトする半透明ボックス |
| ツールチップ | `__vue-grab-tooltip` | 999999 | コンポーネント名・ファイルパスを表示するポップアップ |

**スタイリング方針:**
- 全スタイルを `<style>` 要素として動的に挿入（ID: `__vue-grab-styles`）
- `position: fixed` でビューポート基準の配置
- `pointer-events: none` でユーザーのインタラクションを阻害しない
- Vue のブランドカラー `#42b883` を基調としたデザイン
- グラブモード中は `body` に `.vue-grab-active` クラスを付与し、全要素のカーソルを `crosshair` に変更

#### プロンプトフォーマッタ

**`formatPrompt(result): string`**

グラブ結果を AI アシスタント向けの Markdown テキストに整形します:

1. 要素情報（タグ名、クラス、テキスト内容）
2. コンポーネントツリー（インデント付きの階層表示）
3. 各コンポーネントのファイルパス・行番号・Props
4. 末尾に変更指示を促すプロンプト文

#### グラブモードコントローラ

モジュールレベルのシングルトン状態（`isActive`, `currentOptions`）で管理します。

**状態遷移:**

```
[非アクティブ] ──activate()──→ [アクティブ]
     ↑                              │
     │                              │
     └──deactivate()────────────────┘
                                    │
              ← click（要素グラブ） ──┘
              ← Escape キー ────────┘
```

**アクティブ時のイベントリスナー（capture フェーズ）:**

| イベント | ハンドラ | 動作 |
|---------|---------|------|
| `mousemove` | `handleMouseMove` | ホバー要素のオーバーレイ表示を更新 |
| `click` | `handleClick` | 要素をグラブ → コールバック呼び出し → クリップボードコピー → deactivate |
| `keydown` | `handleKeyDown` | Escape で deactivate |

capture フェーズ（第3引数 `true`）で登録することで、アプリケーション側のイベントハンドラより先に処理し、`stopPropagation()` / `preventDefault()` でアプリへの伝播を防ぎます。

#### キーボードショートカットパーサ

**`parseShortcut(shortcut: string)`**

`'Alt+Shift+G'` のような文字列を修飾キーフラグとキー名に分解します。大文字小文字を区別しません。

**`setupShortcut(shortcut, options): () => void`**

`keydown` リスナーを登録し、ショートカットが押されたら `toggle()` を呼びます。戻り値はクリーンアップ関数です。

### `src/index.ts` — Vue 3 プラグイン

`Plugin` インターフェースの `install` メソッドを実装します。

**install 時の処理:**

1. プロダクション環境チェック（`process.env.NODE_ENV === 'production'` なら何もしない）
2. `setupShortcut()` でキーボードショートカットを登録
3. `app.config.globalProperties.$vueGrab` にAPI メソッドを登録
4. `app.provide('vue-grab', ...)` で inject 可能にする
5. コンソールにインストールメッセージを表示

### `src/composable.ts` — Composable API

Vue 3 の Composition API パターンに沿ったラッパーです。

**提供する機能:**
- `ref<boolean>` によるリアクティブなアクティブ状態管理
- `ref<GrabResult | null>` による最新グラブ結果の保持
- `onUnmounted` でのショートカット解除とモード終了の自動クリーンアップ
- プラグインが既にインストール済みの場合、`inject('vue-grab')` からの機能取得を試みる

## ビルド構成

### Vite ライブラリモード

```ts
// vite.config.ts
build: {
  lib: {
    entry: './src/index.ts',
    name: 'VueGrab',           // UMD グローバル名
    fileName: 'vue-grab',      // 出力ファイル名
  },
  rollupOptions: {
    external: ['vue'],         // vue はバンドルに含めない
    output: {
      globals: { vue: 'Vue' }, // UMD 用のグローバル変数マッピング
    },
  },
}
```

**出力ファイル:**

| ファイル | フォーマット | 用途 |
|---------|-----------|------|
| `dist/vue-grab.js` | ESM | `import` での利用（バンドラー経由） |
| `dist/vue-grab.umd.cjs` | UMD | `require()` や `<script>` タグでの利用 |
| `dist/index.d.ts` | TypeScript 宣言 | 型情報の提供 |

## react-grab との比較

| 観点 | react-grab | vue-grab |
|------|-----------|----------|
| コンポーネント検出 | `bippy` ライブラリ経由で React Fiber ツリーを走査 | Vue 3 の `__vueParentComponent` を直接参照 |
| オーバーレイ描画 | SolidJS で別ルートにレンダリング + Canvas ベース | 素の DOM 操作（CSS でスタイリング） |
| バンドルサイズ | SolidJS + bippy + Canvas 描画を含む | 外部依存ゼロ（vue は peer） |
| ファイルパス取得 | React Owner Stack + bippy のスタックフレーム解析 | Vite が注入する `__file` プロパティ |
| AI 連携 | Agent SDK 統合、プロンプトモード、MCP サーバー | クリップボードコピー + コールバック |

## 制限事項と既知の制約

### `__vueParentComponent` の制約

- **開発モード限定**: Vue 3 のプロダクションビルドではこのプロパティが削除される
- **内部 API**: Vue の公式 API ではなく、マイナーバージョンで変更される可能性がある
- **Teleport / Suspense**: これらの境界をまたぐ場合、ツリーウォーキングが正確でない可能性がある

### `__file` の制約

- **Vite 必須**: `__file` プロパティは Vite（および一部の webpack ローダー）が SFC コンパイル時に注入するもの
- **webpack**: `vue-loader` の設定によっては `__file` が注入されない場合がある
- **開発モード限定**: プロダクションビルドでは通常ストリップされる

### 行番号の制約

- `vnode.loc` は Vue テンプレートコンパイラが付与するもので、JSX やレンダー関数では利用できない
- テンプレート内での位置であり、`<script>` ブロックの行番号ではない

## セキュリティに関する考慮事項

- vue-grab は**開発専用ツール**です。プロダクション環境では有効化しないでください
- コンポーネントの Props がプロンプトに含まれるため、センシティブなデータ（API キー、トークン等）が Props に含まれている場合は注意が必要です
- `navigator.clipboard.writeText()` を使用するため、HTTPS 環境またはlocalhost での実行が必要です
