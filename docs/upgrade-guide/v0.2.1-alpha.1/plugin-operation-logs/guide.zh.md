---
kind: upgrade-guide
description: "dsh plugin 包操作诊断从 profile 目录迁移至 Harness home 的日志目录。"
---

# 插件操作日志

[English](guide.md) | 中文

## 变更

`dsh plugin` 以前将包操作诊断写入 `<profile>/.plugin-manager/logs/`，现在写入 `$DSH_HOME/logs/plugin-manager/<profile>/`，包括 profile 目录链接到共享源码的情况。按目录收集诊断的程序需要更新路径。运行中的插件管理器保留 profile 本地默认目录，并接受绝对路径配置字段 `logRoot`。

## 迁移

1. 将 `dsh plugin` 的日志收集目录更新为 `$DSH_HOME/logs/plugin-manager/<profile>/`，或使用每次操作返回的 `logPath`。
2. 将 Web 与 Agent 的安装诊断收集到同一位置时，在 profile 的 `plugin-manager` 条目配置 `logRoot: !!js dshHomePath('logs', 'plugin-manager', '<profile>')`，随后重启或重新加载 profile。
3. 运行一次包操作并确认诊断路径。现有 profile 文件与 `.plugin-manager/run.json` 保留在当前位置；共享 profile 的安装协调使用这些文件。
