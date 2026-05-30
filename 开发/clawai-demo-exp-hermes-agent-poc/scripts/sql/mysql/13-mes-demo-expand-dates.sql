-- 增量扩展 mes_demo 模拟日期数据（不清表，可重复执行）
-- 规则：把 2026-03-27 ~ 2026-03-30 这批数据复制到 +7 天、+14 天
-- 并在关键业务编号追加后缀，避免唯一键冲突。

USE `mes_demo`;

-- D+7: 2026-04-03 ~ 2026-04-06
INSERT INTO `tsh_pro_stock_record` (
  `factory_code`, `workshop_code`, `line_code`, `mat_kind`, `stock_oper_order`,
  `mat_code`, `mat_no`, `mat_act_wt`, `stock_chng_time`, `hold_flag`,
  `is_test_batch`, `is_rework_batch`, `is_scrapped`
)
SELECT
  s.`factory_code`,
  s.`workshop_code`,
  s.`line_code`,
  s.`mat_kind`,
  s.`stock_oper_order`,
  s.`mat_code`,
  CONCAT(s.`mat_no`, '-D7') AS `mat_no`,
  s.`mat_act_wt`,
  DATE_ADD(s.`stock_chng_time`, INTERVAL 7 DAY) AS `stock_chng_time`,
  s.`hold_flag`,
  s.`is_test_batch`,
  s.`is_rework_batch`,
  s.`is_scrapped`
FROM `tsh_pro_stock_record` s
WHERE s.`mat_no` REGEXP '^B202603(27|28|29|30)$'
  AND NOT EXISTS (
    SELECT 1 FROM `tsh_pro_stock_record` x WHERE x.`mat_no` = CONCAT(s.`mat_no`, '-D7')
  );

INSERT INTO `tdmmm` (
  `mat_code`, `qdc`, `mat_no`, `entr_no`, `surf_judge_code`,
  `pch_judge_code`, `complex_judge_code`, `hold_flag`, `judge_time`
)
SELECT
  d.`mat_code`,
  d.`qdc`,
  CONCAT(d.`mat_no`, '-D7') AS `mat_no`,
  CONCAT(d.`entr_no`, '-D7') AS `entr_no`,
  d.`surf_judge_code`,
  d.`pch_judge_code`,
  d.`complex_judge_code`,
  d.`hold_flag`,
  DATE_ADD(d.`judge_time`, INTERVAL 7 DAY) AS `judge_time`
FROM `tdmmm` d
WHERE d.`mat_no` REGEXP '^B202603(27|28|29|30)$'
  AND NOT EXISTS (
    SELECT 1 FROM `tdmmm` x WHERE x.`mat_no` = CONCAT(d.`mat_no`, '-D7')
  );

INSERT INTO `tqmtq_entrust_result` (
  `entr_no`, `sample_no`, `item_code`, `item_name`, `act_result_value`,
  `result_unit`, `result_judge_code`, `test_time`
)
SELECT
  CONCAT(r.`entr_no`, '-D7') AS `entr_no`,
  CONCAT(r.`sample_no`, '-D7') AS `sample_no`,
  r.`item_code`,
  r.`item_name`,
  r.`act_result_value`,
  r.`result_unit`,
  r.`result_judge_code`,
  DATE_ADD(r.`test_time`, INTERVAL 7 DAY) AS `test_time`
FROM `tqmtq_entrust_result` r
WHERE r.`entr_no` REGEXP '^ENTR-202603(27|28|29|30)-[0-9]{3}$'
  AND NOT EXISTS (
    SELECT 1
    FROM `tqmtq_entrust_result` x
    WHERE x.`entr_no` = CONCAT(r.`entr_no`, '-D7')
      AND x.`sample_no` = CONCAT(r.`sample_no`, '-D7')
      AND x.`item_code` = r.`item_code`
  );

INSERT INTO `tqmtj_deal_mat_info` (
  `mat_no_to`, `source_mat_no`, `mix_wt`, `deal_time`
)
SELECT
  CONCAT(m.`mat_no_to`, '-D7') AS `mat_no_to`,
  CONCAT(m.`source_mat_no`, '-D7') AS `source_mat_no`,
  m.`mix_wt`,
  DATE_ADD(m.`deal_time`, INTERVAL 7 DAY) AS `deal_time`
FROM `tqmtj_deal_mat_info` m
WHERE m.`mat_no_to` REGEXP '^B202603(27|28|29|30)[0-9]{2}$'
  AND NOT EXISTS (
    SELECT 1
    FROM `tqmtj_deal_mat_info` x
    WHERE x.`mat_no_to` = CONCAT(m.`mat_no_to`, '-D7')
      AND x.`source_mat_no` = CONCAT(m.`source_mat_no`, '-D7')
  );

INSERT INTO `teq_repair_manage` (
  `affiliated_unit`, `event_type`, `fault_desc`, `fault_time`,
  `repair_finish_time`, `repair_status`, `fault_grade`
)
SELECT
  e.`affiliated_unit`,
  e.`event_type`,
  e.`fault_desc`,
  DATE_ADD(e.`fault_time`, INTERVAL 7 DAY) AS `fault_time`,
  CASE
    WHEN e.`repair_finish_time` IS NULL THEN NULL
    ELSE DATE_ADD(e.`repair_finish_time`, INTERVAL 7 DAY)
  END AS `repair_finish_time`,
  e.`repair_status`,
  e.`fault_grade`
FROM `teq_repair_manage` e
WHERE e.`fault_time` BETWEEN '2026-03-27 00:00:00' AND '2026-03-30 23:59:59'
  AND NOT EXISTS (
    SELECT 1
    FROM `teq_repair_manage` x
    WHERE x.`affiliated_unit` = e.`affiliated_unit`
      AND x.`event_type` = e.`event_type`
      AND x.`fault_desc` <=> e.`fault_desc`
      AND x.`fault_time` = DATE_ADD(e.`fault_time`, INTERVAL 7 DAY)
  );

-- D+14: 2026-04-10 ~ 2026-04-13
INSERT INTO `tsh_pro_stock_record` (
  `factory_code`, `workshop_code`, `line_code`, `mat_kind`, `stock_oper_order`,
  `mat_code`, `mat_no`, `mat_act_wt`, `stock_chng_time`, `hold_flag`,
  `is_test_batch`, `is_rework_batch`, `is_scrapped`
)
SELECT
  s.`factory_code`,
  s.`workshop_code`,
  s.`line_code`,
  s.`mat_kind`,
  s.`stock_oper_order`,
  s.`mat_code`,
  CONCAT(s.`mat_no`, '-D14') AS `mat_no`,
  s.`mat_act_wt`,
  DATE_ADD(s.`stock_chng_time`, INTERVAL 14 DAY) AS `stock_chng_time`,
  s.`hold_flag`,
  s.`is_test_batch`,
  s.`is_rework_batch`,
  s.`is_scrapped`
FROM `tsh_pro_stock_record` s
WHERE s.`mat_no` REGEXP '^B202603(27|28|29|30)$'
  AND NOT EXISTS (
    SELECT 1 FROM `tsh_pro_stock_record` x WHERE x.`mat_no` = CONCAT(s.`mat_no`, '-D14')
  );

INSERT INTO `tdmmm` (
  `mat_code`, `qdc`, `mat_no`, `entr_no`, `surf_judge_code`,
  `pch_judge_code`, `complex_judge_code`, `hold_flag`, `judge_time`
)
SELECT
  d.`mat_code`,
  d.`qdc`,
  CONCAT(d.`mat_no`, '-D14') AS `mat_no`,
  CONCAT(d.`entr_no`, '-D14') AS `entr_no`,
  d.`surf_judge_code`,
  d.`pch_judge_code`,
  d.`complex_judge_code`,
  d.`hold_flag`,
  DATE_ADD(d.`judge_time`, INTERVAL 14 DAY) AS `judge_time`
FROM `tdmmm` d
WHERE d.`mat_no` REGEXP '^B202603(27|28|29|30)$'
  AND NOT EXISTS (
    SELECT 1 FROM `tdmmm` x WHERE x.`mat_no` = CONCAT(d.`mat_no`, '-D14')
  );

INSERT INTO `tqmtq_entrust_result` (
  `entr_no`, `sample_no`, `item_code`, `item_name`, `act_result_value`,
  `result_unit`, `result_judge_code`, `test_time`
)
SELECT
  CONCAT(r.`entr_no`, '-D14') AS `entr_no`,
  CONCAT(r.`sample_no`, '-D14') AS `sample_no`,
  r.`item_code`,
  r.`item_name`,
  r.`act_result_value`,
  r.`result_unit`,
  r.`result_judge_code`,
  DATE_ADD(r.`test_time`, INTERVAL 14 DAY) AS `test_time`
FROM `tqmtq_entrust_result` r
WHERE r.`entr_no` REGEXP '^ENTR-202603(27|28|29|30)-[0-9]{3}$'
  AND NOT EXISTS (
    SELECT 1
    FROM `tqmtq_entrust_result` x
    WHERE x.`entr_no` = CONCAT(r.`entr_no`, '-D14')
      AND x.`sample_no` = CONCAT(r.`sample_no`, '-D14')
      AND x.`item_code` = r.`item_code`
  );

INSERT INTO `tqmtj_deal_mat_info` (
  `mat_no_to`, `source_mat_no`, `mix_wt`, `deal_time`
)
SELECT
  CONCAT(m.`mat_no_to`, '-D14') AS `mat_no_to`,
  CONCAT(m.`source_mat_no`, '-D14') AS `source_mat_no`,
  m.`mix_wt`,
  DATE_ADD(m.`deal_time`, INTERVAL 14 DAY) AS `deal_time`
FROM `tqmtj_deal_mat_info` m
WHERE m.`mat_no_to` REGEXP '^B202603(27|28|29|30)[0-9]{2}$'
  AND NOT EXISTS (
    SELECT 1
    FROM `tqmtj_deal_mat_info` x
    WHERE x.`mat_no_to` = CONCAT(m.`mat_no_to`, '-D14')
      AND x.`source_mat_no` = CONCAT(m.`source_mat_no`, '-D14')
  );

INSERT INTO `teq_repair_manage` (
  `affiliated_unit`, `event_type`, `fault_desc`, `fault_time`,
  `repair_finish_time`, `repair_status`, `fault_grade`
)
SELECT
  e.`affiliated_unit`,
  e.`event_type`,
  e.`fault_desc`,
  DATE_ADD(e.`fault_time`, INTERVAL 14 DAY) AS `fault_time`,
  CASE
    WHEN e.`repair_finish_time` IS NULL THEN NULL
    ELSE DATE_ADD(e.`repair_finish_time`, INTERVAL 14 DAY)
  END AS `repair_finish_time`,
  e.`repair_status`,
  e.`fault_grade`
FROM `teq_repair_manage` e
WHERE e.`fault_time` BETWEEN '2026-03-27 00:00:00' AND '2026-03-30 23:59:59'
  AND NOT EXISTS (
    SELECT 1
    FROM `teq_repair_manage` x
    WHERE x.`affiliated_unit` = e.`affiliated_unit`
      AND x.`event_type` = e.`event_type`
      AND x.`fault_desc` <=> e.`fault_desc`
      AND x.`fault_time` = DATE_ADD(e.`fault_time`, INTERVAL 14 DAY)
  );
