# rimworld_lab README

实验区总览与主线状态看 [status.md](status.md);Phase R/T/P 的需求、测试与设计看
[requirements.md](requirements.md)。本文只讲一件事:**工具 ↔ API 对应关系文档的
生成系统**——产物是什么、数据源在哪、怎么重新生成、增删 tools/api 时的修改顺序。

## 产物(均为生成物,禁止手编)

- [API-MAP.md](API-MAP.md) — 人读:读/控制工具与写工具的端点映射表(含 kind/action
  分发粒度)、未覆盖端点清单(待办池)、client.py 与 catalog 的 path 漂移提示、覆盖统计。
- [api-map.json](api-map.json) — 机器读:同源数据(`_header` 首键即警示),供后续
  DSH 漂移哨兵或 web 面消费。

两份产物顶部都带"自动生成内容，不要手动修改";手工改动会在下一次生成时被覆盖,
且新鲜度测试直接红。

## 数据源(改动的唯一入口)

| 数据 | 位置 | 说明 |
|---|---|---|
| 端点底册 | `rimapi/api_catalog.py` | GAME_CONTROL / READ_CATALOG / WRITE_CATALOG;API 进文档视野的唯一入口 |
| 读/控制工具映射 | `tool-protocol/tools/read_catalog.py` | `ReadToolSpec.endpoints`(分发值 → 端点键)+ `notes` 备注 |
| 写工具 | `tool-protocol/tools/catalog.py` | 名字与 WRITE_CATALOG 同名 join |

生成器:`tool-protocol/tools/gen_api_map.py`。

## 重新生成

```sh
cd rimworld_lab
uv run --project /Volumes/machub_app/proj/x-games/x-rimworld/RLE \
  python tool-protocol/tools/gen_api_map.py
```

(需 RLE uv 环境:生成器 import `tools.catalog`,其角色子集派生自 RLE 包。)

## 生成期校验(fail loud)

1. 工具 `endpoints` 引用的端点键必须存在于 catalog,否则生成即抛。
2. `endpoints` 分发键集必须等于参数模型 kind/action 的 Literal 枚举集;
   无分发工具的键必须且只能是 `""`。
3. 写工具名必须出现在 WRITE_CATALOG。
4. client.py 字面 path ↔ catalog 声明的双向差集只做**信息提示**(不阻断):
   `client_only` 是客户端实际调用但 catalog 未声明的 path(例如
   `/api/v1/colonist` vs catalog 的 `/api/v1/colonist/detailed`)——要么修
   client 路径,要么补 catalog 条目,二选一后重新生成。

测试守门:`tool-protocol/tools/tests/test_gen_api_map.py`——新鲜度对拍(改源
未重生成即红)、表头存在、覆盖分区(covered + uncovered == total)、三类非法
输入逐一拒绝。

## 增删 tools / api 的修改顺序

核心原则:**产物是"跑出来"的,不是"改出来"的,固定排最后**。顺序错了不会
悄悄错——角色子集引用、生成期校验、新鲜度测试三道守门会红。

主干(所有场景共用):

```
① requirements.md ② 补测试用例(先写,此刻失败)
② api_catalog.py   —— API 侧变更唯一入口
③ rimapi/client.py —— 需要新调用才动,配 MockTransport 单测
④ 工具定义          —— schemas/catalog 或 read_catalog,endpoints 填 catalog 键
⑤ 工具单测          —— schema 形状 + 执行分发 stub
⑥ 跑生成器          —— 刷新 API-MAP.md + api-map.json
⑦ 全量测试          —— 含映射校验 + 新鲜度测试
⑧ status.md / requirements.md 回填
```

按场景裁剪:

| 场景 | 相对主干的变化 |
|---|---|
| 加读工具 | ②先查端点在不在 catalog,不在先补条目;④`ReadToolSpec` 带 `endpoints` |
| 删工具 | ①记"不做了什么";④删定义 + 角色子集名字(import 时 fail loud 逼你删净);⑤删单测;该端点自动落回未覆盖表 |
| 加 API | 只走 ②⑥⑦:catalog 补条目 → 重新生成 → 未覆盖表自动出现(即待办池,不强制立刻做工具) |
| 删 API | ②删条目后 ⑥的映射校验立刻红,谁在引用一目了然;③同步清理 client 方法与测试 |

## 边界

- 覆盖统计的分母是 api_catalog 条目数,不是上游 RIMAPI 全量 166 端点;
  catalog 之外的上游端点不在本文档视野(要纳入先扩 catalog)。
- 写工具的执行真源在 RLE executor(tool → Action → executor → endpoint),
  本文档对写侧是名字级对齐。
