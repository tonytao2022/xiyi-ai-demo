-- ════════════════════════════════════════════════════════════════
-- ⚠️ 已废弃 (DEPRECATED) — 请使用 scripts/schema_full.sql 代替
-- 保留此文件仅作历史参考,请勿对新数据库执行此DDL
-- ════════════════════════════════════════════════════════════════

-- =====================================================
-- 兮易AI大脑 · 品质专员平台 · 核心表结构 (MVP)
-- 数据库：xiyi_quality（独立于stock_db）
-- =====================================================

-- 1. 场景配置表 —— 每个场景一条记录
CREATE TABLE IF NOT EXISTS scn_config (
    id INT PRIMARY KEY COMMENT '场景编号(101-107)',
    name VARCHAR(100) NOT NULL COMMENT '场景名称',
    role VARCHAR(32) NOT NULL DEFAULT 'quality_specialist' COMMENT '所属角色',
    category VARCHAR(50) NOT NULL COMMENT '分类',
    icon VARCHAR(50) DEFAULT 'chart-line' COMMENT '图标',
    description TEXT COMMENT '场景描述',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='场景配置';

-- 2. 七步流程节点配置 —— 每个场景的N个步骤
CREATE TABLE IF NOT EXISTS scn_step_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL COMMENT '所属场景',
    step_type VARCHAR(32) NOT NULL COMMENT '步骤类型(problem/data/analysis/4m1e/root/capa/task)',
    step_seq INT NOT NULL DEFAULT 0 COMMENT '步骤顺序',
    name VARCHAR(100) NOT NULL COMMENT '步骤名称',
    description TEXT COMMENT '步骤说明',
    template_config JSON COMMENT '步骤模板配置',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scene (scene_id),
    FOREIGN KEY (scene_id) REFERENCES scn_config(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='七步流程节点配置';

-- 3. 七步流程运行实例 —— 每个场景每次运行的记录
CREATE TABLE IF NOT EXISTS scn_step_run (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL COMMENT '所属场景',
    run_id VARCHAR(32) NOT NULL COMMENT '运行批次ID',
    step_type VARCHAR(32) NOT NULL COMMENT '当前步骤',
    step_seq INT NOT NULL,
    input_data JSON COMMENT '输入数据',
    output_data JSON COMMENT '处理结果/Agent分析',
    status VARCHAR(16) DEFAULT 'pending' COMMENT 'pending/running/done/failed',
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_run (scene_id, run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='七步流程运行实例';

-- 4. 指标字典 —— 核心指标体系
CREATE TABLE IF NOT EXISTS dim_indicator (
    id VARCHAR(32) PRIMARY KEY COMMENT '指标代码',
    scene_id INT COMMENT '关联场景',
    name VARCHAR(100) NOT NULL COMMENT '指标名称',
    formula TEXT COMMENT '计算逻辑',
    data_source VARCHAR(32) COMMENT '数据来源系统',
    unit VARCHAR(20) COMMENT '单位',
    threshold_upper DECIMAL(12,2) COMMENT '上限阈值',
    threshold_lower DECIMAL(12,2) COMMENT '下限阈值',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scn_config(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='指标字典';

-- 5. 数据源元数据 —— 字段级数据字典
CREATE TABLE IF NOT EXISTS dim_metadata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL,
    source_system VARCHAR(32) NOT NULL COMMENT '源系统',
    table_name VARCHAR(64) NOT NULL COMMENT '表名',
    table_alias VARCHAR(64) COMMENT '表中文名',
    field_name VARCHAR(64) NOT NULL COMMENT '字段名',
    field_alias VARCHAR(64) COMMENT '字段中文名',
    field_type VARCHAR(32) COMMENT '字段类型',
    is_dimension TINYINT(1) DEFAULT 0 COMMENT '是否维度字段',
    is_measure TINYINT(1) DEFAULT 0 COMMENT '是否度量字段',
    sample_data VARCHAR(200) COMMENT '示例数据',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scene (scene_id),
    FOREIGN KEY (scene_id) REFERENCES scn_config(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据源元数据';

-- 6. 4M1E分析配置 —— 人机料法环测维度
CREATE TABLE IF NOT EXISTS dim_4m1e (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL COMMENT '所属场景',
    factor_type VARCHAR(16) NOT NULL COMMENT '维度(man/machine/material/method/environment/measure)',
    factor_name VARCHAR(100) NOT NULL COMMENT '因素名称',
    factor_desc TEXT COMMENT '因素描述',
    risk_level VARCHAR(8) DEFAULT 'medium' COMMENT '风险等级',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scene (scene_id),
    FOREIGN KEY (scene_id) REFERENCES scn_config(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='4M1E分析配置';

-- 7. CAPA任务表
CREATE TABLE IF NOT EXISTS scn_capa_task (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL,
    run_id VARCHAR(32) NOT NULL,
    title VARCHAR(200) NOT NULL COMMENT '任务标题',
    root_cause TEXT COMMENT '根因',
    action_plan TEXT COMMENT 'CAPA方案',
    responsible VARCHAR(50) COMMENT '责任人',
    deadline DATE COMMENT '截止日期',
    status VARCHAR(16) DEFAULT 'open' COMMENT 'open/in_progress/done/closed',
    track_result TEXT COMMENT '跟踪结果',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_run (scene_id, run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CAPA任务表';

-- 8. 数据质量检查日志
CREATE TABLE IF NOT EXISTS dq_check_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL,
    check_type VARCHAR(32) NOT NULL COMMENT '检查类型(completeness/uniqueness/consistency)',
    table_name VARCHAR(64) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    check_rule TEXT COMMENT '检查规则',
    pass_count INT DEFAULT 0 COMMENT '通过数',
    fail_count INT DEFAULT 0 COMMENT '失败数',
    check_result JSON COMMENT '详细结果',
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_scene (scene_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据质量检查日志';

-- 9. 报告模板
CREATE TABLE IF NOT EXISTS dim_report_template (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    scene_id INT,
    template_type VARCHAR(32) NOT NULL COMMENT 'report/chart/analysis',
    template_config JSON NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报告模板';

-- 10. 告警规则
CREATE TABLE IF NOT EXISTS dq_alert_rule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL,
    indicator_id VARCHAR(32),
    rule_name VARCHAR(100) NOT NULL,
    rule_level VARCHAR(8) DEFAULT 'warning' COMMENT 'danger/warning/info',
    rule_expression TEXT NOT NULL COMMENT '告警表达式',
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='告警规则';
