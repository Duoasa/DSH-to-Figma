# figma-use 16 对齐测试记录

测试日期：2026-10-28。正式版检查版本：0.3.0。配套 companion：featureVersion 3。真实画布验证使用同一实现的 0.3.0-preview.1 构建。

## 自动化

- `npm run test:all`：语法/生成入口/manifest/打包路径检查通过；**74 项测试全部通过**；DSH **0.2.1-rc.2** 原生工具链冒烟通过。
- 已安装 DeepSeek Harness **0.2.1-rc.3** 的 Electron Node / app.asar/dsh 运行时执行同一原生冒烟：通过。
- 原生冒烟包含插件生产入口、18 个文档/任务工具、Work 范围检查、文件绑定、create_session、fileKey 校验、语法失败的重试标记、io.write 工作区文件、inline PNG 的 DSH 持久图像附件，以及不支持图像输入时的文本回退。
- 选择器与 QueryResult 测试包含复杂组合、路径、实例主组件、带分号的实例子节点 ID、空结果、作用域、去重、回调索引和非法语法。错误测试包含编译失败、部分执行、伪造重试标记和返回值序列化失败。

这些是脚本/协议功能测试，不是模型自然语言任务 benchmark，不用于宣称 token 或速度改善。

## 真实 Figma 编辑器

Figma 桌面版：126.10.13。

使用已有 **DSH Figma · 实机验证** 文件，新建独立测试页 **DSH Contract 20261028**。通过本机 loopback bridge 驱动实际 companion；未改动已有业务画布。

文件：`M3bhbgvu2kmKG7H1flw4eE`。测试页 `30:50`；预览 `30:60`；组件集 `30:59`；实例 `30:61`。保留测试结果供检查。

1. 启动已配对 companion，握手回报 0.3.0-preview.1 / featureVersion 3。
2. 第一页上下文复位、query / filter / values 可在真实沙箱运行。
3. 创建一个集合、Light/Dark 两种模式、3 个变量；颜色原始变量、语义别名和 GAP 作用域；设置 WEB code syntax。
4. 创建 Default/Hover 两个原生变体、文本组件属性、变量绑定和一个实例；修改实例文字并切换 Dark 模式；返回树、PNG 和 JSON 文件。
5. 重新运行构建脚本，集合、变量、组件集、组件与实例 ID 均保持一致。
6. 独立修改/读回检查 **10/10 通过**：首次页面复位、Hover 变体切换、主组件选择器、实例子节点 ID 选择器、文字修改、间距变量值传播、Light 模式颜色解析、无重复集合/组件集/实例。图像中可读到 `Updated through DSH`。
7. 实际 Figma 沙箱中的语法错误返回 `safeToRetryWithoutCanvasRead:true`，bridge 的 `needsInspection:false`，没有误设写屏障。

证据：[构建](figma-use-16-real-create.json)、[重复构建](figma-use-16-real-repeat.json)、[独立验证](figma-use-16-real-verify.json)。复现脚本在 `test/manual/figma-use-real-create.js` 与 `test/manual/figma-use-real-verify.js`；验证脚本包含本次真实 ID，换文件时必须替换成当次返回值。

## 实测修正与边界

第一次构建在 `setExplicitVariableModeForCollection(collection.id, modeId)` 处被编辑器拒绝，已有变量/组件仍留在画布。实际错误返回 false，写屏障生效；读取测试页和集合后，将参数改为 collection 对象，复用原对象完成操作。操作指引已记录此增量加载 API 要求，没有宣称失败自动回滚。

实测还发现 tree 格式化把根投影误识别成原始节点，导致 name 缺失；修正后在真机复验，回归测试包含 id/name/type 联合投影。

Figma 当时显示网络同步提示，因此上述证据确认的是本地编辑器状态，不据此宣称云端保存完成。FigJam/Slides 的全面实机验收、官方私有执行器等价性及模型生成设计的质量不在本轮已验证范围内。视觉效果仍由用户验收。

## 本机安装与加载

通过已安装 DSH 0.2.1-rc.3 的原生 plugin add 命令更新 desktop profile。预发布安装时 DSH 插件面板显示 v0.3.0-preview.1、启用、1 个组件运行中；3055 端口由正式 DSH 进程监听，Figma companion 显示已连接。配对 manifest 路径未变，原配对凭证保留。

正式版 0.3.0 已再次通过原生 plugin add 安装，重启宿主后面板显示 v0.3.0、1 个组件运行中；Figma 从同一 manifest 入口重新运行，显示已连接。

安装时 pnpm 提示 profile 的 peer 依赖警告；脱离宿主直接 import 已安装包会落到旧全局依赖，缺少 createMcpToolDefinition。没有据此改动其他宿主依赖；真实 DSH 加载器正常解析并启动了插件，前述 rc.3 原生冒烟也通过。此包仍是 DSH 原生插件，不是可脱离宿主独立运行的 Node MCP 服务。

旧 companion 与 profile 安装元数据保存在本机私有备份目录。公开 tgz 和通用 companion ZIP 已检查不包含配对凭证、测试工作区、node_modules 或无关的 remote-mcp-validation-2026-10-20.md。
