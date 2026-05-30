USE `ce_agent_demo`;

CREATE TABLE IF NOT EXISTS `analysis_task` (
  `task_id` VARCHAR(36) NOT NULL,
  `trace_id` VARCHAR(64) NOT NULL,
  `analysis_type` VARCHAR(64) NOT NULL,
  `status` ENUM('accepted', 'running', 'completed', 'failed') NOT NULL,
  `current_step` VARCHAR(64) NULL,
  `progress` INT NOT NULL DEFAULT 0,
  `input_payload` JSON NOT NULL,
  `context_payload` JSON NULL,
  `error_message` TEXT NULL,
  `requested_by` VARCHAR(64) NULL,
  `tenant_id` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`task_id`),
  UNIQUE KEY `uk_analysis_task_trace_id` (`trace_id`),
  KEY `idx_analysis_task_status` (`status`),
  KEY `idx_analysis_task_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `analysis_task_event` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` VARCHAR(36) NOT NULL,
  `trace_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `event_payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_task_event_task_id` (`task_id`, `created_at`),
  CONSTRAINT `fk_analysis_task_event_task_id`
    FOREIGN KEY (`task_id`) REFERENCES `analysis_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `structured_report` (
  `report_id` VARCHAR(36) NOT NULL,
  `task_id` VARCHAR(36) NOT NULL,
  `trace_id` VARCHAR(64) NOT NULL,
  `analysis_type` VARCHAR(64) NOT NULL,
  `template_version` VARCHAR(32) NULL,
  `report_payload` JSON NOT NULL,
  `source_refs` JSON NULL,
  `audit_trail` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uk_structured_report_task_id` (`task_id`),
  KEY `idx_structured_report_trace_id` (`trace_id`),
  CONSTRAINT `fk_structured_report_task_id`
    FOREIGN KEY (`task_id`) REFERENCES `analysis_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `item_category_mapping` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_system` VARCHAR(32) NOT NULL DEFAULT 'mes_demo',
  `dict_type` VARCHAR(64) NOT NULL DEFAULT 'qm_test_type',
  `item_code` VARCHAR(64) NULL,
  `item_name` VARCHAR(128) NULL,
  `item_category` ENUM('磁物类', 'ICP类', '粒度类', '其他类') NOT NULL,
  `match_mode` VARCHAR(32) NOT NULL DEFAULT 'explicit',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `effective_to` DATETIME(3) NULL,
  `remark` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_item_category_mapping_lookup` (`dict_type`, `item_code`, `item_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `rule_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `analysis_type` VARCHAR(64) NOT NULL,
  `rule_key` VARCHAR(64) NOT NULL,
  `rule_version` VARCHAR(32) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `threshold_config` JSON NULL,
  `description` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_config_key_version` (`analysis_type`, `rule_key`, `rule_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `metric_query_audit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `trace_id` VARCHAR(64) NOT NULL,
  `task_id` VARCHAR(36) NULL,
  `metric_key` VARCHAR(64) NOT NULL,
  `query_template_key` VARCHAR(64) NULL,
  `query_params` JSON NULL,
  `result_summary` JSON NULL,
  `duration_ms` INT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'completed',
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_metric_query_audit_trace_id` (`trace_id`),
  KEY `idx_metric_query_audit_metric_key` (`metric_key`, `created_at`),
  CONSTRAINT `fk_metric_query_audit_task_id`
    FOREIGN KEY (`task_id`) REFERENCES `analysis_task` (`task_id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
