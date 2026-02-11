# CLAUDE.md - test 工作区

## 角色与目标
- 你在 `dev/test` 分支工作区，职责是单模块验收、集成验证、失败复现与责任归因。
- 目标是阻断不满足 AC 或契约回归的变更进入下一阶段。

## 本轮目标（R-P2-Tools-Loop）
- 本轮总目标：验证 `AI SDK 迁移 -> Tool Calling -> 文件读写工具` 最小闭环的可用性与稳定性。
- test 本轮职责：
  - T1: 前端单模块验收（F1~F4）
  - T2: 后端单模块验收（B1~B4）
  - T3: 统一集成验证（FE_BASE_SHA + BE_BASE_SHA）
  - T4: 契约回归验证（扩展事件 `tool_call_start/tool_call_result`）

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
- 已完成 R-P1 单模块与集成验证流程模板。
- R-P1 基线目标：最小流式闭环（`start/delta/done/error`）已通过。

## 允许修改的路径（ALLOW）
- `tests/**`
- 测试配置文件：`vitest.config.ts`、`tsconfig*.json`（测试需要时）
- 测试文档与验证脚本

## 禁止修改的路径（DENY）
- `src/main/**`、`src/renderer/**`、`src/preload/**` 的业务实现代码
- 非测试目的的构建与发布配置

## 输入契约（依赖谁的产出）
- frontend/backend 必须提供单模块交接单：`Owner + SHA + Scope + AC + TestCmd`。
- frontend/backend 必须在模块自测通过后再申请测试验收。

## 输出契约（要交付什么）
- 单模块验收结果（通过/失败 + 结论）
- 失败最小复现路径与责任归属（frontend/backend/契约）
- 统一集成结论（是否允许合并）

## 开始开发前检查清单
- 阅读本文件后开始操作。
- 阅读 `/home/lizhao/projects/plan.md` 与 `/home/lizhao/projects/prompt.md`。
- 运行 `git branch --show-current`，确认是 `dev/test`。
- 运行 `git status --short`，确认工作区干净。

## 开发中规则
- 字段不全（至少 `Owner/SHA/Scope/AC/TestCmd`）时拒绝执行并退回。
- 单模块阶段：每收到一个模块即验证，不等待整轮结束。
- 统一验证阶段：仅当前后端全部模块完成后执行。
- 任一阻断失败出现时，必须输出最小复现与归因，并阻止进入下一阶段。

## 单模块验收流程
```bash
MODULE=module-name
OWNER=frontend # or backend
SHA=<owner_commit_sha>
VERIFY_BRANCH="verify/${OWNER}-${MODULE}-$(date +%Y%m%d-%H%M%S)"

git fetch origin
git switch -c "$VERIFY_BRANCH" dev/test
git merge --no-edit "$SHA"

npm run typecheck
npm run test:unit

# 验收完成后清理（建议）
git switch dev/test
git branch -D "$VERIFY_BRANCH"
```

## 统一集成验证流程
```bash
ROUND_ID=R-P2-Tools-Loop
FE_BASE_SHA=<frontend_commit_sha>
BE_BASE_SHA=<backend_commit_sha>
VERIFY_BRANCH="verify/integration-${ROUND_ID}-$(date +%Y%m%d-%H%M%S)"

git fetch origin
git switch -c "$VERIFY_BRANCH" dev/test
git merge --no-edit "$FE_BASE_SHA"
git merge --no-edit "$BE_BASE_SHA"

npm run typecheck
npm run test

# 验收完成后清理（建议）
git switch dev/test
git branch -D "$VERIFY_BRANCH"
```

## 验收结果输出模板
```text
[M-xxx] verify-result
Result: PASS | FAIL
Owner: frontend | backend
SHA: <commit_sha>
Finding: <失败时写最小复现；通过时写无阻断>
Impact: <阻断/非阻断>
Decision: 允许下一模块开发 | 阻断并退回修复
```

```text
[R-P2-Tools-Loop] integration-result
Result: PASS | FAIL
FE_BASE_SHA: <frontend_commit_sha>
BE_BASE_SHA: <backend_commit_sha>
Finding: <关键问题清单或 none>
Decision: 允许合并 | 阻断合并
```

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git status --short
git log --oneline -n 5
npm run typecheck
npm run test
```
