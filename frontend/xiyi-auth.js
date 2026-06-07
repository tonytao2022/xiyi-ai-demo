/**
 * 兮易AI智体 - 统一认证脚本
 * 所有需要API认证的页面引入此脚本
 * 用法: <script src="/xiyi-auth.js?v=2"></script>
 */
(function() {
  var token = localStorage.getItem('xiyi_access_token');
  var expires = parseInt(localStorage.getItem('xiyi_token_expires') || '0');

  // 带认证的fetch封装 — 无论有无token都定义
  window.authFetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (token) {
      opts.headers['Authorization'] = 'Bearer ' + token;
    }
    return fetch(url, opts);
  };

  // 检查token状态
  if (!token || Date.now() > expires) {
    console.warn('[xiyi-auth] Token missing or expired');
    var isPublic = /xiyi-architecture|xiyi-login|xiyi-index/.test(window.location.pathname);
    if (!isPublic) {
      window.location.href = '/xiyi-login.html?from=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    // 公共页面: authFetch定义好了，只是不带token
    return;
  }

  console.log('[xiyi-auth] Token loaded, expires in ' + Math.round((expires - Date.now())/1000) + 's');
})();
