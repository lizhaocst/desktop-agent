# CLAUDE.md - test 工作区

## 角色与目标
- 你在 `dev/test` 分支工作区，职责是单元测试、集成测试、E2E 测试与回归验证。
- 目标是用可复现测试保障前后端变更质量。

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
