# Report Service

负责汇总规则结果与模型解释，并输出统一的结构化报告 JSON。

该服务不得改写核心数字来源，只能装配、校验与序列化报告协议。

## 当前已实现接口

- `GET /health`
- `POST /reports/build`

## 启动方式

```bash
pnpm --filter report-service dev
```

默认端口：

- `3030`

## 说明

当前 `report-service` 负责：

- 接收 `semantic-api` 指标结果
- 接收 `playbook-engine` 规则结果
- 组装 `StructuredReport`

当前不负责：

- 自行查数据库
- 自行执行规则判断
- 改写核心数字
