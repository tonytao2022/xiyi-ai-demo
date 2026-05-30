USE `mes_demo`;

CREATE TABLE IF NOT EXISTS `tsh_pro_stock_record` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `factory_code` VARCHAR(32) NULL,
  `workshop_code` VARCHAR(32) NULL,
  `line_code` VARCHAR(32) NULL,
  `mat_kind` VARCHAR(64) NULL,
  `stock_oper_order` VARCHAR(32) NOT NULL,
  `mat_code` VARCHAR(64) NOT NULL,
  `mat_no` VARCHAR(64) NOT NULL,
  `mat_act_wt` DECIMAL(18,3) NULL,
  `stock_chng_time` DATETIME(3) NOT NULL,
  `hold_flag` VARCHAR(8) NULL,
  `is_test_batch` TINYINT(1) NOT NULL DEFAULT 0,
  `is_rework_batch` TINYINT(1) NOT NULL DEFAULT 0,
  `is_scrapped` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_stock_record_time` (`stock_chng_time`),
  KEY `idx_stock_record_mat_no` (`mat_no`),
  KEY `idx_stock_record_oper_order` (`stock_oper_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tdmmm` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mat_code` VARCHAR(64) NOT NULL,
  `qdc` VARCHAR(32) NULL,
  `mat_no` VARCHAR(64) NOT NULL,
  `entr_no` VARCHAR(64) NULL,
  `surf_judge_code` VARCHAR(8) NULL,
  `pch_judge_code` VARCHAR(8) NOT NULL,
  `complex_judge_code` VARCHAR(8) NULL,
  `hold_flag` VARCHAR(8) NULL,
  `judge_time` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tdmmm_mat_no` (`mat_no`),
  KEY `idx_tdmmm_entr_no` (`entr_no`),
  KEY `idx_tdmmm_pch_judge_code` (`pch_judge_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tqmtq_entrust_result` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entr_no` VARCHAR(64) NOT NULL,
  `sample_no` VARCHAR(64) NULL,
  `item_code` VARCHAR(64) NULL,
  `item_name` VARCHAR(128) NULL,
  `act_result_value` VARCHAR(128) NULL,
  `result_unit` VARCHAR(32) NULL,
  `result_judge_code` VARCHAR(8) NULL,
  `test_time` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_entrust_result_entr_no` (`entr_no`),
  KEY `idx_entrust_result_item_code` (`item_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sys_dict_data` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dict_type` VARCHAR(64) NOT NULL,
  `dict_code` VARCHAR(64) NOT NULL,
  `dict_label` VARCHAR(128) NOT NULL,
  `dict_value` VARCHAR(64) NULL,
  `dict_sort` INT NOT NULL DEFAULT 0,
  `status` CHAR(1) NOT NULL DEFAULT '0',
  `remark` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_dict_type_code` (`dict_type`, `dict_code`),
  KEY `idx_sys_dict_type_label` (`dict_type`, `dict_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tqmtj_deal_mat_info` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mat_no_to` VARCHAR(64) NOT NULL,
  `source_mat_no` VARCHAR(64) NULL,
  `mix_wt` DECIMAL(18,3) NOT NULL DEFAULT 0,
  `deal_time` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_deal_mat_info_mat_no_to` (`mat_no_to`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `teq_repair_manage` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `affiliated_unit` VARCHAR(64) NULL,
  `event_type` VARCHAR(32) NULL,
  `fault_desc` TEXT NULL,
  `fault_time` DATETIME(3) NOT NULL,
  `repair_finish_time` DATETIME(3) NULL,
  `repair_status` VARCHAR(32) NULL,
  `fault_grade` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_repair_manage_fault_time` (`fault_time`),
  KEY `idx_repair_manage_affiliated_unit` (`affiliated_unit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
