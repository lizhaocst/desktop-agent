# CLAUDE.md - test 工作区

## 角色与目标
- 你在 `dev/test` 分支工作区，职责是单元测试、集成测试、E2E 测试与回归验证。
- 目标是用可复现测试保障前后端变更质量。

## 本轮目标（R-P1-Loop）
- 本轮总目标：仅实现最小闭环 `输入 -> 模型 -> 流式返回 -> 渲染`，不做 Tool Calling/SQLite/多会话。
- test 本轮职责：
  - 每个单模块完成后立即执行单边验证（Owner + SHA）。
  - 仅当前后端全部模块完成后执行一次统一集成验证（FE_BASE_SHA + BE_BASE_SHA）。

统一验收标准（AC）：
1. 用户发送消息后，主进程调用模型并持续返回增量文本。
2. 前端消息可实时渲染增量内容。
3. 正常完成时状态从 `streaming` 切换为 `done`。
4. 异常时展示错误信息且不崩溃，可手动重试。

统一 IPC 契约（本轮冻结）：
- invoke: `chat:start`，入参 `{ sessionId: string, message: string }`，返回 `{ streamId: string }`
- event: `chat:stream`，载荷：
  - `{ streamId, type: 'start' }`
  - `{ streamId, type: 'delta', text }`
  - `{ streamId, type: 'done' }`
  - `{ streamId, type: 'error', message }`

## 允许修改的路径（ALLOW）
- `tests/**`
- `vitest.config.ts`、`playwright.config.ts`（若存在）
- 测试夹具、mock、测试辅助脚本

## 禁止修改的路径（DENY）
- `src/main/**` 功能实现
- `src/renderer/**` 功能实现
- 生产业务逻辑（除最小可测性注入并有说明）

## 输入契约（依赖谁的产出）
- frontend/backend 的功能提交与接口说明
- qa 的门禁规则与覆盖要求
- 单模块交接单（模块ID、Owner、SHA、Scope、AC、TestCmd）
- 全量集成交接单（轮次ID、FE_BASE_SHA、BE_BASE_SHA、ModuleList、AC、TestCmd）

## 输出契约（要交付什么）
- 可复现的测试用例与报告
- 失败最小复现步骤
- 风险分级说明（高/中/低）

## 开始开发前检查清单
- 阅读本文件后再动代码。
- 阅读全局规划文档：`/home/lizhao/projects/plan.md`。
- 运行 `git branch --show-current`，确认是 `dev/test`。
- 运行 `git status --short`，确认工作区干净。
- 确认当前契约版本与测试目标一致。

## 开发中规则
- 仅在测试路径编写代码，避免修改业务实现。
- 测试命名必须体现行为与预期。
- 对 flaky 测试标记原因，禁止静默跳过失败。
- 未收到完整交接单时，不执行测试。
- 单模块完成后立即执行单边验证；统一验证仅在“前后端全部模块完成”后执行一次。

## 单模块验收入口（必须）
- 测试端只接收以下格式交接单，字段不全直接退回 frontend/backend：

```text
[M-xxx] ready
Owner: frontend|backend
SHA: <owner_commit_sha>
Scope: <本模块改动范围/涉及文件/接口>
AC: <验收标准1>; <验收标准2>
TestCmd: npm run typecheck && npm run test:unit
```

## 单模块验收流程（必须）
- 基于交接单中的 `Owner + SHA` 执行，禁止“目测最新分支”替代。

```bash
MODULE_ID=M-xxx
OWNER=frontend # or backend
SHA=<owner_commit_sha>
VERIFY_BRANCH="verify/${OWNER}-${MODULE_ID}-$(date +%Y%m%d-%H%M%S)"

git fetch origin
git switch -c "$VERIFY_BRANCH" dev/test
git merge --no-edit "$SHA"
npm run typecheck
npm run test:unit
```

## 最终统一验证入口（必须）
- 仅当前后端确认“本轮全部模块开发完成”后，接受以下交接单：

```text
[R-xxx] integration-ready
FE_BASE_SHA: <frontend_commit_sha>
BE_BASE_SHA: <backend_commit_sha>
ModuleList: M-001,M-002,...
AC: <集成验收标准1>; <集成验收标准2>
TestCmd: npm run typecheck && npm run test
```

## 最终统一验证流程（必须）

```bash
ROUND_ID=R-xxx
FE_BASE_SHA=<frontend_commit_sha>
BE_BASE_SHA=<backend_commit_sha>
VERIFY_BRANCH="verify/integration-${ROUND_ID}-$(date +%Y%m%d-%H%M%S)"

git fetch origin
git switch -c "$VERIFY_BRANCH" dev/test
git merge --no-edit "$FE_BASE_SHA"
git merge --no-edit "$BE_BASE_SHA"
npm run typecheck
npm run test
```

## 验收结果输出模板（必须）
- 单模块通过：

```text
[M-xxx] PASS
Owner: frontend|backend
SHA: <owner_commit_sha>
Result: allow next module development
```

- 单模块失败：

```text
[M-xxx] FAIL
Owner: frontend|backend
SHA: <owner_commit_sha>
Severity: blocking/non-blocking
Owner: frontend/backend/contract
Repro: <最小复现步骤>
```

- 统一验证通过：

```text
[R-xxx] PASS
FE_BASE_SHA: <frontend_commit_sha>
BE_BASE_SHA: <backend_commit_sha>
Result: allow merge
```

- 统一验证失败：

```text
[R-xxx] FAIL
FE_BASE_SHA: <frontend_commit_sha>
BE_BASE_SHA: <backend_commit_sha>
Severity: blocking/non-blocking
Owner: frontend/backend/contract
Repro: <最小复现步骤>
```

## 提交前检查清单
- 运行 `npm run typecheck`。
- 若已配置测试脚本，运行单测和集成测试；E2E 至少抽样关键路径。
- 提交说明包含覆盖范围与未覆盖风险。

## 与其他分支冲突时的处理流程
- 发现契约漂移时，先回报到 frontend/backend，再调整测试。
- 对 breaking 变更先提交失败案例，再提交修复后的通过案例。
- 冲突期间保留最小复现脚本，便于跨分支协作。

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git status --short
git diff -- tests
npm run typecheck
```
