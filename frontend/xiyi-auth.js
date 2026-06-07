/**
 * 兮易AI智体 - 统一认证脚本
 * 所有需要API认证的页面引入此脚本
 * 用法: <script src="/xiyi-auth.js"></script>
 */
(function() {
  var token = localStorage.getItem('xiyi_access_token');
  var expires = parseInt(localStorage.getItem('xiyi_token_expires') || '0');

  // Token过期或不存在 → 跳转登录
  if (!token || Date.now() > expires) {
    // 公共页面不强制跳转(架构总结/路线图等)
    var isPublic = /xiyi-architecture|xiyi-login|xiyi-index/.test(window.location.pathname);
    if (!isPublic) {
      window.location.href = '/xiyi-login.html?from=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
    return;
  }

  // 带认证的fetch封装
  window.authFetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = '***' + token;
    return fetch(url, opts);
  };

  // 自动为fetch打补丁(可选: 开启后所有fetch自动带token)
  // var origFetch = window.fetch;
  // window.fetch = function(url, opts) {
  //   if (typeof url === 'string' && url.indexOf('/api/v1/xiyi/') >= 0) {
  //     opts = opts || {};
  //     opts.headers = opts.headers || {};
  //     opts.headers['Authorization'] = '***' + token;
  //   }
  //   return origFetch(url, opts);
  // };

  console.log('[xiyi-auth] Token loaded, expires in ' + Math.round((expires - Date.now())/1000) + 's');
})();
