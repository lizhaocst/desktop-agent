# CLAUDE.md - frontend 工作区

## 角色与目标
- 你在 `dev/frontend` 分支工作区，职责是 Renderer UI、交互逻辑、状态管理与前端调用层。
- 目标是交付可用前端界面，并严格遵守前后端边界。

## 允许修改的路径（ALLOW）
- `src/renderer/**`
- `src/preload/index.d.ts`（仅类型契约声明）
- 前端相关静态资源与样式文件

## 禁止修改的路径（DENY）
- `src/main/**`
- `src/preload/index.ts`（桥接实现由 backend 负责）
- 数据库、工具执行与系统命令实现逻辑

## 输入契约（依赖谁的产出）
- backend 提供 IPC handler、工具返回结构、错误码约定。
- main/workflow 提供当前稳定契约与集成基线。

## 输出契约（要交付什么）
- 聊天与任务相关 UI 功能
- 对 IPC 的类型化调用
- 变更说明（涉及契约时必须标注）
- 模块交接信息（用于测试端验收）

## 开始开发前检查清单
- 阅读本文件后再动代码。
- 阅读全局规划文档：`/home/lizhao/projects/plan.md`。
- 运行 `git branch --show-current`，确认是 `dev/frontend`。
- 运行 `git status --short`，确认工作区干净。
- 拉取最新基线并确认契约文件版本。

## 开发中规则
- 仅修改 ALLOW 路径，禁止改 `src/main/**`。
- 任何 IPC 字段变更先改 `src/preload/index.d.ts`，再通知 backend 与 test。
- UI 变更不得依赖未定义的临时后端字段。
- 模块化开发强制规则：每完成一个模块（如一个组件/一个页面状态流），先执行最小验证（至少 `npm run typecheck:web`；若已有测试则执行对应测试），通过后才能开始下一个模块。
- 若当前模块测试失败，必须先修复并复测通过，禁止同时堆叠开发多个未通过测试的模块。
- 测试交接规则：模块测试通过后，必须与 backend 对齐，向 `dev/test` 提供统一交接单（模块ID + FE/BE SHA + 验收清单）。

## 模块交接单（发送给测试端）
- 发送时机：当前模块已完成且前端最小验证通过后。
- 必填字段缺失时，不得进入测试端验证。

```text
[M-xxx] ready
FE_SHA: <frontend_commit_sha>
BE_SHA: <backend_commit_sha>
Scope: <本模块改动范围/涉及文件/接口>
AC: <验收标准1>; <验收标准2>
TestCmd: npm run typecheck && npm run test
```

## 提交前检查清单
- 运行 `npm run typecheck:web`。
- 运行 `npm run lint`（若依赖可用）。
- 若本次改动涉及已存在测试模块，运行对应测试并记录结果。
- 已生成并发送模块交接单给测试端（或明确标记为未进入测试阶段）。
- 自查无越界改动（特别是 `src/main/**`）。

## 与其他分支冲突时的处理流程
- 如果冲突在 IPC 类型：先对齐契约文件，再改调用代码。
- 如果冲突在行为差异：以 backend 的可执行返回结构为准，frontend 适配展示。
- 冲突无法判定时，在提交说明中写明假设与影响范围。

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git status --short
git diff -- src/renderer src/preload/index.d.ts
npm run typecheck:web
npm run dev
```
