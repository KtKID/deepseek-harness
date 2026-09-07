---
description: "web GUI 浏览器侧的包映射：外壳启动、浏览器与宿主通信、共享客户端服务、本地化、开发重载与 UI 功能插件。"
kind: "package-group"
---

# client/ — Web GUI 浏览器侧

[English](README.md) | 中文

## 概述

`client/` 组运行 dsh web GUI 的浏览器侧：它启动 web 外壳、加载浏览器侧插件模块、维持浏览器与宿主之间的 RPC 与事件投递，并提供渲染应用所需的共享客户端服务与 UI 功能插件。UI 功能通过 slot 系统组合——每个插件填充已声明的扩展 slot，携带类型化 props 与 store，由外壳渲染组装后的整棵树。本组所有包均为产品包，名为 `@deepseek-ai/dsh-client-<name>`；服务于页面的宿主半侧位于 [`host/`](../host/README.zh.md)。编写规则见 [AGENTS.md](AGENTS.md)，模块图、slot 模型与对象层的说明见下方相关文档。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

内核包负责启动与服务于页面，UI 功能包负责呈现页面。各包的 README 拥有自己的约定与配置。

| 包 | 用途 | ctx key |
|---|---|---|
| [`web/`](web/README.zh.md) | 从客户端条目图启动浏览器 shell。 | — |
| [`modules/`](modules/README.zh.md) | 加载浏览器侧客户端模块。 | `ctx.clientModules` / `ctx.modules` |
| [`connection/`](connection/README.zh.md) | 维护浏览器与宿主之间的 RPC 通信和事件传递。 | `ctx.connection` |
| [`file-upload/`](file-upload/README.zh.md) | Sends raw Blob and byte-stream request bodies outside the page thread | `ctx.fileUpload` |
| [`store/`](store/README.zh.md) | Provides React-free observable and snapshot-store primitives | — |
| [`hmr/`](hmr/README.zh.md) | 在开发期间刷新客户端插件。 | — |
| [`locale/`](locale/README.zh.md) | 提供本地化偏好与消息词典。 | `ctx.locale` |
| [`test-runtime/`](../test-support/client-runtime/README.zh.md) | 为客户端功能包提供共享的仓库测试支持。 | — |
| [`ui-renderer/`](ui-renderer/README.zh.md) | Binds slot data to React and mounts the assembled application | `ctx.uiRenderer` |
| [`ui-slots/`](ui-slots/README.zh.md) | 定义 UI 功能注册和组合扩展 slot 的方式。 | — |
| [`ui-session/`](ui-session/README.zh.md) | Adapts Session Controller state into standard Slot sources and hooks | — |
| [`ui-theme/`](ui-theme/README.zh.md) | 应用所选颜色主题。 | — |
| [`ui-primitives/`](ui-primitives/README.zh.md) | 提供共享 React 控件、图标和内容渲染器。 | — |
| [`ui-attachment/`](ui-attachment/README.zh.md) | 提供附件展示原子组件：草稿图片栏、消息画廊与灯箱。 | — |
| [`ui-layout/`](ui-layout/README.zh.md) | 排列应用的主要区域。 | — |
| [`ui-sidebar/`](ui-sidebar/README.zh.md) | 展示工作区与会话导航。 | — |
| [`ui-brand-official/`](ui-brand-official/README.zh.md) | Fills the generic browser-brand slots with the official name and marks | — |
| [`ui-workspace/`](ui-workspace/README.zh.md) | 提供工作区选择与创建界面。 | — |
| [`ui-conversation/`](ui-conversation/README.zh.md) | 展示当前对话及其输入界面。 | — |
| [`ui-chat/`](ui-chat/README.zh.md) | Projects and renders the Chat conversation target | — |
| [`ui-approval/`](ui-approval/README.zh.md) | Presents approval requests and returns user decisions | — |
| [`ui-tool/`](ui-tool/README.zh.md) | 编排工具调用树和按工具键控的视图。 | — |
| [`ui-workflow-run/`](ui-workflow-run/README.zh.md) | 把持久工作流运行回放为 Chat 嵌套折叠项，并只为实时子 Session 提供导航。 | — |
| [`ui-goal/`](ui-goal/README.zh.md) | 展示和管理当前目标。 | — |
| [`ui-trajectory/`](ui-trajectory/README.zh.md) | 提供 agent（智能体）活动的其他视图。 | — |
| [`ui-commands/`](ui-commands/README.zh.md) | 提供会话感知的命令发现与分发。 | — |
| [`ui-input-trigger/`](ui-input-trigger/README.zh.md) | 协调内联命令和引用建议。 | — |
| [`ui-skill/`](ui-skill/README.zh.md) | 向内联建议添加 skill（技能）引用。 | — |
| [`ui-reference/`](ui-reference/README.zh.md) | Unified Web `@file` / `@session` reference source | — |
| [`ui-subagent/`](ui-subagent/README.zh.md) | 提供 subagent（子 agent）导航、子级 transcript（文本记录）的状态和内联引用。 | — |
| [`ui-schedule/`](ui-schedule/README.zh.md) | Lists the current Session's active reminders in a read-only header catalog | — |
| [`ui-jobs/`](ui-jobs/README.zh.md) | 在会话标题栏列出当前会话的后台任务。 | — |
| [`ui-model-selection/`](ui-model-selection/README.zh.md) | 在对话界面中提供模型选择。 | — |
| [`ui-permission-presets/`](ui-permission-presets/README.zh.md) | Configures default permissions and switches the current session's access | — |
| [`ui-plan/`](ui-plan/README.zh.md) | 展示生效中的 plan mode 状态及其退出控件。 | — |
| [`ui-settings-plugins/`](ui-settings-plugins/README.zh.md) | 拥有“插件”设置分区、它的标签页扩展点，以及可配置的宿主平面插件卡片。 | — |
| [`ui-user-questions/`](ui-user-questions/README.zh.md) | 展示 agent 请求的交互式问题。 | — |
| [`ui-agent-preset/`](ui-agent-preset/README.zh.md) | 选择会话的 agent 预设，并编写预设组合。 | — |
| [`ui-settings/`](ui-settings/README.zh.md) | 承载设置界面及其扩展区域。 | — |
| [`ui-settings-general/`](ui-settings-general/README.zh.md) | 提供常规设置分区。 | — |
| [`ui-settings-models/`](ui-settings-models/README.zh.md) | 提供模型提供方配置与 DeepSeek 配置引导。 | — |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.zh.md) | 向“插件”设置贡献只读的 Host Loader 清单标签页。 | — |
| [`ui-settings-plugin-analyzer/`](ui-settings-plugin-analyzer/README.zh.md) | 展示 Host 插件行为、依赖影响、诊断和生命周期历史。 | — |
| [`ui-deliverables/`](ui-deliverables/README.zh.md) | Produces the produced-files turn tail and clickable final-response file references | — |
| [`ui-message-feedback/`](ui-message-feedback/README.zh.md) | Contributes per-message feedback controls to the assistant-message action strip | — |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.zh.md) | In-app directory browsing surface for the workspace directory flow | — |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.zh.md) | Native directory-picker surface driving the host's OS chooser | — |


-----

<a id="related-documentation"></a>
## 相关文档

先从子系统参考与两份拥有跨包组合决策的 Agent Note 读起，再看服务于本页的宿主半侧。

- [客户端模块子系统](../../docs/subsystems/client-modules.zh.md)——web 插件表：`dsh.client` 声明、启动图协议与 bundle 路由。
- [slot 系统标准](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——权威 slot 模型：注册、props 份额与 store。
- [web 客户端架构 Agent Note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——加载链、对象层与客户端服务。
- [宿主组地图](../host/README.zh.md)——服务于本浏览器半侧的宿主半侧。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
