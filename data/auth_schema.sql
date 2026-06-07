-- ═══════════════════════════════════════════════════
-- 兮易AI智体 - 统一认证与权限体系 DDL
-- 创建时间: 2026-06-07
-- 说明: 替换当前硬编码X-API-Key模式,
--       实现JWT认证 + RBAC四级权限(agent/tool/data/knowledge)
-- ═══════════════════════════════════════════════════

USE xiyi_quality;

-- ─── 1. 用户表 ───
CREATE TABLE IF NOT EXISTS sys_user (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_code   VARCHAR(32)  NOT NULL UNIQUE COMMENT '用户编码/登录名',
    user_name   VARCHAR(100) NOT NULL COMMENT '显示名称',
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt哈希',
    email       VARCHAR(200) COMMENT '邮箱',
    phone       VARCHAR(20)  COMMENT '手机',
    avatar_url  VARCHAR(500) COMMENT '头像URL',
    is_active   TINYINT(1)   DEFAULT 1 COMMENT '启用状态',
    last_login  DATETIME COMMENT '最后登录时间',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='系统用户表';

-- ─── 2. 权限资源表(统一资源定义) ───
CREATE TABLE IF NOT EXISTS sys_permission (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    perm_code       VARCHAR(64)  NOT NULL UNIQUE COMMENT '权限编码,如 scene:fpq:read',
    perm_name       VARCHAR(100) NOT NULL COMMENT '权限名称',
    resource_type   ENUM('scene','tool','data_source','knowledge','indicator','api','page') NOT NULL COMMENT '资源类型',
    resource_id     VARCHAR(100) COMMENT '资源标识',
    action          ENUM('read','write','execute','admin') DEFAULT 'read' COMMENT '操作类型',
    description     TEXT COMMENT '权限说明',
    sort_order      INT DEFAULT 0,
    is_active       TINYINT(1) DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT='权限资源表(统一RBAC)';

-- ─── 3. 角色-权限关联 ───
CREATE TABLE IF NOT EXISTS sys_role_permission (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    role_code   VARCHAR(32) NOT NULL COMMENT '角色编码,关联sys_role',
    perm_code   VARCHAR(64) NOT NULL COMMENT '权限编码,关联sys_permission',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_role_perm (role_code, perm_code),
    INDEX idx_role (role_code),
    INDEX idx_perm (perm_code)
) COMMENT='角色-权限关联表';

-- ─── 4. 用户-角色关联 ───
CREATE TABLE IF NOT EXISTS sys_user_role (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL COMMENT '用户ID',
    role_code   VARCHAR(32) NOT NULL COMMENT '角色编码',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_role (user_id, role_code),
    INDEX idx_user (user_id),
    INDEX idx_role (role_code)
) COMMENT='用户-角色关联表';

-- ─── 5. JWT刷新令牌表 ───
CREATE TABLE IF NOT EXISTS sys_token (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL COMMENT '用户ID',
    refresh_token VARCHAR(255) NOT NULL UNIQUE COMMENT '刷新令牌',
    access_jti  VARCHAR(64) COMMENT '当前access token JTI',
    device_info TEXT COMMENT '设备信息',
    ip_address  VARCHAR(50) COMMENT '登录IP',
    expires_at  DATETIME NOT NULL COMMENT '过期时间',
    revoked     TINYINT(1) DEFAULT 0 COMMENT '是否已吊销',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) COMMENT='JWT令牌管理表';

-- ─── 6. API审计日志 ───
CREATE TABLE IF NOT EXISTS sys_api_audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT COMMENT '用户ID(未认证时为空)',
    method      VARCHAR(10) NOT NULL COMMENT 'HTTP方法',
    path        VARCHAR(300) NOT NULL COMMENT '请求路径',
    status_code INT NOT NULL COMMENT 'HTTP状态码',
    duration_ms INT COMMENT '耗时(毫秒)',
    ip_address  VARCHAR(50) COMMENT '请求IP',
    user_agent  TEXT COMMENT '客户端UA',
    request_body TEXT COMMENT '请求体(脱敏)',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_path (path),
    INDEX idx_created (created_at),
    INDEX idx_status (status_code)
) COMMENT='API审计日志';

-- ─── 7. 会话管理表(可选: 用于多设备登录管理) ───
CREATE TABLE IF NOT EXISTS sys_session (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL COMMENT '用户ID',
    session_key VARCHAR(64) NOT NULL UNIQUE COMMENT '会话标识',
    access_token VARCHAR(500) COMMENT '当前access token',
    expires_at  DATETIME NOT NULL COMMENT '过期时间',
    is_active   TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) COMMENT='用户会话表';
