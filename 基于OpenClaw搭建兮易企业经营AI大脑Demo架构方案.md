# 基于OpenClaw搭建兮易企业经营AI大脑本地Demo — 三层架构方案

> 输出时间：2026-05-30  
> 场景：IT公司内部Demo，展示给制造业潜在客户  
> 基础：已有OpenClaw环境 + 股票系统(8887/8888/8889端口) + MySQL + Nginx

---

## 总览：架构全景

```
┌────────────────────────────────────────────────────────────────────────┐
│                    🌐 Nginx 代理层 (统一入口)                          │
│            xiyi-demo.yourdomain.com → 独立路由                        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│  展示层 (Tony)     │    │  功能层 (Antony)   │    │  数据层 (Hugo)    │
│  SPA前端(深色工业风)│    │  OpenClaw Agent   │    │  MySQL + 模拟数据 │
│  复用stock-manager │    │  + Skill体系      │    │  + 定时任务       │
│  框架 + 新增页面   │    │  + 外部API        │    │  + 自动化管道     │
└───────────────────┘    └───────────────────┘    └───────────────────┘
        │                         │                         │
        └───────────┬─────────────┴─────────────┬───────────┘
                    ▼                           ▼
            ┌─────────────────┐    ┌─────────────────────┐
            │ OpenClaw Gateway │    │ MySQL Database      │
            │ (Agent调度)      │    │ 8张模拟数据表       │
            │ 8888(已有)       │    │ + Cron定时任务      │
            └─────────────────┘    └─────────────────────┘
```

---

## 一、Hugo（数据层）：制造业模拟数据集 + 数据管道

### 1.1 数据策略：没有真实ERP/MES怎么办

**核心原则**：用"场景驱动模拟"替代"真实数据对接"，让Demo数据看起来足够真实但不依赖外部系统。

#### 方案：Python脚本生成 + MySQL存储 + 定时任务增量模拟

生成一个中等规模的离散制造业样例企业，设定如下画像：

| 维度 | 值 |
|------|----|
| **企业类型** | 装备制造（非标零部件+标准品混合） |
| **员工** | ~800人 |
| **年产值** | ~5亿RMB |
| **系统** | 模拟有ERP（用友/金蝶风格）+ MES + WMS + 财务系统 |
| **产品线** | 3条（A-精密零部件 / B-标准传动件 / C-非标定制） |
| **客户** | 8-12家制造业客户，含月结/预付/赊销 |

### 1.2 数据集设计（8张表）

```
┌─────────────────────────────────────────────────────────────────┐
│                    兮易Demo 数据模型                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                │
│  [订单表] orders ────→ [生产工单] work_orders ──→ [质量检验] quality_inspections
│     │                       │                          │
│     │                       ▼                          │
│     ├──→ [采购单] purchases ──→ [到货单] receipts       │
│     │                                                  │
│     ├──→ [库存] inventory                                │
│     │                                                  │
│     └──→ [财务] finance (应收账款/应付账款/费用) ────────┘
│                                                                │
│  [基准数据] product_catalog (产品BOM/工艺路线/标准成本)       │
│                                                                │
│  [异常事件表] anomaly_events (系统自动日志化的异常记录)         │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

#### 详细表结构

**① product_catalog（产品目录/BOM）**
```sql
CREATE TABLE product_catalog (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(200),
  category VARCHAR(50),        -- A类/B类/C类
  bom_cost DECIMAL(12,2),       -- 标准BOM成本
  process_route TEXT,           -- 工艺路线（JSON: step列表）
  standard_price DECIMAL(12,2),
  unit VARCHAR(20) DEFAULT '件',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- 预生成30-50个产品，3条产品线分配
```

**② orders（销售订单）**
```sql
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(100),
  product_code VARCHAR(50),
  quantity INT,
  unit_price DECIMAL(12,2),
  total_amount DECIMAL(14,2),
  order_date DATE,
  delivery_date DATE,           -- 合同交期
  actual_delivery_date DATE,    -- 实际交付日期
  status ENUM('new','confirmed','in_production','partially_delivered','delivered','closed'),
  priority INT DEFAULT 2,       -- 1急/2普通/3低
  sales_person VARCHAR(50)
);
-- 预生成200-500条订单，覆盖过去6个月，包含部分延期/异常
```

**③ work_orders（生产工单）**
```sql
CREATE TABLE work_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wo_no VARCHAR(50) NOT NULL UNIQUE,
  order_id INT,
  product_code VARCHAR(50),
  planned_qty INT,
  completed_qty INT,
  start_time DATETIME,
  end_time DATETIME,
  actual_end_time DATETIME,
  scrap_qty INT DEFAULT 0,      -- 废品数
  rework_qty INT DEFAULT 0,     -- 返工数
  machine_id VARCHAR(50),
  status ENUM('planned','running','completed','paused','cancelled'),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
-- 每条订单对应1-3个工单，包含不同工序状态
```

**④ quality_inspections（质量检验记录）**
```sql
CREATE TABLE quality_inspections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  work_order_id INT,
  inspect_time DATETIME,
  inspect_type ENUM('incoming','in_process','final','outgoing'),
  item_name VARCHAR(100),         -- 检验项（尺寸/硬度/表面/气密性等）
  spec_min DECIMAL(10,4),
  spec_max DECIMAL(10,4),
  actual_value DECIMAL(10,4),
  result ENUM('pass','fail','rework'),
  defect_reason VARCHAR(500),     -- 不合格原因说明
  inspector VARCHAR(50)
);
-- 生成500-2000条检验记录，fail率控制在5-15%
```

**⑤ inventory（库存台账）**
```sql
CREATE TABLE inventory (
  id INT PRIMARY KEY AUTO_INCREMENT,
  material_code VARCHAR(50),
  material_name VARCHAR(200),
  warehouse VARCHAR(50),         -- 原材料库/半成品库/成品库
  quantity DECIMAL(12,2),
  unit VARCHAR(20),
  unit_cost DECIMAL(12,2),
  last_movement DATE,
  days_in_stock INT,             -- 呆滞天数
  status ENUM('active','slow_moving','obsolete')
);
-- 100-200种物料，包含5-10%呆滞库存
```

**⑥ finance（财务流水）**
```sql
CREATE TABLE finance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT,
  transaction_type ENUM('revenue','cost','expense'),
  category VARCHAR(50),          -- 销售收入/原材料/人工/制造费用/销售费用/管理费用
  amount DECIMAL(14,2),
  transaction_date DATE,
  due_date DATE,
  paid_date DATE,
  remark VARCHAR(500)
);
-- 每条订单对应收入+成本记录，辅以运营费用
```

**⑦ purchases（采购单）**
```sql
CREATE TABLE purchases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  po_no VARCHAR(50) NOT NULL UNIQUE,
  supplier_name VARCHAR(100),
  material_code VARCHAR(50),
  quantity DECIMAL(12,2),
  unit_price DECIMAL(12,2),
  order_date DATE,
  expected_date DATE,
  actual_date DATE,
  status ENUM('pending','partial','complete','cancelled'),
  quality_pass_rate DECIMAL(5,2)  -- 来料合格率
);
-- 50-100条采购记录，与生产工单间接关联
```

**⑧ anomaly_events（异常事件日志）** — 这是Demo最关键的表
```sql
CREATE TABLE anomaly_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_time DATETIME,
  event_type ENUM('delivery_delay','quality_issue','cost_overrun','inventory_abnormal','capacity_warning','profit_loss'),
  severity ENUM('critical','major','minor','info'),
  source_table VARCHAR(50),       -- 来源表
  source_id INT,                  -- 来源记录ID
  title VARCHAR(200),
  description TEXT,
  root_cause VARCHAR(500),        -- 分析出的根因（模拟生成）
  suggested_action VARCHAR(500),  -- 建议措施
  status ENUM('open','investigating','resolved','closed'),
  resolved_at DATETIME
);
-- 典型异常举例：
-- ① 某订单交付延期7天（从orders表对比delivery_date和actual_delivery_date）
-- ② 某批次检验合格率低于95%（从quality_inspections统计）
-- ③ 某产品成本超标准BOM成本15%（从work_orders对比实际成本与标准成本）
-- ④ 呆滞库存超过90天（从inventory的days_in_stock）
-- ⑤ 某供应商交货延期且来料合格率低于90%
```

### 1.3 数据生成器

**文件规划**：
- `scripts/generate_xiyi_data.py` — 一次性初始化脚本，生成全部模拟数据
- `scripts/update_xiyi_daily.py` — 每日增量脚本，模拟"业务运转"
- `scripts/analyze_anomalies.py` — 异常检测引擎（核心AI节点）

**generate_xiyi_data.py 核心逻辑**：

```python
# 伪代码逻辑
def generate_all():
    # 1. 生成产品目录 (30-50个产品)
    products = gen_products()
    # 2. 生成过去180天的订单 (~300条)
    orders = gen_orders(products, 180, 300)
    # 3. 生成生产工单 (每个订单1-3个工单)
    work_orders = gen_work_orders(orders)
    # 4. 生成质量检验记录
    inspections = gen_inspections(work_orders, fail_rate=0.08)
    # 5. 生成库存
    inventory = gen_inventory(products)
    # 6. 生成财务数据
    finance = gen_finance(orders, products)
    # 7. 生成采购记录
    purchases = gen_purchases(work_orders)
    # 8. 生成异常事件（基于以上数据的交叉分析）
    anomalies = gen_anomalies(orders, work_orders, inspections, inventory)
    
    save_to_mysql(all_tables)
```

**update_xiyi_daily.py 增量逻辑**：

```python
def update_daily():
    # 每天模拟：
    # - 新增2-5条订单
    # - 更新部分工单状态（running→completed）
    # - 新增当日检验记录（10-30条）
    # - 新发现0-3个异常事件（随机触发，但保持可预期）
    # - 更新财务数据
    # - 更新库存周转天数
    # 保持数据在"有活水"的状态，而非静态快照
```

### 1.4 数据管道接入OpenClaw定时任务

使用OpenClaw现有的cron能力（参考stock-agent的schedule模式）：

```yaml
# OpenClaw cron配置（通过qqbot_remind或gateway配置）
# 每天凌晨更新模拟数据
schedule:
  - name: xiyi_daily_data_update
    cron: "0 2 * * *"          # 每天02:00执行
    task: python scripts/update_xiyi_daily.py
  
  - name: xiyi_anomaly_detection
    cron: "30 2 * * *"         # 每天02:30执行（等数据更新完成）
    task: python scripts/analyze_anomalies.py
  
  - name: xiyi_morning_report
    cron: "0 7 * * *"          # 每天07:00生成晨会议题
    task: python scripts/generate_morning_report.py
```

### 1.5 数据层工作量评估

| 文件 | 预估行数 | 复杂度 |
|------|---------|--------|
| `scripts/generate_xiyi_data.py` | ~500行 | 中（数据生成逻辑） |
| `scripts/update_xiyi_daily.py` | ~300行 | 中（增量更新） |
| `scripts/analyze_anomalies.py` | ~400行 | 高（异常检测规则） |
| `scripts/generate_morning_report.py` | ~200行 | 中（报告聚合） |
| `sql/init_schema.sql` | ~150行 | 低（8张表DDL） |
| `config/demo_config.py` | ~50行 | 低（配置参数） |

**总计：约1600行代码，1.5-2人天工作量**

---

## 二、Antony（功能层）：Demo功能设计与优先级

### 2.1 从兮易14个业务环节中精选P0-P2

基于Demo展示目的（而非生产系统），核心考虑：
1. **演示冲击力** — 观众一眼能看出价值
2. **数据依赖低** — 模拟数据就能跑起来
3. **AI感知强** — 让客户感受到"AI大脑"而非传统BI

#### 功能优先级矩阵

| 优先级 | 功能 | 兮易映射 | 演示价值 | 技术复杂度 |
|--------|------|---------|---------|-----------|
| **P0** | 🏠 经营健康仪表盘 | B01+B13 | ★★★★★ | ★☆☆☆☆ |
| **P0** | 🚨 24h异常告警与溯源 | 全部 | ★★★★★ | ★★★☆☆ |
| **P0** | 👥 数字人团队展示 | 核心亮点 | ★★★★★ | ★★☆☆☆ |
| **P1** | 📊 跨系统账本比对 | B13 | ★★★★☆ | ★★★★☆ |
| **P1** | 🔍 利润折损溯源 | B12+B13 | ★★★★☆ | ★★★☆☆ |
| **P1** | 📋 管理层晨会议题 | 核心工作流 | ★★★★☆ | ★★☆☆☆ |
| **P2** | 📦 产销风险推演 | B02+B03 | ★★★☆☆ | ★★★★☆ |
| **P2** | 🔄 管理规则固化 | 能力提升 | ★★★☆☆ | ★★★☆☆ |

### 2.2 P0功能详解

#### P0-① 经营健康仪表盘（Dashboard）

**定位**：Demo首页，一屏展示企业概览

**展示内容**：
```
┌──────────────────────────────────────────────────────────────┐
│  🏭 兮易经营AI大脑 ─ 企业经营健康度                      │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│  交付达成率  │  质量合格率  │  成本偏差率  │  库存周转天数    │
│    87.3%     │   95.6%     │   +5.2%     │    42天          │
│  ▼ 2.1%     │  ▲ 0.8%     │  ▲ 1.5%     │  ▲ 3天           │
├─────────────┴─────────────┴─────────────┴──────────────────┤
│  📈 经营趋势（近30天）                                      │
│  [折线图：营收、成本、利润趋势]                              │
├─────────────┬──────────────────────────────────────────────┤
│  🚨 活跃告警  │  💬 AI解读                                  │
│  5条critical  │  "近期交付达成率连续3周下滑，主因是...       │
│  12条major   │   建议优先关注A车间的产能瓶颈..."            │
└─────────────┴──────────────────────────────────────────────┘
```

**数据来源**：聚合查询 `orders` + `work_orders` + `quality_inspections` + `finance` + `anomaly_events`
**AI能力**：大模型调用，对异常数据给出自然语言解读（GPT风格摘要）

#### P0-② 24h异常告警与溯源

**定位**：兮易核心差异化 — 静默监控+异常告警+数据溯源

**展示内容**：
```
┌──────────────────────────────────────────────────────────────┐
│  🚨 异常事件中心                                              │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ 严重程度  │ 事件类型  │ 发生时间  │ 涉及金额  │  状态           │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│ 🔴 严重  │ 交付延期  │ 05-28    │ ¥128万   │  调查中          │
│ 🟠 重要  │ 成本超支  │ 05-27    │ ¥56万    │  已确认          │
│ 🟡 一般  │ 来料异常  │ 05-26    │ ¥12万    │  已解决          │
│ ...      │          │          │          │                 │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│                                                              │
│  [点击某条异常 → 弹出溯源面板]                                │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │ 🔍 溯源分析：交付延期 #OD20260528-003          │          │
│  │                                                │          │
│  │  根因链：                                      │          │
│  │  ① 订单OD20260528-003 (客户: 北方重工)         │          │
│  │     └→ 计划交期: 05-25，实际交付: 06-02        │          │
│  │  ② ⚠️ 关联工单WO-20260520-008延期3天           │          │
│  │     └→ 计划完成: 05-22，实际完成: 05-25        │          │
│  │  ③ ⚠️ 该工单原材料到货滞后5天                  │          │
│  │     └→ 采购单PO-20260510-012交货延时           │          │
│  │  ④ ⚠️ 供应商「华东钢材」连续2批来料不合格      │          │
│  │     └→ 来料合格率: 82% (标准: ≥95%)            │          │
│  │                                                │          │
│  │  💡 建议措施：                                   │          │
│  │  A. 启动供应商「华东钢材」的新供应商评估流程      │          │
│  │  B. 该订单涉及生产线C01/C02，建议加班追赶        │          │
│  │  C. 风险预估：若延期到06-05，违约金¥6.4万       │          │
│  └────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

**技术实现**：
- 前端：异常列表 + 点击展开详情面板
- 后端：`anomaly_events` 表直接查询，溯源通过关联查询4张表
- 根因分析：预设的规则引擎，无需实时AI推理（Demo可控）
- AI点：对根因链的最后一步输出"建议措施"（可预置文案或调用LLM）

#### P0-③ 数字人团队展示

**定位**：兮易最大差异化 — "虚拟管理团队"而非单Agent

**展示内容**：
```
┌──────────────────────────────────────────────────────────────┐
│  👥 数字人专家团队                                            │
├──────────────────────────────────────────────────────────────┤
│  [网格布局，每个数字人一个卡片]                                │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ 👤 CFO       │ │ 👤 COO       │ │ 👤 生产总监   │        │
│  │ 费用合规      │ │ 经营健康体检  │ │ 计划偏离监控  │        │
│  │ 利润溯源      │ │ 产销推演     │ │ 产能调度     │        │
│  │ [今日发现]    │ │ [今日发现]   │ │ [今日发现]    │        │
│  │ 可疑报销¥3.2万│ │ 交付风险×3   │ │ 异常停机×2   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ 👤 质量总监   │ │ 👤 采购总监   │ │ 👤 财务总监   │        │
│  │ 质量溯源      │ │ 议价空间     │ │ 账本比对     │        │
│  │ ...          │ │ ...          │ │ ...          │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  [点击数字人头像 → 进入该角色24h工作日志]                     │
└──────────────────────────────────────────────────────────────┘
```

**技术实现**：纯前端卡片布局 + 角色数据配置（JSON配置6-8个虚拟角色即可）

### 2.3 P1-P2功能（简要）

**P1-④ 跨系统账本比对**
- 展示效果：模拟ERP vs MES vs 财务系统的数据差异，多表联合查询
- 核心SQL能力：`SELECT ... WHERE system_a.qty != system_b.qty`
- 依赖：需要额外创建 `erp_accounts` / `mes_accounts` / `finance_accounts` 三张冗余表

**P1-⑤ 利润折损溯源**
- 展示效果：从收入逐层穿透到BOM成本，标出利润流失节点
- 依赖产品BOM+工单实际成本

**P1-⑥ 管理层晨会议题**
- 展示效果：每天07:00自动生成的一份"今日必读"报告（可参考stock-report模式）
- 实现：每日cron触发脚本，聚合anomaly_events + 关键指标，调用LLM生成摘要

### 2.4 后端API规划

```
API端点                        方法  功能
───
/api/xiyi/dashboard             GET   经营健康仪表盘聚合数据
/api/xiyi/anomalies             GET   异常事件列表（支持筛选/分页）
/api/xiyi/anomalies/:id         GET   异常详情+溯源链条
/api/xiyi/anomalies/:id/action  POST  处理异常（更新状态）
/api/xiyi/digital-team          GET   数字人团队列表+各角色今日发现
/api/xiyi/digital-team/:role    GET   特定数字人工作日志
/api/xiyi/morning-report        GET   今日晨会议题
/api/xiyi/profit-trace/:order   GET   利润折损溯源
/api/xiyi/comparison            GET   跨系统账本比对
/api/xiyi/kpi/history           GET   各KPI历史趋势数据
```

**技术选型及理由**：

| 方案 | 选择 | 理由 |
|------|------|------|
| **后端框架** | Express.js (已有Node环境) | 复用现有node_modules，学习成本低 |
| **数据库** | MySQL (已有) | 已有MySQL服务可用 |
| **LLM调用** | OpenClaw自身Agent能力 | 不需要独立部署大模型，利用现有OpenClaw的LLM能力 |
| **端口** | 8890 | 延续8887/8888/8889端口序列 |

### 2.5 功能层工作量评估

| 文件 | 预估行数 | 说明 |
|------|---------|------|
| `server/app.js` | ~60行 | Express入口 + 路由挂载 |
| `server/routes/dashboard.js` | ~80行 | 仪表盘API |
| `server/routes/anomalies.js` | ~150行 | 异常API + 溯源查询 |
| `server/routes/digital-team.js` | ~60行 | 数字人API |
| `server/routes/morning-report.js` | ~80行 | 晨会报告API |
| `server/routes/profit-trace.js` | ~80行 | 利润溯源API |
| `server/routes/comparison.js` | ~60行 | 账本比对API |
| `server/db.js` | ~40行 | MySQL连接池 |
| `server/llm.js` | ~50行 | LLM调用封装(调用OpenClaw Agent) |
| `scripts/analyze_anomalies.py` | ~400行 | (已计入数据层) |
| `scripts/generate_morning_report.py` | ~200行 | (已计入数据层) |

**总计：约660行代码（后端API）+ 600行（分析脚本），2-3人天**

---

## 三、Tony（展示层）：前端设计与部署

### 3.1 现有stock-manager框架复用分析

| 组件/风格 | 可复用程度 | 说明 |
|-----------|-----------|------|
| 深色工业风主题(CSS变量) | ✅ 完全复用 | `--bg-primary: #0a0e17` 等变量直接适配制造场景 |
| 左右布局(侧边栏+主内容) | ✅ 完全复用 | 替换菜单项即可 |
| 卡片组件(.card/.card-header) | ✅ 完全复用 | 复用样式定义 |
| 面包屑导航(nav-item) | ✅ 完全复用 | 替换导航菜单即可 |
| ECharts图表容器 | ✅ 完全复用 | 复用chart-container + echarts渲染 |
| 信号标签(.signal-badge) | ✅ 完全复用 | 可直接用于异常级别标注 |
| 告警面板(.alert-panel) | ✅ 完全复用 | 异常告警列表直接使用 |
| 模态框(.modal-overlay) | ✅ 完全复用 | 异常详情弹窗 |
| 分页组件(.pagination) | ✅ 完全复用 | 复用 |
| 仪表盘卡片(.dash-main-card) | ✅ 完全复用 | 用于KPI指标展示 |
| 网格布局(grid) | ✅ 完全复用 | 数字人团队卡片布局 |

**结论**：`index.html` 中约80%的CSS可以直接复用，只需补充制造业特有组件样式。

### 3.2 新增页面设计

建议在现有stock-manager框架中**新增页面ID**，通过路由切换隔离。

```
导航菜单结构：
┌─────────────────────────────────────────────┐
│  🧠 兮易企业经营AI大脑                      │
│  ─────────────────────────                  │
│  📊 经营概览         → #page-xiyi-dashboard  │
│  🚨 异常告警中心     → #page-xiyi-anomalies  │
│  👥 数字人团队       → #page-xiyi-team       │
│  📋 晨会议题         → #page-xiyi-report      │
│  🔍 利润溯源         → #page-xiyi-profit     │
│  📦 账本比对         → #page-xiyi-compare     │
│  ─────────────────────────                  │
│  📈 股票系统         （跳转到股票视图）       │
└─────────────────────────────────────────────┘
```

#### 各页面核心组件

**① page-xiyi-dashboard（经营概览）**
```
- 顶部4个KPI卡片（交付达成率、质量合格率、成本偏差率、库存周转）
- 中间ECharts趋势图（营收/成本/利润30天）
- 右侧活跃告警面板（最近5条异常）
- 底部AI解读区（LLM生成的经营摘要）
```

**② page-xiyi-anomalies（异常告警中心）**
```
- 筛选栏（严重程度/类型/时间范围）
- 异常列表（表格，每行含等级/类型/时间/金额/状态）
- 点击展开溯源面板（模态框，展示根因链）
- 处理按钮（更新异常状态）
- 右上角"24h监控状态"小标签
```

**③ page-xiyi-team（数字人团队）**
```
- 网格卡片布局（6-8个数字人）
- 每个卡片：头像icon + 角色名 + 职责摘要 + "今日发现"数量角标
- 点击→展开该角色24h工作流时间线
- 底部24h时间线总览（参照兮易产品文档的时段设计）
```

**④ page-xiyi-report（晨会议题）**
```
- 报告标题+日期
- 核心发现摘要（Markdown渲染）
- 待决策事项清单（Checklist风格）
- 导出/打印按钮
```

### 3.3 与股票系统共存的部署方案

**推荐方案**：同一Nginx服务器，不同路径分流

```nginx
# /etc/nginx/sites-available/xiyi-demo
server {
    listen 80;
    server_name xiyi-demo.yourdomain.com; # 或使用IP

    # 兮易AI大脑
    location / {
        proxy_pass http://localhost:8890;   # Node.js服务
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # 股票系统保持独立路径
    # 如果股票是通过不同端口访问的，保持原样
}

# 也可以直接通过不同端口访问：
# 股票系统：http://IP:8887
# 兮易Demo：http://IP:8890
```

**建议采用端口分离**（最简单，与股票系统无冲突）：
- 股票系统：8887（前端）/ 8888（API）/ 8889（备用）
- 兮易Demo：8890（统一前后端）

**共存方案对比**：

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| 端口分离(8890) | 零冲突,最快上线 | 多一个端口 | ✅ **推荐MVP** |
| 统一域名+路径 | 统一入口,专业感强 | 需Nginx配置/代理 | ⏳ 后期优化 |
| 合并为一个前端SPA | 统一导航 | 代码耦合,风险高 | ❌ 不推荐 |

### 3.4 前端工作量评估

| 文件 | 预估行数 | 说明 |
|------|---------|------|
| `public/xiyi-demo.html` | ~800行 | 单页HTML（含CSS+JS） |
| `public/xiyi-style.css` | ~200行 | 新增样式（复用时几乎不需要） |
| `public/xiyi-app.js` | ~400行 | 页面路由、数据加载、交互逻辑 |
| `public/xiyi-charts.js` | ~200行 | ECharts图表配置 |

**合计：约1600行前端代码，1-1.5人天**

> 如果直接在一个HTML中完成（参考stock-manager的设计模式），文件约1000-1200行。

---

## 四、总体工作量汇总

### 4.1 人天总表

| 层级 | 模块 | 文件数 | 预估代码量 | 人天 |
|------|------|--------|-----------|------|
| **数据层** | Schema + 数据生成 | 5 | ~1600行 | 1.5-2天 |
| **功能层** | 后端API + 分析脚本 | 9 | ~1260行 | 2-3天 |
| **展示层** | 单页前端 | 3 | ~1400行 | 1-1.5天 |
| **部署集成** | Nginx + 启动脚本 | 2 | ~80行 | 0.5天 |
| **总计** | | **19** | **~4340行** | **5.5-7天** |

### 4.2 建议开发节奏（2周并行）

```
Week 1: 
  Mon-Wed Hugo: 数据生成脚本 + MySQL初始化
  Mon-Wed Tony: 前端框架搭建（复用stock-manager模板）
  Mon-Wed Antony: API架构 + 数据库连接
  
  Thu-Fri Hugo: 异常检测逻辑 + 增量更新
  Thu-Fri Tony: Dashboard + 异常告警页面
  Thu-Fri Antony: 核心API（dashboard / anomalies）

Week 2:
  Mon-Tue: 集成联调（前端调API）
  Mon-Tue: 数字人团队页面 + 晨会议题页面
  Wed: 利润溯源 + 账本比对页面
  Thu: Nginx配置 + 完整Demo数据生成
  Fri: 测试+演示准备
```

### 4.3 风险点与依赖

| 风险 | 级别 | 影响 | 缓解措施 |
|------|------|------|---------|
| 模拟数据真实感不足 | 🟡 中 | 客户觉得"假" | 参考真实制造业数据分布；异常事件要合理 |
| LLM调用不稳定或延迟 | 🟡 中 | AI解读部分不流畅 | 预置文案兜底策略("AI解读"用模板+变量填充) |
| 与股票系统端口冲突 | 🟢 低 | 服务不可用 | 端口分离(8890)；提前确认端口占用 |
| 节假日无实时数据更新 | 🟢 低 | Demo数据静态 | 预置多套快照(正常/异常/告警三种状态) |
| MySQL连接数限制 | 🟢 低 | 连接失败 | 使用连接池，限制max 5连接 |
| 7天内交付压力 | 🟡 中 | 可能延期 | MVP只做P0的3个功能(仪表盘+异常告警+数字团队)，P1-P2后续补充 |
| Demo演讲PPT准备 | 🟡 中 | 有功能没故事 | 需要额外半天准备演示脚本 |

### 4.4 关键依赖

```
✅ 已有（无需额外准备）：
  - Node.js + Express运行环境
  - Nginx服务
  - MySQL数据库
  - OpenClaw Gateway（Agent调度能力）
  - deepseek/deepseek-v4-flash（LLM推理）

⚠️ 需要确认：
  - MySQL用户权限（是否能创建新数据库 xiyi_demo）
  - 8890端口是否被占用
  - npm全局包express/mysql2是否已安装
  - 是否允许cron任务执行Python脚本
```

---

## 五、Demo故事线（演示脚本）

建议按此顺序展示，构建完整的"故事弧线"：

```
Act 1: 发现问题
  ① 进入Dashboard → 看到"交付达成率87.3%，连续3周下滑"
  ② 看到活跃告警 → 切换到异常告警中心
  ③ 点击"交付延期 #OD20260528-003" → 展开溯源面板
  💡 "看，底层账本自动对接，发现根因在供应商来料