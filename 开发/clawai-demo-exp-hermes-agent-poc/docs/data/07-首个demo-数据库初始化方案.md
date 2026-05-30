# 1. 首个 Demo 数据库初始化方案

## 1.1 目标

给“在线一次校验合格率管控”首个 demo 提供一套可直接落地的数据库初始化方案，明确为什么要拆成两个库、每个库先建哪些表，以及脚本执行顺序。

## 1.2 建议库划分

即使当前只有一台测试数据库服务器，也建议至少拆成两个数据库：

- `mes_demo`：模拟 `MES/MOM` 业务来源数据，只放业务源表。
- `ce_agent_demo`：应用自有数据库，只放任务、报告、审计、规则和配置。

如果测试环境不方便创建多个数据库，次优方案是同库双 schema：

- `mes_demo.*`
- `ce_agent.*`

但从后续接入真实环境、权限隔离和迁移成本看，**优先推荐双数据库**。

## 1.3 为什么不建议只建一个库

- 业务源数据与应用写入数据职责不同，混放后容易把边界做乱。
- 应用库后续会持续新增任务、报告、审计、规则和缓存类表，不适合塞进 `MES` 侧。
- 语义层对 `MES` 应是受控只读访问，应用库则需要正常读写。
- 后续如果把模拟 `MES` 替换成真实 `MES`、ODS 或镜像库，应用库可以保持不动。

## 1.4 最小建表范围

### 1.4.1 `mes_demo`

首版建议先建 6 张核心表：

1. `tsh_pro_stock_record`
2. `tdmmm`
3. `tqmtq_entrust_result`
4. `sys_dict_data`（承载 `dict_type = qm_test_type`）
5. `tqmtj_deal_mat_info`
6. `teq_repair_manage`

这 6 张表已经足够支撑：

- 一次校验合格率趋势
- 不合格批次数
- 不合格项目结构
- 检验项目字典对齐
- 混料线索
- 设备事件关联

### 1.4.2 `ce_agent_demo`

首版建议先建 6 张应用表：

1. `analysis_task`
2. `analysis_task_event`
3. `structured_report`
4. `item_category_mapping`
5. `rule_config`
6. `metric_query_audit`

这 6 张表已经足够支撑：

- 任务持久化
- 报告落库
- 规则版本化
- 检验项目业务分类映射
- 语义层查询审计

## 1.5 脚本位置与执行顺序

当前仓库已增加以下 `MySQL 8.0` 脚本：

1. `scripts/sql/mysql/00-create-databases.sql`
2. `scripts/sql/mysql/01-mes-demo-schema.sql`
3. `scripts/sql/mysql/02-ce-agent-demo-schema.sql`

建议执行顺序：

1. 先连接数据库服务器，执行 `00` 创建两个库。
2. 切换连接到 `mes_demo`，执行 `01`。
3. 切换连接到 `ce_agent_demo`，执行 `02`。

## 1.6 与当前架构的对应关系

- `mes_demo`：由 `services/semantic-api` 通过受控 SQL 或 repository 读取。
- `ce_agent_demo`：由 `apps/bff`、`services/report-service`、`services/playbook-engine` 读写。
- `OpenClaw`：仍不直接访问数据库，只调用受控服务。

## 1.7 当前未纳入首批脚本的内容

以下内容先不进首批初始化脚本，等首个 demo 主链路跑通后再补：

- 全量工序投入 / 产出表（`tap_*_input`、`tap_*_output`）
- Redis 初始化
- 数据库用户、权限、只读账号脚本
- 真实 `MES` 同步或镜像方案
- 大批量 demo seed 数据

## 1.8 建议下一步

- 当前默认数据库为 `MySQL 8.0`，脚本按 `utf8mb4` 和 `InnoDB` 编写。
- 先在测试库服务器执行这 3 个脚本，把双库空表建起来。
- 然后我可以继续补：
  - 一版 demo seed 数据脚本
  - `apps/bff` 的 MySQL 持久化接入
  - `services/semantic-api` 的首批 SQL 模板
