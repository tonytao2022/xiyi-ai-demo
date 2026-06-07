"""
兮易AI智体 - 统一JWT认证模块
替换硬编码X-API-Key模式，实现:
  - JWT access/refresh token
  - RBAC四级权限检查 (agent / tool / data / knowledge)
  - API审计日志
  - 兼容期: 同时接受X-API-Key(过渡用)

用法:
  from auth_middleware import jwt_required, require_permission, auth_bp

  @app.route('/api/v1/xiyi/scenes')
  @jwt_required
  def get_scenes():
      ...

  @app.route('/api/v1/xiyi/config')
  @jwt_required
  @require_permission('admin:config')
  def admin_config():
      ...
"""

import os
import time
import hashlib
import logging
from datetime import datetime, timedelta
from functools import wraps

import jwt
import bcrypt
from flask import Blueprint, request, jsonify, g

logger = logging.getLogger(__name__)

# ─── 配置 ───
JWT_SECRET = os.environ.get('XIYI_JWT_SECRET', 'xiyi-jwt-secret-change-in-production-2026')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('XIYI_ACCESS_EXPIRE', 120))   # 2小时
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get('XIYI_REFRESH_EXPIRE', 30))    # 30天
# 兼容期: 旧的API Key
LEGACY_API_KEY = os.environ.get('XIYI_API_KEY', '90a275cbcc004fd5')

# ─── Blueprint ───
auth_bp = Blueprint('auth', __name__)


# ═══════════════════════════════════════════════
# 密码工具
# ═══════════════════════════════════════════════
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


# ═══════════════════════════════════════════════
# JWT令牌工具
# ═══════════════════════════════════════════════
def _get_db():
    if not hasattr(g, '_db_conn'):
        from dbutils.pooled_db import PooledDB
        import pymysql
        # 复用xiyi_server的连接池模式
        pool = _get_pool()
        g._db_conn = pool.connection()
    return g._db_conn


def _get_pool():
    """获取连接池(与xiyi_server共享模式)"""
    import pymysql
    from dbutils.pooled_db import PooledDB
    pool_attr = '_xiyi_pool'
    if not hasattr(_get_pool, pool_attr):
        mysql_user = os.environ.get('XIYI_MYSQL_USER', 'debian-sys-maint')
        mysql_pass = os.environ.get('XIYI_MYSQL_PASSWORD', '')
        if not mysql_pass:
            try:
                with open('/etc/mysql/debian.cnf') as f:
                    for line in f:
                        if 'password' in line:
                            mysql_pass = line.strip().split('=')[-1].strip().strip('"').strip("'")
                            break
            except Exception:
                mysql_pass = ''
        setattr(_get_pool, pool_attr, PooledDB(
            creator=pymysql,
            maxconnections=10, mincached=2,
            host='127.0.0.1', port=3306,
            user=mysql_user, password=mysql_pass,
            database='xiyi_quality', charset='utf8mb4',
        ))
    return getattr(_get_pool, pool_attr)


def _db_exec(sql, params=None, fetch='all'):
    """执行SQL并返回结果"""
    conn = _get_pool().connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        if fetch == 'all':
            rows = cur.fetchall()
        elif fetch == 'one':
            rows = cur.fetchone()
        else:
            conn.commit()
            rows = cur.lastrowid
        return rows
    finally:
        conn.close()


def create_access_token(user_id: int, user_code: str, roles: list) -> str:
    """生成access token"""
    now = datetime.utcnow()
    jti = hashlib.md5(f"{user_id}{now.timestamp()}".encode()).hexdigest()[:16]
    payload = {
        'sub': user_code,
        'uid': user_id,
        'roles': roles,
        'jti': jti,
        'iat': now,
        'exp': now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        'type': 'access',
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM), jti


def create_refresh_token(user_id: int) -> str:
    """生成refresh token"""
    now = datetime.utcnow()
    payload = {
        'uid': user_id,
        'iat': now,
        'exp': now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        'type': 'refresh',
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    # 存DB
    expires_at = (now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
    _db_exec(
        "INSERT INTO sys_token (user_id, refresh_token, expires_at, ip_address) VALUES (%s,%s,%s,%s)",
        (user_id, token, expires_at, request.remote_addr or ''),
        fetch='none'
    )
    return token


# ═══════════════════════════════════════════════
# 认证装饰器
# ═══════════════════════════════════════════════
def _extract_token():
    """从请求中提取token(兼容多种方式)"""
    # 1. Bearer Token
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:]
    # 2. X-JWT-Token 头
    token = request.headers.get('X-JWT-Token', '')
    if token:
        return token
    # 3. Cookie (Web端)
    token = request.cookies.get('xiyi_token', '')
    if token:
        return token
    return None


def jwt_required(f):
    """JWT认证装饰器 - 替换旧的check_api_key"""
    @wraps(f)
    def decorated(*args, **kwargs):
        g.current_user = None
        g.current_roles = []

        # ── 兼容期: 旧的X-API-Key仍然有效 ──
        legacy_key = request.headers.get('X-API-Key', '')
        if legacy_key == LEGACY_API_KEY:
            # 设置默认管理员身份
            g.current_user = {'id': 1, 'user_code': 'admin', 'user_name': '系统管理员(兼容模式)'}
            g.current_roles = ['quality_specialist']
            g.auth_mode = 'legacy'
            return f(*args, **kwargs)

        # ── JWT认证 ──
        token = _extract_token()
        if not token:
            return jsonify({
                'code': 401, 'error': '未提供认证令牌',
                'hint': '请先登录获取token，或使用Bearer Token'
            }), 401

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get('type') != 'access':
                return jsonify({'code': 401, 'error': '令牌类型不正确'}), 401

            g.current_user = {
                'id': payload['uid'],
                'user_code': payload['sub'],
                'roles': payload.get('roles', []),
                'jti': payload.get('jti', ''),
            }
            g.current_roles = payload.get('roles', [])
            g.auth_mode = 'jwt'

            # 检查token是否已过期(由jwt.decode自动处理, 这里做二次确认)
            if datetime.utcnow() > datetime.fromtimestamp(payload['exp']):
                return jsonify({'code': 401, 'error': '令牌已过期', 'hint': '请使用refresh_token刷新'}), 401

        except jwt.ExpiredSignatureError:
            return jsonify({'code': 401, 'error': '令牌已过期', 'hint': '请使用refresh_token刷新'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'code': 401, 'error': f'无效令牌: {str(e)}'}), 401

        return f(*args, **kwargs)

    return decorated


def require_permission(perm_code: str):
    """权限检查装饰器"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(g, 'current_user', None)
            if not user:
                return jsonify({'code': 403, 'error': '未认证'}), 403

            # 兼容模式: 暂时全部放行
            if g.get('auth_mode') == 'legacy':
                return f(*args, **kwargs)

            # 查询用户是否有该权限
            roles = user.get('roles', [])
            if not roles:
                return jsonify({'code': 403, 'error': '无角色分配'}), 403

            placeholders = ','.join(['%s'] * len(roles))
            row = _db_exec(
                f"SELECT COUNT(*) FROM sys_role_permission WHERE role_code IN ({placeholders}) AND perm_code=%s",
                (*roles, perm_code), fetch='one'
            )
            if not row or row[0] == 0:
                return jsonify({
                    'code': 403, 'error': f'无权限: {perm_code}',
                    'your_roles': roles
                }), 403

            return f(*args, **kwargs)
        return decorated
    return decorator


def optional_auth(f):
    """可选认证: 有token则解析, 无token也放行"""
    @wraps(f)
    def decorated(*args, **kwargs):
        g.current_user = None
        g.current_roles = []
        token = _extract_token()
        if token:
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
                g.current_user = {
                    'id': payload['uid'],
                    'user_code': payload['sub'],
                    'roles': payload.get('roles', []),
                }
                g.current_roles = payload.get('roles', [])
                g.auth_mode = 'jwt'
            except Exception:
                pass
        return f(*args, **kwargs)
    return decorated


# ═══════════════════════════════════════════════
# API审计(可选, 作为装饰器)
# ═══════════════════════════════════════════════
def audit_api(f):
    """API调用审计(轻量级)"""
    @wraps(f)
    def decorated(*args, **kwargs):
        start = time.time()
        response = f(*args, **kwargs)
        elapsed = int((time.time() - start) * 1000)
        try:
            uid = g.current_user['id'] if g.current_user else None
            status = response[1] if isinstance(response, tuple) else 200
            _db_exec(
                "INSERT INTO sys_api_audit_log (user_id, method, path, status_code, duration_ms, ip_address) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (uid, request.method, request.path[:300], status, elapsed, request.remote_addr or ''),
                fetch='none'
            )
        except Exception:
            pass
        return response
    return decorated


# ═══════════════════════════════════════════════
# 认证路由
# ═══════════════════════════════════════════════
@auth_bp.route('/api/v1/xiyi/auth/login', methods=['POST'])
def login():
    """用户登录,返回access+refresh token"""
    data = request.get_json(silent=True) or {}
    user_code = data.get('user_code', data.get('username', ''))
    password = data.get('password', '')

    if not user_code or not password:
        return jsonify({'code': 400, 'error': '请提供用户名和密码'}), 400

    row = _db_exec(
        "SELECT id, user_code, user_name, password_hash, is_active FROM sys_user WHERE user_code=%s",
        (user_code,), fetch='one'
    )
    if not row:
        return jsonify({'code': 401, 'error': '用户名或密码错误'}), 401
    if not row[4]:  # is_active
        return jsonify({'code': 403, 'error': '账号已禁用'}), 403

    if not verify_password(password, row[3]):
        return jsonify({'code': 401, 'error': '用户名或密码错误'}), 401

    user_id, uc, un = row[0], row[1], row[2]

    # 获取角色
    roles_rows = _db_exec(
        "SELECT role_code FROM sys_user_role WHERE user_id=%s", (user_id,), fetch='all'
    )
    roles = [r[0] for r in roles_rows] if roles_rows else []

    # 生成令牌
    access_token, jti = create_access_token(user_id, uc, roles)
    refresh_token = create_refresh_token(user_id)

    # 更新最后登录
    _db_exec("UPDATE sys_user SET last_login=NOW() WHERE id=%s", (user_id,), fetch='none')

    return jsonify({
        'code': 0,
        'data': {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'token_type': 'Bearer',
            'expires_in': ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            'user': {'id': user_id, 'user_code': uc, 'user_name': un, 'roles': roles},
        },
        'message': '登录成功',
    })


@auth_bp.route('/api/v1/xiyi/auth/refresh', methods=['POST'])
def refresh():
    """刷新access token"""
    data = request.get_json(silent=True) or {}
    refresh_token = data.get('refresh_token', '')

    if not refresh_token:
        return jsonify({'code': 400, 'error': '请提供refresh_token'}), 400

    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get('type') != 'refresh':
            return jsonify({'code': 401, 'error': '令牌类型不正确'}), 401
    except jwt.ExpiredSignatureError:
        return jsonify({'code': 401, 'error': '刷新令牌已过期，请重新登录'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'code': 401, 'error': '无效刷新令牌'}), 401

    # 检查DB中是否未吊销
    row = _db_exec(
        "SELECT id, user_id, revoked FROM sys_token WHERE refresh_token=%s",
        (refresh_token,), fetch='one'
    )
    if not row or row[2]:
        return jsonify({'code': 401, 'error': '刷新令牌已失效'}), 401

    user_id = row[1]

    # 获取用户信息
    user_row = _db_exec(
        "SELECT user_code, is_active FROM sys_user WHERE id=%s", (user_id,), fetch='one'
    )
    if not user_row or not user_row[1]:
        return jsonify({'code': 403, 'error': '账号已禁用'}), 403

    roles_rows = _db_exec(
        "SELECT role_code FROM sys_user_role WHERE user_id=%s", (user_id,), fetch='all'
    )
    roles = [r[0] for r in roles_rows] if roles_rows else []

    # 生成新access token
    access_token, Jti = create_access_token(user_id, user_row[0], roles)

    return jsonify({
        'code': 0,
        'data': {
            'access_token': access_token,
            'token_type': 'Bearer',
            'expires_in': ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        },
        'message': '令牌刷新成功',
    })


@auth_bp.route('/api/v1/xiyi/auth/logout', methods=['POST'])
@jwt_required
def logout():
    """登出: 吊销refresh token"""
    data = request.get_json(silent=True) or {}
    refresh_token = data.get('refresh_token', '')
    if refresh_token:
        _db_exec(
            "UPDATE sys_token SET revoked=1 WHERE refresh_token=%s",
            (refresh_token,), fetch='none'
        )
    return jsonify({'code': 0, 'message': '登出成功'})


@auth_bp.route('/api/v1/xiyi/auth/me', methods=['GET'])
@jwt_required
def me():
    """获取当前用户信息和权限"""
    user = g.current_user
    perms_rows = _db_exec(
        "SELECT rp.perm_code, p.perm_name, p.resource_type, p.action "
        "FROM sys_role_permission rp "
        "JOIN sys_permission p ON rp.perm_code=p.perm_code "
        "WHERE rp.role_code IN (" + ','.join(['%s'] * len(g.current_roles)) + ")",
        tuple(g.current_roles), fetch='all'
    )
    permissions = [
        {'perm_code': r[0], 'perm_name': r[1], 'resource_type': r[2], 'action': r[3]}
        for r in perms_rows
    ] if perms_rows else []

    return jsonify({
        'code': 0,
        'data': {
            'user': user,
            'roles': g.current_roles,
            'permissions': permissions,
            'auth_mode': g.get('auth_mode', 'unknown'),
        }
    })


@auth_bp.route('/api/v1/xiyi/auth/health', methods=['GET'])
def auth_health():
    return jsonify({'code': 0, 'message': 'Auth service OK', 'jwt_enabled': True})


# ─── 导出函数方便外部使用 ───
__all__ = [
    'auth_bp', 'jwt_required', 'require_permission', 'optional_auth',
    'hash_password', 'verify_password', 'create_access_token', 'create_refresh_token',
]
