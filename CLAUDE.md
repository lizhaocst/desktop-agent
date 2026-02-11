# CLAUDE.md - frontend 工作区

## 角色与目标
- 你在 `dev/frontend` 分支工作区，职责是 Renderer UI、交互逻辑、状态管理与前端调用层。
- 目标是交付可用前端界面，并严格遵守前后端边界。

## 本轮目标（R-P2-Tools-Loop）
- 本轮总目标：实现 `AI SDK 迁移 -> Tool Calling -> 文件读写工具` 的最小闭环；暂不做 Shell/SQLite/多会话。
- frontend 本轮职责：
  - F1: 兼容新增流事件（`tool_call_start` / `tool_call_result`）并可见化最小状态
  - F2: 保持现有流式渲染状态管理无回归（`start/delta/done/error`）
  - F3: IPC 调用层兼容扩展事件（调用 `chat:start` + 订阅 `chat:stream`）
  - F4: 工具执行错误展示与最小重试入口

## 本轮进度（R-P2-Tools-Loop）
- [ ] F1 完成并通过最小验证
- [ ] F2 完成并通过最小验证
- [ ] F3 完成并通过最小验证
- [ ] F4 完成并通过最小验证

统一验收标准（AC）：
1. 主进程改用 Vercel AI SDK 发起流式对话，前端渲染无回归。
2. 模型可触发至少 1 个工具调用（文件读取或写入）并返回结果。
3. 工具仅允许在用户授权目录内执行，越权访问必须失败并返回错误。
4. 正常完成时状态从 `streaming` 切换为 `done`。
5. 异常时展示错误信息且不崩溃，可手动重试。

统一 IPC 契约（本轮冻结）：
- invoke: `chat:start`，入参 `{ sessionId: string, message: string }`，返回 `{ streamId: string }`
- event: `chat:stream`，载荷：
  - `{ streamId, type: 'start' }`
  - `{ streamId, type: 'delta', text }`
  - `{ streamId, type: 'tool_call_start', toolName, callId }`
  - `{ streamId, type: 'tool_call_result', toolName, callId, ok, output?, error? }`
  - `{ streamId, type: 'done' }`
  - `{ streamId, type: 'error', message }`

## 历史轮次（R-P1-Loop，已完成）
- 已完成模块：F1 + F2 + F3 + F4
- 验收状态：`[R-P1-Loop-FE] PASS`
- 关键提交：`e46d1b4`（`fix(renderer): handle IME enter and stabilize chat stream rendering`）
- 备注：R-P1 仅覆盖 `start/delta/done/error` 的最小流式闭环。

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
- 模块交接信息（用于测试端单模块验收）
- 全量集成交接信息（用于最终统一验收）

## 开始开发前检查清单
- 阅读本文件后再动代码。
- 阅读全局规划文档：`/home/lizhao/projects/plan.md` 与 `/home/lizhao/projects/prompt.md`。
- 运行 `git branch --show-current`，确认是 `dev/frontend`。
- 运行 `git status --short`，确认工作区干净。
- 拉取最新基线并确认契约文件版本。

## 开发中规则
- 仅修改 ALLOW 路径，禁止改 `src/main/**`。
- 任何 IPC 字段变更先改 `src/preload/index.d.ts`，再通知 backend 与 test。
- UI 变更不得依赖未定义的临时后端字段。
- 模块化开发强制规则：每完成一个模块（组件/页面状态流），先执行最小验证（至少 `npm run typecheck:web`；若已有测试则执行对应测试），通过后才能开始下一个模块。
- 若当前模块测试失败，必须先修复并复测通过，禁止同时堆叠开发多个未通过测试的模块。
- 测试交接规则（单模块阶段）：每完成一个前端模块并自测通过，必须立即向 `dev/test` 提供单模块交接单并触发单边验证。
- 统一验证规则（最终阶段）：仅当前后端所有模块都完成后，才向 `dev/test` 提交“全量集成交接单”进行统一验证。

## 单模块交接单（发送给测试端）
- 发送时机：当前前端模块已完成且前端最小验证通过后。
- 必填字段缺失时，测试端必须退回。

```text
[M-xxx] ready
Owner: frontend
SHA: <frontend_commit_sha>
Scope: <本模块改动范围/涉及文件/接口>
AC: <验收标准1>; <验收标准2>
TestCmd: npm run typecheck && npm run test:unit
```

## 全量集成交接单（最终统一验证）
- 发送时机：frontend 与 backend 均确认“本轮全部模块完成”后。

```text
[R-xxx] integration-ready
FE_BASE_SHA: <frontend_commit_sha>
BE_BASE_SHA: <backend_commit_sha>
ModuleList: M-001,M-002,...
AC: <集成验收标准1>; <集成验收标准2>
TestCmd: npm run typecheck && npm run test
```

## 提交前检查清单
- 运行 `npm run typecheck:web`。
- 运行 `npm run lint`（若依赖可用）。
- 若本次改动涉及已存在测试模块，运行对应测试并记录结果。
- 当前模块已生成并发送“单模块交接单”给测试端（或明确标记未完成模块）。
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
