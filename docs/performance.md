# 本地性能优化与验证

0.2.4 提供数据摘要、筛选分页、截图档位和性能记录。0.2.5 补充空集合查询、运行版本、按会话统计与区间游标，并让工作流根据目标是否已知决定是否需要摘要定位。复杂写入继续使用 `use_figma`；专用变量批量写入、组件生成、跨调用缓存和并发导出属于后续阶段。

## 读取方式

旧调用的默认行为保留。新的轻量参数需要同步更新 DSH 插件与 Figma companion；如果提示 companion 版本不支持，请关闭并重新运行配对目录中的插件。

| 任务 | 建议调用 | 返回范围 |
| --- | --- | --- |
| 确认文件与连接 | `figma_status({compact:true})` | 包版本、已连接 companion 版本及能力号；图层名称不代表运行版本 |
| 查看性能统计 | `figma_status({compact:true,includeMetrics:true})` | 当前 Work 会话的摘要及区间游标；逐条记录按需读取 |
| 定位图层 | `get_metadata({nodeId,profile:"summary",depth:1})` | ID、名称、类型、尺寸、层级等摘要，省略视觉样式和文本分段 |
| 分页读取子层 | `get_metadata({nodeId,profile:"summary",depth:1,offset:0,limit:50})` | 指定节点的直接子层页及分页信息 |
| 读取实际设计细节 | `get_design_context({nodeId,includeScreenshot:false})` | 详细节点信息和 CSS，不附带图片 |
| 找字体 | `list_fonts({family:"Inter",style:"Regular",limit:20})` | 匹配的字体和分页信息 |
| 找变量 | `get_variable_defs({collectionIds:[collectionId],query:"color/",profile:"summary",limit:50})` | 目标集合内的变量摘要 |
| 找集合，包括空集合 | `get_variable_defs({collectionsOnly:true,query:"Theme",limit:50})` | 集合名称匹配、模式和变量数量，不读取变量值 |
| 读取变量值 | `get_variable_defs({ids:[variableId],modeIds:[modeId]})` | 指定变量在目标模式中的值 |
| 找组件 | `search_design_system({query:"Button",kind:"components",profile:"summary",limit:20})` | 当前页面内匹配的组件摘要 |

`profile:"full"` 是默认详细读取；摘要适合定位，不足以重建设计。完整变量值和文本样式应在确定目标后读取。组件查询可显式传入 `pageId`，只加载和搜索指定页面，不表示能够搜索所有云端库。

目标 ID 或选区已知时直接读取必要细节，不必先做摘要读取。原生属性通常只需小范围 `get_metadata`；需要 CSS 或实现上下文时才用 `get_design_context`。目标未知时使用浅层摘要定位。精确目标与修改要求已经明确时，可在同一脚本中先检查当前类型/值，匹配后修改并回读，遇到不匹配则终止。

节点读取可设置 `maxNodes` 和 `maxBytes`。超出预算时，返回截断信息及继续读取的线索；不能把部分结果当成完整清单。`maxNodes` 范围为 1–1500，`maxBytes` 范围为 1024–2097152。元数据的 `offset`/`limit` 只对所选根节点的直接子层分页，需要 `nodeId` 和至少一层深度。

字体工具无参数时仍返回原来的数组；使用筛选或分页参数时返回 `{fonts,pagination}`。变量工具保留 `collections`、`variables`，使用新选项时附带分页信息。设计系统搜索按选定类别分别分页。分页字段为 `offset`、`limit`、`returned`、`total`、`hasMore` 和 `nextOffset`。读取后若用户改变了文件，应重新检查目标，分页不承诺跨修改的快照一致性。

优化变量查询还返回 `coverage`：范围仅为本地文件，不含云端库；普通变量页的 `collections` 只描述本页变量涉及的集合及显式指定的集合，并非所有集合。`localCollectionCount` 和 `emptyLocalCollectionCount` 区分没有集合与存在空集合。确认是否已有目标集合时使用 `collectionsOnly:true`：其 `query` 匹配集合名称，支持 `collectionIds`、`modeIds` 和分页，不接受变量 `ids`/`type`。`variables:[]` 在该模式表示没有读取变量，而非不存在变量。查询/分页结果不完整时不能作全文件不存在的结论。

`collectionsOnly` 需要 companion 的 `featureVersion:2`，旧摘要参数仍只需要能力号 1。`pluginVersion` 是宿主包版本，`documents[].companionVersion` 是正在运行的 companion 版本，未知时为 `null`；能力号不是语义版本。遇到旧 companion 的能力错误，应重新运行已配对插件。

## 截图和调用策略

默认截图最长边仍为 1600 像素；`quality:"overview"` 使用 800 像素，`quality:"detail"` 使用 1600 像素，均不自动放大小图。显式 `scale` 优先，适合精确查看局部。结构检查使用 `includeScreenshot:false`，需要判断视觉效果时再获取图片。

常规工作流为：仅在目标未知时摘要定位 → 读取必要细节或脚本内校验 → 一次脚本完成相关修改和结构回读 → 检查必要的截图。`use_figma` 已能批量编辑，并在同一次调用中用 `await node.screenshot()` 附带图片。无需为每个图层单独调用，也无需重复获取没有变化的截图；字体、变量、组件和诊断统计也只在任务需要时查询。

截图无法证明变量绑定或组件关系；这些关系需要结构回读。反过来，结构回读也无法证明视觉质量。涉及视觉的任务仍需真实截图和人工检查。

## 本地诊断统计

`figma_status({compact:true,includeMetrics:true})` 查看当前 Work 会话在本次插件运行中的性能摘要，每个会话最多保留 100 条画布调用记录，默认不附逐条记录。统计不会混入其他会话；重启或会话释放后清空。不默认写入日志文件，不保存设计正文、图片、脚本、文档 ID 或凭证。

需要对比一次任务时，先保存返回的 `performance.cursor`，完成后传入 `metricsSince`。游标为 `{epoch,sequence}`；其他会话、重启前或超前游标会明确报错，需要重新建立基线。

```js
figma_status({compact:true,includeMetrics:true}) // 保存 performance.cursor
// 完成任务后，使用真实返回的 epoch/sequence：
figma_status({compact:true,includeMetrics:true,metricsSince:cursor})
// 只有排查单次调用时才追加 metricsDetails:true
```

`completed` 是本会话累计完成数；`window` 表示本次选定区间。`totals` 仅对区间内仍保留的记录求和：先检查 `window.complete` 和 `dropped`，不能把超过 100 条后丢失的历史当作零耗时。统计只包含进入本地画布执行路径的调用，不含状态/指南、调用前的参数或连接拒绝、模型请求和完整任务耗时。各任务的实际工具次数与模型用量由宿主轨迹补齐。

计时需要区分宿主调用总耗时、bridge 往返/排队、companion 执行、截图导出和序列化。各计时范围可能嵌套，不能简单相加。跨进程计时使用各自的持续时间，不把不同进程的绝对时钟直接相减。

真实模型 token、模型等待时间和完整任务轮次需要由宿主或供应商的 usage/任务记录补充；插件没有可靠来源时标记未知。返回字节数不等于 token，图片 Base64 的长度也不等于图片输入 token。只有完整任务前后对比才能证明用户的 token 或等待时间降低。

字体筛选目前仍先获取 Figma 字体列表；普通变量查询仍读取本地集合和变量后筛选。主要收益是少返回、少序列化，不能将其描述为底层 API 的按 ID 直查。`collectionsOnly` 则确实跳过变量值查询。小于 800 像素的画板两档截图可能完全相同，需要更大的画板验证截图档位的收益。

## 可重复的合成基准

在仓库安装依赖后执行：

```sh
node scripts/benchmark.mjs
node scripts/benchmark.mjs --runs 15 --output /tmp/dsh-figma-performance.json
```

脚本使用固定的 521 节点子树、800 个字体样式和 300 个变量，对比详细读取与摘要/筛选读取。它检查摘要是否保留相同的节点 ID、名称、类型和尺寸，并检查筛选和分页命中结果。每种操作预热两次后，记录指定次数的运行中位数、最小值、最大值以及模型可见 JSON 文本的 UTF-8 字节数。

输出明确标记为合成 Plugin API fixture，没有调用真实 Figma 或模型。字节数可以重复比较；执行耗时会随机器和负载波动。报告中的 `actualModelUsage`、`modelTurns`、`taskWallMs` 和 `screenshotExportMs` 为 `null`，不能据此推断真实任务的 token 节省率、Figma 渲染速度或网络性能。

基准不是完整设计上下文的等价压缩测试：摘要保留定位所需信息，按需读取细节才构成完整工作流。评估端到端成本时，要包含补充读取和修复调用。

## 真实 Figma 与模型任务基线

使用同一模型及配置、同一提示词、同一文件副本和相同的完成标准；每次恢复相同起点。旧版本与优化版本交替运行，记录首次运行和重复运行，减少网络波动及宿主缓存的影响。每项任务先执行三次观察中位数和波动；需要稳定的 P95 时再收集足够的操作级样本。

| 任务 | 固定输入与完成要求 | 必须检查 |
| --- | --- | --- |
| 定位后改文字 | 复杂页面中的指定文本；仅修改该文本 | 目标正确、字体和相邻内容不变 |
| 批量改样式 | 50 个指定按钮统一圆角或颜色 | 不漏改、不越界、变量绑定按任务保留 |
| 读取复杂画板 | 提供指定画板的布局、文本和实现所需样式 | 必要信息齐全，补读次数计入成本 |
| 创建双主题变量 | 指定集合、Light/Dark 模式、别名和目标绑定 | 模式值、别名及实际绑定正确；第一批仍使用脚本 |
| 修改组件实例 | 一批具有不同文字和图标覆盖的实例 | 主组件关联与未指定覆盖保留 |
| 生成变体并导出 | 指定尺寸/状态组合和素材格式 | 数量、布局、组件关系和导出文件正确；第一批仍使用脚本 |

每次记录实际输入/输出 token、可获得的缓存 token、模型轮次、工具调用数、失败/修复次数、截图次数、完整任务耗时，以及插件内部耗时。缺失指标留空并写明来源，不按字符数猜测计费。

验收先检查任务正确性，再比较总成本。单次结果变小但造成更多补读、返工或视觉遗漏，不视为成功。保存报告时注明模型、宿主、Figma、插件版本和文件基线；报告不得包含凭证或未获授权的设计内容。

## 回归边界

自动化检查包括旧默认输出、新筛选分页、预算截断、结构读取不导出图片、摘要不读取昂贵文本分段、并发顺序和未知写入保护。真实编辑器需要另行检查摘要/详情回读、截图可读性、组件实例、变量绑定，以及 connected、paused 和设置展开后的 companion 界面。

同一文档的写入继续串行；失败或断线后先核对实际状态，不自动重放创建脚本。解除未知写入保护时，对受影响目标调用 `get_metadata`，不使用摘要、分页或自定义预算；这些部分读取不会解除写入保护。变量操作还要核对对应变量值和绑定，不能仅凭一次无关的节点读取认定写入成功。第一批不会把这些保护换成更激进的并发。
