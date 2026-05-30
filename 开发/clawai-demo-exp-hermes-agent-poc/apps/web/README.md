# Web — 前端应用

制造咨询智能体的 Web 前端，基于 React + TypeScript + Vite。

## 页面

| 路由 | 页面 | 说明 |
|---|---|---|
| `/wizard` | 向导页 | 选择分析参数（站点、日期范围、分析模式），提交任务 |
| `/tasks/:taskId` | 任务页 | 轮询任务进度，展示步骤状态 |
| `/reports/:taskId` | 报告页 | 按 StructuredReport 渲染结构化分析报告 |

## 技术栈

- React 18 + TypeScript
- React Router v6
- Vite 5
- Tailwind CSS

## 开发

```bash
pnpm dev:web
```

默认端口：`5173`（Vite 开发服务器，API 代理到 BFF `3001`）

## 架构原则

- 前端只消费 `StructuredReport`，不拼装业务结论
- 按 `ReportBlock.type` 选择渲染组件，不做指标口径推导
- 渲染流程：`ReportRenderer` 扫描 `sections[].blocks[]` → 按 type 映射到 `ChartBlock` / `KpiCardsBlock` / `TableBlock` / `MarkdownBlock` / `InsightListBlock`

详情见 `src/features/reporting/README.md`。
