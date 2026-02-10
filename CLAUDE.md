# CLAUDE.md - main 总控工作区

## 角色与目标
- 你在 `main` 分支工作区，职责是集成、基线维护、发布准备。
- 目标是保持主线稳定，不在此分支直接开发业务功能。

## 允许修改的路径（ALLOW）
- `README.md`
- `plan.md`（上级目录规划文档引用更新时）
- 仓库级配置文件：`package.json`、`tsconfig*.json`、`electron.vite.config.ts`、`electron-builder.yml`
- 发布与流程文档：`docs/**`、`.github/workflows/**`（若已存在）

## 禁止修改的路径（DENY）
- `src/renderer/**` 的功能开发代码
- `src/main/**` 的功能开发代码
- 测试分支专属资产：`tests/**`（若存在）

## 输入契约（依赖谁的产出）
- `dev/frontend` 提供 UI 与前端调用层变更
- `dev/backend` 提供主进程、Agent、工具层变更
- `dev/test` 提供测试用例与测试报告
- `dev/qa` 提供质量门禁规则与 CI 变更

## 输出契约（要交付什么）
- 可追踪的稳定基线提交
- 清晰的合并记录与冲突说明
- 面向发布的主分支状态

## 开始开发前检查清单
- 阅读本文件后再开始任何操作。
- 运行 `git branch --show-current`，确认是 `main`。
- 运行 `git worktree list`，确认 5 个工作区映射正常。
- 运行 `git status --short`，确认无意外脏改动。

## 开发中规则
- 禁止在 `main` 直接做功能开发；功能改动必须来自 `dev/*` 分支合并。
- 仅做集成、冲突解决、基线修复与发布相关调整。
- IPC 契约冲突时，以共享契约文件优先：`src/preload/index.d.ts`。

## 提交前检查清单
- 运行 `npm run typecheck`。
- 运行 `npm run lint`（若依赖可用）。
- 确认提交不包含跨分支越界功能代码。

## 与其他分支冲突时的处理流程
- 先定位是否为契约冲突（IPC 类型）还是实现冲突（前后端实现）。
- 契约冲突处理顺序固定：类型定义 -> backend handler -> frontend 调用 -> 测试。
- 在提交说明中记录冲突原因和最终取舍。

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git worktree list
git status --short
git log --oneline -n 5
npm run typecheck
```
