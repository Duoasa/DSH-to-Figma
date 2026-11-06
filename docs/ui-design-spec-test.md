# DSH to Figma · UI 设计规范（测试）

> Historical development record. For current capabilities and tested compatibility, see [0.3.5 verification](0.3.5-verification.md).

本规范描述测试页面中的按钮、主题和动效示例，用于验证设计规范的读取与精确修改。数值依据现有画布；动效条目描述本次编辑的目标效果。

## UI 设计规则

1. **布局与间距**：按钮采用水平 Auto Layout，尺寸 220 × 64 px；左右内边距 20 px、上下 16 px；内容间距绑定 spacing/gap = 12 px。预览容器内边距 24 px、纵向间距 16 px。
2. **颜色与主题**：按钮填充绑定 semantic/primary，并通过别名引用 primitive/brand；Light 为 RGB(0.3, 0.2, 0.8)，Dark 为 RGB(0.5, 0.4, 1)，均使用 0–1 色值。主题切换保留变量绑定。深色预览用于核对主题解析效果。
3. **字体与文案**：按钮文字使用 Inter Regular、16 px、自动行高、白色填充；文字必须可编辑，通过 Label 组件属性修改。文案过长时应调整组件宽度或采用明确的换行策略，不允许遮挡或裁切。
4. **形状与组件**：按钮圆角为 12 px；组件集包含 State=Default 和 State=Hover。预览保持为组件实例，文字覆盖不解除主组件关系。当前两种状态视觉相同，仅验证变体结构，尚未定义正式悬停反馈。
5. **动效**：Motion 示例画板为 720 × 400 px、圆角 24 px。方块保留可编辑的水平位移、填充色和模糊关键帧；目标位移从 0 到 440 px、时长 1.2 s，并移除旋转轨道。字幕以单词为单位进入、时长 1.5 s，标题使用可复用的淡入样式。视觉节奏需在时间轴播放中确认。
6. **适用范围**：以上仅为测试画布的 UI 设计规范，不是产品最终设计系统。主题对比度、键盘焦点、禁用状态、响应式布局和减少动态效果的方案尚未纳入该示例的验收范围。

## 关联设计

按钮组件 (node 48:719) · 实例预览 (node 48:720) · 动效示例 (node 48:723)

## 规范维护

只修改明确指定的规则，保留其他条目和关联设计链接。

<!-- Public copy: private Figma file key and links omitted. -->
