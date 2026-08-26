# bundle/ — profile plugin bundles

English | [中文](README.zh.md)

Profile bundles: npm packages whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, making them installable patch layers for `dsh --profile` compositions ([profile contract](../boot/app-boot/README.md#profiles)). A bundle's substance is its patch list; some also ship runtime glue plugins their patch mounts.

| Package | Role | ctx key |
|---|---|---|
| [`base/`](base/README.md) | The shared dsh core every profile applies first | — (patch only) |
| [`web-app/`](web-app/README.md) | Browser surface: web patch layer + runtime glue plugin | mounts rows |
| [`headless/`](headless/README.md) | Direct one-shot task mode over base, with no Host or Web layer | mounts `headless-runner` |
| [`plugin-analyzer/`](plugin-analyzer/README.md) | Opt-in Host plugin behavior diagnostics and Web Settings tab | mounts Analyzer rows |
| [`plugin-doctor/`](plugin-doctor/README.md) | Installable plugin and profile health checks, with a CLI and model tool | mounts `plugin-doctor` |

In-box bundles resolve from the dsh installation; out-of-tree bundles install into a profile through `dsh plugin --profile <name> add <package>`.
