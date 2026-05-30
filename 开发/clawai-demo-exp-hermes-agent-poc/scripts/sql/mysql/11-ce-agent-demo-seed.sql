USE `ce_agent_demo`;

DELETE FROM `structured_report`;
DELETE FROM `analysis_task_event`;
DELETE FROM `metric_query_audit`;
DELETE FROM `rule_config`;
DELETE FROM `item_category_mapping`;
DELETE FROM `analysis_task`;

INSERT INTO `item_category_mapping` (
  `source_system`, `dict_type`, `item_code`, `item_name`, `item_category`,
  `match_mode`, `is_active`, `remark`
) VALUES
  ('mes_demo', 'qm_test_type', '941001', '密度', '其他类', 'explicit', 1, 'Demo 显式映射'),
  ('mes_demo', 'qm_test_type', '941002', '磁物超标', '磁物类', 'explicit', 1, 'Demo 显式映射'),
  ('mes_demo', 'qm_test_type', '941003', '铁含量异常', 'ICP类', 'explicit', 1, 'Demo 显式映射'),
  ('mes_demo', 'qm_test_type', '941004', '粒度偏粗', '粒度类', 'explicit', 1, 'Demo 显式映射'),
  ('mes_demo', 'qm_test_type', '941005', '筛分异常', '粒度类', 'explicit', 1, 'Demo 显式映射');

INSERT INTO `rule_config` (
  `analysis_type`, `rule_key`, `rule_version`, `is_active`, `threshold_config`, `description`
) VALUES
  (
    'first_pass_yield_monitoring',
    'fpyr_threshold',
    'v1',
    1,
    JSON_OBJECT(
      'warningFpyr', 92.0,
      'criticalFpyr', 90.0,
      'focusJudgeCodes', JSON_ARRAY('A', 'B', 'F')
    ),
    '首版 demo 的一次校验合格率阈值'
  ),
  (
    'first_pass_yield_monitoring',
    'root_cause_branching',
    'v1',
    1,
    JSON_OBJECT(
      'categoryPriority', JSON_ARRAY('磁物类', 'ICP类', '粒度类', '其他类'),
      'enableMixingClue', TRUE,
      'enableEquipmentTimeline', TRUE
    ),
    '首版 demo 的归因分支配置'
  ),
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
  ),
  (
    'first_pass_yield_trend_brief',
    'fpyr_threshold',
    'v1',
    1,
    JSON_OBJECT(
      'warningFpyr', 92.0,
      'criticalFpyr', 90.0,
      'focusJudgeCodes', JSON_ARRAY('A', 'B', 'F')
    ),
    '趋势简报：与全量监控共用阈值，不自查检验项结构/设备时间线'
  );

INSERT INTO `analysis_task` (
  `task_id`, `trace_id`, `analysis_type`, `status`, `current_step`, `progress`,
  `input_payload`, `context_payload`, `requested_by`, `tenant_id`,
  `created_at`, `started_at`, `completed_at`
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'trace-demo-001',
    'first_pass_yield_monitoring',
    'completed',
    'report_generation',
    100,
    JSON_OBJECT(
      'siteId', 'site-A01',
      'factoryCode', 'site-A01',
      'workshopCode', 'workshop-Q1',
      'lineCode', 'line-A',
      'startAt', '2026-03-27T00:00:00+08:00',
      'endAt', '2026-03-30T23:59:59+08:00',
      'analysisType', 'first_pass_yield_monitoring'
    ),
    JSON_OBJECT(
      'skillKey', 'quality_first_pass_yield',
      'templateVersion', 'v1',
      'ruleVersion', 'v1'
    ),
    'user-001',
    'tenant-demo',
    '2026-04-02 09:58:00.000',
    '2026-04-02 09:58:05.000',
    '2026-04-02 10:00:00.000'
  );

INSERT INTO `analysis_task_event` (
  `task_id`, `trace_id`, `event_type`, `event_payload`, `created_at`
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'trace-demo-001',
    'task_accepted',
    JSON_OBJECT('status', 'accepted'),
    '2026-04-02 09:58:00.000'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'trace-demo-001',
    'semantic_query_completed',
    JSON_OBJECT('metricKeys', JSON_ARRAY('fpyr_daily', 'defect_item_breakdown', 'equipment_event_timeline')),
    '2026-04-02 09:59:00.000'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'trace-demo-001',
    'playbook_completed',
    JSON_OBJECT('topCategory', '磁物类', 'hasMixingClue', TRUE),
    '2026-04-02 09:59:30.000'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'trace-demo-001',
    'report_generated',
    JSON_OBJECT('reportId', '10000000-0000-0000-0000-000000000001'),
    '2026-04-02 10:00:00.000'
  );

INSERT INTO `structured_report` (
  `report_id`, `task_id`, `trace_id`, `analysis_type`, `template_version`,
  `report_payload`, `source_refs`, `audit_trail`, `created_at`, `updated_at`
) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'trace-demo-001',
    'first_pass_yield_monitoring',
    'v1',
    JSON_OBJECT(
      'reportMeta', JSON_OBJECT(
        'reportId', '10000000-0000-0000-0000-000000000001',
        'title', '在线一次校验合格率管控分析',
        'summary', '2026-03-28 合格率明显下滑，主要受磁物类与 ICP / 粒度异常影响。'
      ),
      'highlights', JSON_ARRAY(
        JSON_OBJECT('label', '异常日期', 'value', '2026-03-28'),
        JSON_OBJECT('label', '主要不合格类别', 'value', '磁物类'),
        JSON_OBJECT('label', '混料线索', 'value', '发现 2 个异常批次存在混料记录')
      )
    ),
    JSON_ARRAY(
      JSON_OBJECT('system', 'mes_demo', 'table', 'tsh_pro_stock_record'),
      JSON_OBJECT('system', 'mes_demo', 'table', 'tdmmm'),
      JSON_OBJECT('system', 'mes_demo', 'table', 'tqmtq_entrust_result')
    ),
    JSON_ARRAY(
      JSON_OBJECT('step', 'semantic_query', 'status', 'completed'),
      JSON_OBJECT('step', 'playbook', 'status', 'completed'),
      JSON_OBJECT('step', 'report_service', 'status', 'completed')
    ),
    '2026-04-02 10:00:00.000',
    '2026-04-02 10:00:00.000'
  );

INSERT INTO `metric_query_audit` (
  `trace_id`, `task_id`, `metric_key`, `query_template_key`, `query_params`,
  `result_summary`, `duration_ms`, `status`, `created_at`
) VALUES
  (
    'trace-demo-001',
    '00000000-0000-0000-0000-000000000001',
    'fpyr_daily',
    'fpyr_daily_v1',
    JSON_OBJECT('siteId', 'site-A01', 'grain', 'day'),
    JSON_OBJECT('rowCount', 4, 'minFpyr', 33.33, 'maxFpyr', 100.00),
    86,
    'completed',
    '2026-04-02 09:58:45.000'
  ),
  (
    'trace-demo-001',
    '00000000-0000-0000-0000-000000000001',
    'defect_item_breakdown',
    'defect_item_breakdown_v1',
    JSON_OBJECT('siteId', 'site-A01', 'groupBy', JSON_ARRAY('itemCategory', 'itemName')),
    JSON_OBJECT('rowCount', 4, 'topCategory', '磁物类'),
    73,
    'completed',
    '2026-04-02 09:58:55.000'
  ),
  (
    'trace-demo-001',
    '00000000-0000-0000-0000-000000000001',
    'equipment_event_timeline',
    'equipment_event_timeline_v1',
    JSON_OBJECT('siteId', 'site-A01'),
    JSON_OBJECT('rowCount', 3, 'unit', 'line-A'),
    54,
    'completed',
    '2026-04-02 09:59:05.000'
  );
