# 0.3.0：对齐 Codex figma-use

本轮保留 DSH 原生插件＋本地 Figma companion，重点是功能和执行契约，不做 token / 速度优化。两端必须一起升级，companion 能力版本为 3。

基准为 2026-10-28 当前安装的 **Codex Figma 插件 16.0.0**：figma-use Skill、附带 API 类型定义、组件库工作流及当时暴露的工具参数。文件哈希见 [基准记录](figma-use-16-baseline.json)。公开 openai/plugins main 的指引与本机版本有差异，因此没有将它混称为当前部署版本。无法获取官方云端执行器源码，本地实现不宣称与私有执行器完全等同。

## 已实现

| 范围 | 0.2.5 | 0.3.0 |
| --- | --- | --- |
| 查询 | 类型＋精确名称 | 属性、布尔/数字、字符串包含/前后缀、路径/通配索引、组件实例、关系选择器、伪类、ID、并集 |
| QueryResult | 数组＋set | first/last/toArray/each/map/filter/values/set/query/迭代；保留旧数组索引 |
| 属性修改 | resize 在前 | layoutMode → resize → 其他属性；保留最终 HUG/FILL |
| 自动布局 | 主/交叉轴 AUTO | 明确设置两个 layoutSizing 轴为 HUG，支持方向或首参数 props |
| 页面 | 沿用编辑器当前页 | 每次 use_figma 从第一页开始；最多一次异步切页；拒绝同步赋值 |
| 截图 | 本地统一预设 | inline 默认 0.5×、最长边 1024px；显式 scale 优先；附节点名称、尺寸、位置 |
| 文件输出 | 专用导出工具 | 新增 figma.io.write，将输出保存为工作区文件并返回路径 |
| 其他辅助方法 | 无 | matches、tree、findPlacement、placeholder 进度反馈 |
| 任务上下文 | Work 文档绑定 | 新增 create_session；use_figma 接收 description/fileKey/sessionId/skillNames，并检查文件与会话归属 |
| 错误恢复 | 一律要求读画布 | 编译/执行前失败返回 true；已开始执行、未知结果返回 false，保留写入屏障 |
| 设计系统发现 | 单条 query | 支持按 entity/query 批量搜索、保持输入顺序；本地范围明确 |
| 设计系统制作 | 通用操作提示 | 分任务范围、稳定 ID 台账、变量/别名/模式/作用域、组件属性/变体/实例工作流 |

## 本地环境必须说明的差异

- 官方必填的 description/fileKey 在本地保留为可选，以兼容旧的 `{code}` 调用。新工作流一律提供这些参数。没有公开 fileKey 的本地文件用 `local:<connectionId>`，从 figma_status 读取，不猜测。
- create_session 是本地 Work 任务的 UUID，不会创建云端录制。切换文件仍必须显式绑定；UUID 可跨显式选定文件复用，不能跨 Work 会话/工作区复用。
- 一个编辑器只有一个 currentPage，本地按文件串行执行，不复制云端的并行分页执行策略。
- placeholder 在 companion 中显示当前构建的节点，不伪造画布闪烁层；作用域为单次调用，退出时自动清理。
- findPlacement 优先使用原生能力，否则选现有内容右侧位置；tree 的字符串格式为本地实现。
- 公开 API 的能力由实际 Figma 编辑器决定。未实现云端文件创建、全库搜索、Code Connect 发布、云端任务录制，也没有声称写操作可自动回滚。
- mainComponent 选择器通过异步公共 API 预读匹配。改变实例变体后，先 await instance.getMainComponentAsync()；跨页查询先 await page.loadAsync()。
- 截图、导出和脚本长度仍保留本地容量上限；错误结果是保守判定，进入脚本后的只读异常也可能返回 false。

## 升级

1. 安装本版本 DSH `.tgz`，保持 local backend。
2. 新版启动后自动更新已配对 companion；也可调用 figma_setup。保留原 manifest 路径，不需重新复制密钥。
3. 关闭 Figma 中旧的 DSH to Figma · Local，再从原开发插件入口运行。
4. figma_status 应显示 pluginVersion、companionVersion 为 0.3.0，featureVersion 为 3。

新版 DSH 拒绝向旧 companion 执行新 use_figma 契约，提示更新配套插件。正式版本号为 0.3.0，两端配套发布。

## 验证

详见 [本轮测试记录](figma-use-16-verification.md)。自动测试覆盖选择器、QueryResult、属性顺序、页面上下文、实例动态 API、错误恢复、任务归属、输出文件和原生 DSH 图像附件。真实编辑器验证使用独立测试页，覆盖变量、双模式、别名、组件变体、实例修改、截图和重复执行；自动与结构测试不替代用户视觉验收。
