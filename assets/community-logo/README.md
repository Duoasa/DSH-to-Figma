# Community logo · DSH to Figma

一份由使用者用 **DSH to Figma 本身**绘制、并导出的社区 Logo 提案。放这里供项目自由取舍：采用、改造，或只当参考都可以。

A community-made logo for DSH to Figma, drawn **with DSH to Figma itself** in a local Figma file and exported natively. Free to adopt, adapt, or ignore.

## 概念 / Concept

**画布里的提示符 / the prompt inside the canvas**

- 圆角方框 = Figma 的画板（Frame）：插件操作的容器。
- 框内的 `>` + 一条强调色短杠 = 命令行的提示符 `>_`：DSH 这一侧（agent / CLI）。
- 两者叠合：把命令写进画布 —— 即 `DSH → Figma` 这件事本身。

A rounded frame (the Figma canvas) holding a `>_` prompt caret (the DSH side). Overlap the two and you get "commands written into canvas", which is what the plugin does.

## 文件 / Files

| 文件 | 用途 |
| --- | --- |
| `app-icon-512.svg` / `.png` | 主图标，512 画板，深色底 + 材质层（顶部内发光 + 1px 描边 + 三重投影） |
| `mark-mono-256.svg` / `.png` | 单色标记，供小尺寸与单色场景检验 |
| `lockup-horizontal.png` | 横版组合：标记 + `DSH to Figma` 字标 + `LOCAL CANVAS BRIDGE` |
| `tiny-optical-16-20-24.png` | 16 / 20 / 24 px 光学尺寸检验：带框版与去框版并排 |

标记可退化：去掉外框只留 `>_` 时，16px 仍清晰可读，因此提供去框变体。

## 几何 / Geometry（320 网格）

| 元素 | 规格 |
| --- | --- |
| 外框 | 288 × 288，圆角 84，描边 20（inside） |
| `>` | `M 80 76 L 164 144 L 80 212`，描边 20，round cap/join |
| 短杠 | `M 184 212 L 240 212`，描边 20，round cap |

## 设计令牌 / Tokens

| Token | 值 |
| --- | --- |
| `ink/900` | `#0A0C10` |
| `ink/700` | `#14171D` |
| `paper/50` | `#F7F6F3` |
| `bridge/500`（唯一强调色） | `#5B7CFA` |
| 高程 | `0 1px 2px / 0 8px 24px -8px / 0 24px 60px -24px`，黑色 24–40% |
| 内发光 | `#FFFFFF 6%，offset (0, 2)，radius 12` |
| 字体 | Inter Medium，字距 `-0.03em`（字标） |

## 许可 / License

与仓库一致，按 MIT 提供（见仓库根目录 `LICENSE`）。不含任何密钥、私人设计或账号数据；全部图形由 Figma 原生矢量图层构成，导出后无外部依赖。
