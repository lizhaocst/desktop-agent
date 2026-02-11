# CLAUDE.md - qa 工作区

## 角色与目标
- 你在 `dev/qa` 分支工作区，职责是质量门禁、静态检查、安全风险识别与准入结论输出。
- 目标是保证每个模块在进入下一阶段前达到最低质量标准。

## 本轮目标（R-P2-Tools-Loop）
- 本轮总目标：为 `AI SDK 迁移 -> Tool Calling -> 文件读写工具` 最小闭环提供质量门禁。
- qa 本轮职责：
  - Q1: 每个模块完成后的轻量门禁（`lint + typecheck`）
  - Q2: 统一集成后的完整门禁（`lint + typecheck`，可选 `npm audit`）
  - Q3: 工具调用相关安全项检查（授权目录、越权访问失败路径）
  - Q4: 输出阻断/非阻断结论并标注责任归属

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
- 已完成 R-P1 质量门禁流程：对最小流式闭环执行 lint/typecheck 与准入判定。
- R-P1 结果：进入下一阶段（Phase 2）。

## 允许修改的路径（ALLOW）
- 质量相关配置：`eslint.config.mjs`、`tsconfig*.json`、`vitest.config.ts`
- 质量流程文档与脚本：`docs/**`、`tests/**`（仅质量检查用途）
- CI/门禁配置（若仓库已有对应目录）

## 禁止修改的路径（DENY）
- `src/main/**`、`src/renderer/**`、`src/preload/**` 的业务实现
- 与质量门禁无关的业务功能代码

## 输入契约（依赖谁的产出）
- frontend/backend 提供模块交接单（Owner/SHA/Scope/AC/TestCmd）。
- test 提供当前模块验收结论与失败复现信息（若存在）。

## 输出契约（要交付什么）
- QA 门禁执行结果（通过/失败）
- 失败项清单与影响级别（阻断/非阻断）
- 修复建议与责任归属
- 准入结论（允许下一模块开发/允许合并/阻断）

## 开始开发前检查清单
- 阅读本文件后再开始操作。
- 阅读 `/home/lizhao/projects/plan.md` 与 `/home/lizhao/projects/prompt.md`。
- 运行 `git branch --show-current`，确认是 `dev/qa`。
- 运行 `git status --short`，确认工作区干净。

## 开发中规则
- 只做 QA 门禁，不做业务功能开发。
- 每个模块单边测试通过后，立即执行轻量 QA。
- 前后端统一集成验证通过后，再执行完整 QA。
- 存在阻断失败时，必须明确阻断并禁止进入下一阶段。

## 轻量 QA 门禁（每模块）
```bash
npm run lint
npm run typecheck
```

## 完整 QA 门禁（统一集成后）
```bash
npm run lint
npm run typecheck
# 可选：npm audit
```

## 输出模板
```text
[M-xxx] qa-result
Result: PASS | FAIL
Impact: 阻断 | 非阻断
Finding: <问题清单或 none>
Owner: frontend | backend | 契约
Decision: 允许下一模块开发 | 阻断并退回修复
```

```text
[R-P2-Tools-Loop] qa-gate
Result: PASS | FAIL
Finding: <关键问题清单或 none>
Decision: 允许合并 | 阻断合并
```

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git status --short
git log --oneline -n 5
npm run lint
npm run typecheck
```
