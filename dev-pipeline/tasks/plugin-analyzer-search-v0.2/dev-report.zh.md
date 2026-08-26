# Plugin Analyzer 搜索与 v0.2 开发报告

[English](dev-report.md) | 中文

## 已交付行为

- Plugin Analyzer 设置标签页现在提供本地化且无障碍的搜索框，布局与用户提供的紧凑深色输入框一致。
- 搜索忽略首尾空格，按显示名、完整模块名和 Loader 条目 ID 执行大小写不敏感匹配，保留来源顺序，并收起被过滤隐藏的详情。
- 汇总指标继续描述完整 Host 快照。无匹配查询会渲染专用空状态，且不会增加 Remote 请求。
- `@deepseek-ai/dsh-host-plugin-analyzer`、`@deepseek-ai/dsh-client-ui-settings-plugin-analyzer` 和 `@deepseek-ai/dsh-plugin-analyzer` 现已使用 `0.2.0` 版本。

## 测试先行证据

| 改动 | 初始失败证据 | 通过证据 |
|---|---|---|
| 搜索 | 定向组件测试因缺少无障碍 `Search plugins` 搜索框而失败 | 定向包范围通过 21 项测试，覆盖三种标识、去除首尾空格、大小写折叠、空结果、汇总稳定性、来源顺序、一次 Remote 调用和收起隐藏详情 |
| 版本 | manifest 断言为三个包输出 `0.1.0-rc.5` | 相同断言为三个包输出 `0.2.0` |

## 验证

| 命令或范围 | 结果 |
|---|---|
| Plugin Analyzer Host、Client 与 bundle 定向 Vitest | 7 个文件通过；21 项测试通过 |
| `tsc -b packages/client/ui-settings-plugin-analyzer/tsconfig.json --pretty false` | 通过 |
| Client 与 Host GUI Vitest 范围 | 278 个文件通过；3,777 项测试通过；跳过 1 项 |
| `apps/web/tests/settings-chrome.e2e.ts` Web 快照刷新 | 8 项测试通过，并刷新 Plugin Analyzer 预期输出 |
| `apps/web/tests/settings-chrome.e2e.ts` Web 快照回放 | 8 项测试通过 |
| `npm run lint` | 沙箱阻止 tsx IPC socket 后，宿主运行通过 |
| `pnpm_config_trust_lockfile=true npm run doc-sync` | 28 项门禁通过 |
| 直接运行 Web Vite 生产构建 | 转换 413 个模块；构建通过 |
| manifest 版本断言 | 三个包版本均为 `0.2.0` |
| `git diff --check` 与 `git diff --name-only -- vendor/` | diff 检查通过；vendor 查询无路径输出 |

## 环境证据

- Client 与 Host GUI 范围在沙箱中出现 17 项 `listen EPERM` 失败；宿主运行相同范围后全部通过。
- 根级 `npm run build` 完成 Plugin Analyzer Host 和 Client lib 构建，随后嵌套 pnpm Web 构建停在 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；直接 Vite 生产构建通过。
- pnpm 为嵌套脚本尝试冗余自动安装。经验证的 `pnpm_config_trust_lockfile=true` 设置让完整文档门禁基于仓库锁文件完成。

## 变更边界

本任务拥有 22 个文件，范围覆盖 Plugin Analyzer Client、三个发布 manifest、定向 Web 覆盖、双语包文档与 Agent Note 更新、lockfile importer 和本 x-qdev 记录。现有 Plugin Doctor、生成文档、工具和 workspace 改动继续保持独立。本记录及其归属改动进入 Plugin Analyzer 交付提交。
