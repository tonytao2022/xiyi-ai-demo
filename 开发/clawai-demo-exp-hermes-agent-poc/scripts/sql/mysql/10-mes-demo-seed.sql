USE `mes_demo`;

DELETE FROM `tqmtq_entrust_result`;
DELETE FROM `tqmtj_deal_mat_info`;
DELETE FROM `tdmmm`;
DELETE FROM `teq_repair_manage`;
DELETE FROM `tsh_pro_stock_record`;
DELETE FROM `sys_dict_data`;

INSERT INTO `sys_dict_data` (
  `dict_type`, `dict_code`, `dict_label`, `dict_value`, `dict_sort`, `status`, `remark`
) VALUES
  ('qm_test_type', '941001', '密度', 'LAB01', 10, '0', '其他类示例项目'),
  ('qm_test_type', '941002', '磁物超标', 'LAB02', 20, '0', '磁物类示例项目'),
  ('qm_test_type', '941003', '铁含量异常', 'LAB03', 30, '0', 'ICP类示例项目'),
  ('qm_test_type', '941004', '粒度偏粗', 'LAB04', 40, '0', '粒度类示例项目'),
  ('qm_test_type', '941005', '筛分异常', 'LAB05', 50, '0', '粒度类扩展示例项目');

INSERT INTO `tsh_pro_stock_record` (
  `factory_code`, `workshop_code`, `line_code`, `mat_kind`, `stock_oper_order`,
  `mat_code`, `mat_no`, `mat_act_wt`, `stock_chng_time`, `hold_flag`,
  `is_test_batch`, `is_rework_batch`, `is_scrapped`
) VALUES
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032701', 12.500, '2026-03-27 08:15:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032702', 12.300, '2026-03-27 10:20:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032703', 12.700, '2026-03-27 14:05:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032801', 12.450, '2026-03-28 07:58:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032802', 12.110, '2026-03-28 09:42:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032803', 12.060, '2026-03-28 11:18:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032804', 12.020, '2026-03-28 16:12:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032901', 12.800, '2026-03-29 08:03:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032902', 12.480, '2026-03-29 10:46:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026032903', 11.980, '2026-03-29 14:27:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026033001', 12.360, '2026-03-30 09:09:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKI', 'MAT-FPY-01', 'B2026033002', 12.210, '2026-03-30 15:33:00.000', '0', 0, 0, 0),
  ('site-A01', 'workshop-Q1', 'line-A', '成品', 'ZKO', 'MAT-FPY-01', 'B2026033003', 12.150, '2026-03-30 17:05:00.000', '0', 0, 0, 0);

INSERT INTO `tdmmm` (
  `mat_code`, `qdc`, `mat_no`, `entr_no`, `surf_judge_code`,
  `pch_judge_code`, `complex_judge_code`, `hold_flag`, `judge_time`
) VALUES
  ('MAT-FPY-01', 'Q1', 'B2026032701', 'ENTR-20260327-001', 'S', 'S', 'S', '0', '2026-03-27 08:45:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032702', 'ENTR-20260327-002', 'S', 'S', 'S', '0', '2026-03-27 10:55:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032703', 'ENTR-20260327-003', 'F', 'F', 'F', '0', '2026-03-27 14:40:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032801', 'ENTR-20260328-001', 'S', 'S', 'S', '0', '2026-03-28 08:30:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032802', 'ENTR-20260328-002', 'A', 'A', 'A', '0', '2026-03-28 10:10:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032803', 'ENTR-20260328-003', 'B', 'B', 'B', '0', '2026-03-28 11:45:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032804', 'ENTR-20260328-004', 'N', 'N', 'N', '0', '2026-03-28 16:45:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032901', 'ENTR-20260329-001', 'S', 'S', 'S', '0', '2026-03-29 08:31:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032902', 'ENTR-20260329-002', 'S', 'S', 'S', '0', '2026-03-29 11:15:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026032903', 'ENTR-20260329-003', 'F', 'F', 'F', '0', '2026-03-29 14:58:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026033001', 'ENTR-20260330-001', 'S', 'S', 'S', '0', '2026-03-30 09:41:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026033002', 'ENTR-20260330-002', 'S', 'S', 'S', '0', '2026-03-30 16:04:00.000'),
  ('MAT-FPY-01', 'Q1', 'B2026033003', 'ENTR-20260330-003', 'S', 'S', 'S', '0', '2026-03-30 17:30:00.000');

INSERT INTO `tqmtq_entrust_result` (
  `entr_no`, `sample_no`, `item_code`, `item_name`, `act_result_value`,
  `result_unit`, `result_judge_code`, `test_time`
) VALUES
  ('ENTR-20260327-003', 'SAMPLE-2703-01', '941002', '磁物超标', '0.19', '%', 'F', '2026-03-27 14:38:00.000'),
  ('ENTR-20260328-002', 'SAMPLE-2802-01', '941003', '铁含量异常', '0.72', '%', 'A', '2026-03-28 10:08:00.000'),
  ('ENTR-20260328-003', 'SAMPLE-2803-01', '941004', '粒度偏粗', '71.20', 'um', 'B', '2026-03-28 11:43:00.000'),
  ('ENTR-20260329-003', 'SAMPLE-2903-01', '941002', '磁物超标', '0.23', '%', 'F', '2026-03-29 14:55:00.000'),
  ('ENTR-20260329-003', 'SAMPLE-2903-02', '941004', '粒度偏粗', '74.80', 'um', 'F', '2026-03-29 14:56:00.000'),
  ('ENTR-20260330-002', 'SAMPLE-3002-01', '941001', '密度', '2.11', 'g/cm3', 'S', '2026-03-30 16:01:00.000');

INSERT INTO `tqmtj_deal_mat_info` (
  `mat_no_to`, `source_mat_no`, `mix_wt`, `deal_time`
) VALUES
  ('B2026032802', 'RM-20260328-11', 120.500, '2026-03-28 09:15:00.000'),
  ('B2026032903', 'RM-20260329-07', 85.300, '2026-03-29 13:50:00.000');

INSERT INTO `teq_repair_manage` (
  `affiliated_unit`, `event_type`, `fault_desc`, `fault_time`,
  `repair_finish_time`, `repair_status`, `fault_grade`
) VALUES
  ('line-A', 'fault', '温控异常', '2026-03-28 08:20:00.000', NULL, 'opened', 'high'),
  ('line-A', 'repair', '更换温度传感器', '2026-03-28 13:40:00.000', '2026-03-28 14:20:00.000', 'completed', 'high'),
  ('line-A', 'maintenance', '例行保养', '2026-03-29 09:30:00.000', '2026-03-29 10:10:00.000', 'completed', 'medium');
