# CLAUDE.md - backend 工作区

## 角色与目标
- 你在 `dev/backend` 分支工作区，职责是 Electron 主进程、Agent 引擎、工具层、IPC handler 与数据层。
- 目标是保证工具执行可靠、IPC 接口稳定、错误可追踪。

## 允许修改的路径（ALLOW）
- `src/main/**`
- `src/preload/index.ts`（桥接实现）
- `src/preload/index.d.ts`（与 frontend 协同时）
- 后端相关配置文件（必要时）

## 禁止修改的路径（DENY）
- `src/renderer/**` 的 UI 结构与样式逻辑
- 前端状态管理与组件渲染代码

## 输入契约（依赖谁的产出）
- frontend 提供调用需求与展示字段需求。
- test 提供失败复现与覆盖缺口。
- qa 提供类型、lint、安全门禁要求。

## 输出契约（要交付什么）
- 可调用的 IPC handler
- 稳定的工具入参与返回结构
- 明确错误对象与可观测日志信息

## 开始开发前检查清单
- 阅读本文件后再动代码。
- 阅读全局规划文档：`/home/lizhao/projects/plan.md`。
- 运行 `git branch --show-current`，确认是 `dev/backend`。
- 运行 `git status --short`，确认工作区干净。
- 检查 IPC 契约文件与 frontend 预期一致。

## 开发中规则
- 禁止修改 `src/renderer/**`。
- IPC 变更必须先更新 `src/preload/index.d.ts`，再更新 handler 实现。
- Shell/File 等工具必须具备错误处理与超时策略。

## 提交前检查清单
- 运行 `npm run typecheck:node`。
- 运行 `npm run lint`（若依赖可用）。
- 自查返回结构是否与契约一致，避免隐式 breaking change。

## 与其他分支冲突时的处理流程
- IPC 冲突以类型契约先行，frontend/backend 同步调整。
- 行为冲突优先保证可执行性与错误可解释性。
- 记录冲突决策和兼容策略到提交说明。

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git status --short
git diff -- src/main src/preload
npm run typecheck:node
npm run dev
```
