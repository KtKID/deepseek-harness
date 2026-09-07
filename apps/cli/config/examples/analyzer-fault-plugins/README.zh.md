# 分析器用故障插件

[English](README.md) | 中文

四个本地 Cordis 插件，各自产生一种 Plugin Analyzer 诊断。本包遵循[打包与安装](../../docs/user/develop/basic/publish.md)的目录约定（`package.json`、ESM exports、用包名引用的 patch 行），并且**不是**组合包：它没有 `dsh.bundle`，因此 `dsh plugin add` 只把它装成普通依赖，不会插入任何 Loader 行。

每种诊断一个目录（`unread-mail/`、`nested-crash/`、`self-unload/`、`isolated-inbox/`），里面是插件模块和用户 patch 片段。

激活走 profile 的用户层。在 Web 已经运行时，把其中一个目录的 `patch.yml` 追加进 `$DSH_HOME/profiles/web/cordis.patch.yml` 并保存；被监视的用户层会重新挂载该行。删掉这段再保存即卸载。

不要在启动前加入 `unread-mail`、`isolated-inbox` 或 `self-unload`。生产启动会拒绝一直处于等待中、或没有存活根 Fiber 的已启用行。`nested-crash` 可以出现在启动配置里，因为它的根 Fiber 是运行中。

## 安装

在仓库根目录，且 web profile 已装有 Plugin Analyzer 时：

```sh
pnpm dsh plugin --profile web add ./apps/cli/config/examples/analyzer-fault-plugins
```

`dsh plugin` 会警告该包未声明 `dsh.bundle`。这是预期结果。

## Patch 片段

把**其中一段**追加到已有的 webserver 覆盖之下。使用包名，不要用相对路径：patch 文件不会改变 Loader 解析模块时所用的 profile 目录。

缺失依赖（`unread-mail` 注入 `unreadMailStore`，没有任何提供方）：

```yaml
- insert:
    - id: unread-mail
      name: dsh-analyzer-fault-plugins/unread-mail
```

子 Fiber 失败（`nested-crash` 挂载一个 `apply` 会抛错的子插件；根保持运行中）：

```yaml
- insert:
    - id: nested-crash
      name: dsh-analyzer-fault-plugins/nested-crash
```

根 Fiber 丢失（`self-unload` 在 `apply` 返回后拆掉 Loader 拥有的根 Fiber，并保持该行启用）：

```yaml
- insert:
    - id: self-unload
      name: dsh-analyzer-fault-plugins/self-unload
```

隔离不匹配（`cordis:group` 把 `isolatedInbox` 隔在 store 周围；消费者在组外注入该服务）：

```yaml
- insert:
    - id: isolated-inbox
      name: dsh-analyzer-fault-plugins/isolated-inbox
    - id: isolated-inbox-realm
      name: cordis:group
      group: true
      isolate:
        isolatedInbox: true
      config:
        - id: isolated-inbox-store
          name: dsh-analyzer-fault-plugins/isolated-inbox-store
```

打开设置 → 插件 → 插件分析并刷新。隔离收件箱是一整段组合：只插入消费者会退化成普通缺失依赖。

## 限制

本包是本地 checkout。它不是已发布的市场组合包，也不属于已交付的 Plugin Analyzer 或 Web 层。
