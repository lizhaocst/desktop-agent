# CLAUDE.md - qa 工作区

## 角色与目标
- 你在 `dev/qa` 分支工作区，职责是质量门禁、静态检查、类型约束、安全审计与 CI 流程。
- 目标是建立可自动执行的质量标准并阻断高风险变更进入主线。

## 本轮目标（R-P1-Loop）
- 本轮总目标：仅实现最小闭环 `输入 -> 模型 -> 流式返回 -> 渲染`，不做 Tool Calling/SQLite/多会话。
- qa 本轮职责：
  - 单模块阶段执行轻量 QA（lint/typecheck）。
  - 统一验证阶段执行完整 QA（lint/typecheck/安全与构建项）。

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
- `eslint.config.mjs`
- `.prettierrc*`、`.prettierignore`
- `tsconfig*.json`
- `.github/workflows/**`（若存在）
- `scripts/**`、`docs/**`（若存在）
- `package.json`（仅质量脚本相关）

## 禁止修改的路径（DENY）
- `src/main/**` 功能实现
- `src/renderer/**` 功能实现
- 测试业务逻辑本身（仅可调测试执行策略）

## 输入契约（依赖谁的产出）
- frontend/backend/test 的当前实现与测试结果
- main 的集成基线与发布要求

## 输出契约（要交付什么）
- 明确的 lint/typecheck/security 门禁规则
- CI 可执行配置
- 质量报告模板与阻断标准

## 开始开发前检查清单
- 阅读本文件后再动代码。
- 阅读全局规划文档：`/home/lizhao/projects/plan.md`。
- 运行 `git branch --show-current`，确认是 `dev/qa`。
- 运行 `git status --short`，确认工作区干净。
- 检查当前脚本是否可覆盖质量目标。

## 开发中规则
- 仅修改质量治理相关文件，不改业务功能代码。
- 规则升级优先“可执行”和“可解释”，避免无依据的风格争议。
- 新增门禁需说明价值、失败示例和豁免条件。
- QA 采用两阶段：单模块阶段做轻量门禁（lint/typecheck），最终统一验证阶段做完整门禁（lint/typecheck/安全与构建项）。

## 提交前检查清单
- 运行 `npm run lint`。
- 运行 `npm run typecheck`。
- 若配置了安全脚本，执行并附结果摘要。
- 明确标注本次是“单模块 QA”还是“统一验证 QA”。

## 与其他分支冲突时的处理流程
- 先确保质量规则不破坏已有可运行基线。
- 冲突优先级：类型安全 > 构建稳定性 > 风格一致性。
- 记录规则变更对开发体验与 CI 时长的影响。

## 常用命令（仅本分支相关）
```bash
git branch --show-current
git status --short
git diff -- eslint.config.mjs tsconfig.json package.json
npm run lint
npm run typecheck
```
