-- 增量合并：仅补充 / 更新 OpenClaw 分支编排规则（不删其它表数据）
-- 适用：已跑过旧版种子库、缺少 openclaw_branch_routing 的库
--
-- 执行示例（与 .env.example 中变量一致）：
--   mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$APP_DB_NAME" < scripts/sql/mysql/12-openclaw-branch-routing-seed.sql

USE `ce_agent_demo`;

INSERT INTO `rule_config` (
  `analysis_type`,
  `rule_key`,
  `rule_version`,
  `is_active`,
  `threshold_config`,
  `description`
) VALUES
  (
    'first_pass_yield_monitoring',
    'openclaw_branch_routing',
    'v1',
    1,
    JSON_OBJECT(
      'orderedBranches',
      JSON_ARRAY(
        JSON_OBJECT(
          'strategy', 'equipment_first',
          'categorySubstrings', JSON_ARRAY('磁物'),
          'reason', '磁物类异常通常需要优先结合设备事件时间线排查',
          'skipEquipmentTimeline', FALSE
        ),
        JSON_OBJECT(
          'strategy', 'material_process_first',
          'categorySubstrings', JSON_ARRAY('ICP'),
          'reason', 'ICP类异常优先从来料/工艺方向排查，设备线索可后置',
          'skipEquipmentTimeline', TRUE
        ),
        JSON_OBJECT(
          'strategy', 'balanced_general',
          'categorySubstrings', JSON_ARRAY(),
          'reason', '未命中特定类别策略，采用通用平衡路径',
          'skipEquipmentTimeline', FALSE
        )
      )
    ),
    'OpenClaw 编排分支：由主导异常类别决定工具路径（与 playbook-engine /rules/branch-routing 对齐）'
  )
ON DUPLICATE KEY UPDATE
  `is_active` = VALUES(`is_active`),
  `threshold_config` = VALUES(`threshold_config`),
  `description` = VALUES(`description`),
  `updated_at` = NOW(3);
