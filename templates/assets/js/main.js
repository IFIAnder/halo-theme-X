/* ==========================================================================
   X 主题 · 交互脚本
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ------------------------------------------------------------------
   * 1. 工具
   * ------------------------------------------------------------------ */
  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* 复制到剪贴板（带回退） */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(ta);
    });
  }

  /* Toast */
  var toastEl = null;
  var toastTimer = null;
  function ensureToast() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'x-toast';
      document.body.appendChild(toastEl);
    }
    return toastEl;
  }
  function toast(message) {
    var el = ensureToast();
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2000);
  }

  /* ------------------------------------------------------------------
   * 2. 时间格式化（对齐 X 的呈现方式）
   * ------------------------------------------------------------------ */
  function parseDate(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  /* 时间线上的相对时间：现在 / 5分钟 / 3小时 / 8月14日 / 2024年8月 */
  function relativeTime(date) {
    var diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 0) diff = 0;
    if (diff < 60) return '现在';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时';
    var now = new Date();
    if (date.getFullYear() === now.getFullYear()) {
      return date.getMonth() + 1 + '月' + date.getDate() + '日';
    }
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
  }

  function fullTime(date, pattern) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    if (pattern === 'yyyy-MM') {
      return y + '-' + (m < 10 ? '0' + m : m);
    }
    /* 只精确到天：加入日期这种场景不该带上「上午12:00」 */
    if (pattern === 'yyyy-MM-dd') {
      return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
    }
    var hh = date.getHours();
    var mm = date.getMinutes();
    var suffix = hh < 12 ? '上午' : '下午';
    var h12 = hh % 12 === 0 ? 12 : hh % 12;
    return (
      y + '年' + m + '月' + d + '日 ' + suffix + h12 + ':' + (mm < 10 ? '0' + mm : mm)
    );
  }

  function initTimes() {
    $$('time[datetime]').forEach(function (el) {
      var date = parseDate(el.getAttribute('datetime'));
      if (!date) return;
      var isDetail = el.closest('.x-detail__meta') !== null;
      el.textContent = isDetail ? fullTime(date) : relativeTime(date);
      el.setAttribute('title', fullTime(date));
    });

    $$('[data-x-date]').forEach(function (el) {
      var date = parseDate(el.getAttribute('data-datetime'));
      if (!date) return;
      el.textContent = fullTime(date, el.getAttribute('data-x-date'));
    });

    $$('[data-x-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  /* 阅读时长（依据摘要长度粗略估算） */
  function initReading() {
    $$('[data-x-reading]').forEach(function (el) {
      var text = el.getAttribute('data-text') || '';
      if (!text) {
        el.textContent = '1 分钟';
        return;
      }
      var minutes = Math.max(1, Math.round(text.length / 220));
      el.textContent = minutes + ' 分钟';
    });
  }

  /* ------------------------------------------------------------------
   * 3. 配色方案切换
   * ------------------------------------------------------------------ */
  var SCHEMES = [
    { key: 'site', label: '跟随站点设置', icon: '#i-sparkle' },
    { key: 'light', label: '亮色', icon: '#i-sun' },
    { key: 'dim', label: '暗调', icon: '#i-moon' },
    { key: 'dark', label: '熄灯', icon: '#i-dim' },
    { key: 'system', label: '跟随系统', icon: '#i-grok' }
  ];

  function resolveScheme(scheme) {
    if (scheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return scheme;
  }

  function clearLocalScheme() {
    try {
      localStorage.removeItem('x-color-scheme');
      localStorage.removeItem('x-color-scheme-stamp');
      localStorage.removeItem('x-color-scheme-preset');
    } catch (e) {}
  }

  /* 配色方案：site = 清除本地覆盖，回到站点设置。
     覆盖要连带写下「站点当前设置的指纹」，站长一改设置它就作废 —— 
     否则访客（包括站长自己）会陷在某个旧选择里，后台怎么改都不生效。 */
  function applyScheme(scheme) {
    var preset = root.getAttribute('data-default-theme') || 'dark';
    var effective = scheme === 'site' ? preset : scheme;
    try {
      if (scheme === 'site') {
        clearLocalScheme();
      } else {
        localStorage.setItem('x-color-scheme', scheme);
        localStorage.setItem('x-color-scheme-stamp', preset);
        localStorage.removeItem('x-color-scheme-preset');
      }
    } catch (e) {}
    root.setAttribute('data-theme', resolveScheme(effective));
    root.setAttribute('data-preference', effective);
  }

  var themeMenu = null;
  function closeThemeMenu() {
    if (themeMenu) {
      themeMenu.remove();
      themeMenu = null;
      document.removeEventListener('click', onDocClickForMenu, true);
    }
  }
  function onDocClickForMenu(e) {
    if (themeMenu && !themeMenu.contains(e.target)) closeThemeMenu();
  }

  function schemeLabel(key) {
    for (var i = 0; i < SCHEMES.length; i++) {
      if (SCHEMES[i].key === key) return SCHEMES[i].label;
    }
    return key;
  }

  function openThemeMenu(anchor) {
    closeThemeMenu();
    var preset = root.getAttribute('data-default-theme') || 'dark';
    /* 当前生效项：有本地覆盖就显示它，否则显示「跟随站点设置」 */
    var current = 'site';
    try {
      var savedScheme = localStorage.getItem('x-color-scheme');
      var stamp = localStorage.getItem('x-color-scheme-stamp');
      if (savedScheme && stamp === preset) current = savedScheme;
    } catch (e) {}

    themeMenu = document.createElement('div');
    themeMenu.className = 'x-theme-menu';
    themeMenu.innerHTML = SCHEMES.map(function (s) {
      return (
        '<button type="button" class="x-theme-menu__item' +
        (s.key === current ? ' is-active' : '') +
        '" data-scheme="' +
        s.key +
        '">' +
        '<span class="x-theme-menu__label">' +
        '<svg class="x-icon" viewBox="0 0 24 24"><use href="' + s.icon + '"></use></svg>' +
        '<span>' + s.label + '</span>' +
        '</span>' +
        '<svg class="x-icon x-theme-menu__check" viewBox="0 0 24 24"><use href="#i-verified"></use></svg>' +
        '</button>'
      );
    }).join('') +
      '<p class="x-theme-menu__foot">' +
      '<span>站点设置：' + escapeHtml(schemeLabel(preset)) + '</span>' +
      '<span>当前生效：' +
      escapeHtml(current === 'site' ? '跟随站点设置' : '你的选择（' + schemeLabel(current) + '）') +
      '</span>' +
      '</p>';
    document.body.appendChild(themeMenu);

    var rect = anchor.getBoundingClientRect();
    var width = themeMenu.offsetWidth;
    var left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8
    );
    themeMenu.style.left = left + 'px';
    themeMenu.style.top = rect.bottom + 8 + 'px';

    themeMenu.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-scheme]');
      if (!btn) return;
      applyScheme(btn.getAttribute('data-scheme'));
      closeThemeMenu();
    });

    setTimeout(function () {
      document.addEventListener('click', onDocClickForMenu, true);
    }, 0);
  }

  /* 系统配色变化的监听已放在 layout 的内联脚本里（更早生效），这里不再重复注册 */

  /* ------------------------------------------------------------------
   * 4. 点赞（Halo Upvote API）
   * ------------------------------------------------------------------ */
  /* 点赞端点在 trackers 下，不是 upvotes。
     请求体必须是 { group, plural, name } —— 注意是 plural（posts / moments）而不是 kind。
     字段写错时服务端不报错，照样返回 200，但点赞数不会增加，从结果上很难看出来。
     参考 Halo 官方主题 theme-earth 的 src/assets/alpine-data/upvote.ts。 */
  var UPVOTE_API = '/apis/api.halo.run/v1alpha1/trackers/upvote';
  /* 阅读数上报，请求体形状与 upvote 相同 */
  var COUNTER_API = '/apis/api.halo.run/v1alpha1/trackers/counter';

  /* 点赞目标：文章用 content.halo.run/posts，瞬间用 moment.halo.run/moments */
  function likeTarget(btn) {
    var post = btn.getAttribute('data-post-name');
    if (post) {
      return { key: 'post:' + post, group: 'content.halo.run', plural: 'posts', name: post };
    }
    var moment = btn.getAttribute('data-moment-name');
    if (moment) {
      return { key: 'moment:' + moment, group: 'moment.halo.run', plural: 'moments', name: moment };
    }
    return null;
  }

  function bumpCount(btn, delta) {
    var count = $('.x-action__count', btn);
    var current = count ? parseInt(count.textContent.trim(), 10) || 0 : 0;
    var next = Math.max(0, current + delta);
    if (!count) {
      count = document.createElement('span');
      count.className = 'x-action__count';
      btn.appendChild(count);
    }
    count.textContent = next > 0 ? String(next) : '';
  }

  function likeKey(name) {
    return 'x-liked:' + name;
  }

  function toggleLike(btn) {
    var target = likeTarget(btn);
    if (!target) return;

    var liked = false;
    try {
      liked = localStorage.getItem(likeKey(target.key)) === '1';
    } catch (e) {}

    if (liked) {
      toast('已经赞过了');
      return;
    }

    btn.classList.add('is-liked');
    bumpCount(btn, 1);

    /* 静态预览模式下不发起真实请求 */
    if (root.hasAttribute('data-preview')) {
      toast('预览模式：点赞已记录');
      return;
    }

    fetch(UPVOTE_API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group: target.group,
        plural: target.plural,
        name: target.name
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        try {
          localStorage.setItem(likeKey(target.key), '1');
        } catch (e) {}
        toast('已点赞');
      })
      .catch(function (err) {
        /* 回滚乐观更新，并把失败原因说清楚，不要一律「点赞失败」 */
        btn.classList.remove('is-liked');
        bumpCount(btn, -1);
        toast('点赞失败：' + (err && err.message ? err.message : '网络异常'));
      });
  }

  /* ------------------------------------------------------------------
   * 4.5 阅读数上报
   * 主题一直在展示「查看」数，但从没上报过 counter，所以数字永远是旧的。
   * Halo 的 counter 不去重，因此用 sessionStorage 保证同一篇在一次会话里只报一次，
   * 避免刷新页面刷出虚高的阅读量。
   * ------------------------------------------------------------------ */
  function viewKey(name) {
    return 'x-viewed:' + name;
  }

  function reportView() {
    if (root.hasAttribute('data-preview')) return;

    var detail = $('.x-detail[data-post-name], .x-detail[data-moment-name]');
    if (!detail) return;

    var target = likeTarget(detail);
    if (!target) return;

    try {
      if (sessionStorage.getItem(viewKey(target.key)) === '1') return;
    } catch (e) {}

    fetch(COUNTER_API, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group: target.group,
        plural: target.plural,
        name: target.name
      })
    })
      .then(function () {
        try {
          sessionStorage.setItem(viewKey(target.key), '1');
        } catch (e) {}
      })
      .catch(function () {});
  }

  function restoreLikes() {
    $$('.x-action--like[data-post-name], .x-action--like[data-moment-name]').forEach(function (btn) {
      var target = likeTarget(btn);
      if (!target) return;
      try {
        if (localStorage.getItem(likeKey(target.key)) === '1') {
          btn.classList.add('is-liked');
        }
      } catch (e) {}
    });
  }

  /* ------------------------------------------------------------------
   * 5. 收藏（本地）
   * ------------------------------------------------------------------ */
  function toggleBookmark(btn) {
    var post = btn.closest('.x-post, .x-detail');
    var name = post && post.getAttribute('data-post-name');
    if (!name) {
      toast('已收藏');
      return;
    }
    var active = !btn.classList.contains('is-active');
    btn.classList.toggle('is-active', active);
    try {
      localStorage.setItem('x-saved:' + name, active ? '1' : '0');
    } catch (e) {}
    toast(active ? '已收藏' : '已取消收藏');
  }

  /* ------------------------------------------------------------------
   * 5.5 「更多」导航折叠菜单
   * ------------------------------------------------------------------ */
  var navMoreEl = null;

  function closeNavMore() {
    if (navMoreEl) {
      navMoreEl.hidden = true;
      navMoreEl = null;
      document.removeEventListener('click', onDocClickNavMore, true);
    }
  }

  function onDocClickNavMore(e) {
    if (navMoreEl && !navMoreEl.contains(e.target)) closeNavMore();
  }

  /* ------------------------------------------------------------------
   * 5.5 作者主页：TA 常聊的话题
   * 服务端只能按「当前页文章」把标签平铺出来，同一个标签会出现多次，
   * 这里在前端去重并只保留前 6 个
   * ------------------------------------------------------------------ */
  function initAuthorTopics() {
    var box = $('[data-x-author-topics]');
    if (!box) return;

    var MAX = 6;
    var seen = {};
    var kept = 0;

    $$('[data-x-topic]', box).forEach(function (el) {
      var name = (el.textContent || '').trim();
      if (!name || seen[name] || kept >= MAX) {
        el.remove();
        return;
      }
      seen[name] = 1;
      kept++;
    });

    if (kept) box.hidden = false;
    else box.remove();
  }

  /* ------------------------------------------------------------------
   * 5.6 账号菜单（左下角账号卡片右侧的「…」）
   * 和「更多」菜单同一套思路：点击外部或按 Esc 关闭
   * ------------------------------------------------------------------ */
  var accountMenuEl = null;

  function closeAccountMenu() {
    if (accountMenuEl) {
      accountMenuEl.hidden = true;
      accountMenuEl = null;
      document.removeEventListener('click', onDocClickAccountMenu, true);
    }
  }

  function onDocClickAccountMenu(e) {
    if (accountMenuEl && !accountMenuEl.contains(e.target)) closeAccountMenu();
  }

  function toggleAccountMenu(btn) {
    var wrap = btn.closest('.x-account-wrap') || btn.parentElement;
    var menu = wrap ? $('[data-x-account-menu]', wrap) : null;
    if (!menu) return;

    if (accountMenuEl === menu) {
      closeAccountMenu();
      return;
    }
    closeAccountMenu();
    closeNavMore();
    menu.hidden = false;
    accountMenuEl = menu;
    setTimeout(function () {
      document.addEventListener('click', onDocClickAccountMenu, true);
    }, 0);
  }

  /* ------------------------------------------------------------------
   * 5.8 通知（Halo 原生通知中心）
   * 端点形如 /userspaces/{用户名}/notifications，注意是 userspaces 嵌套路径，
   * 不是顶层的 /notifications（后者不存在，会 404）。
   * 「站内通知」类插件通过 Halo 通知中心投递，所以不装插件照样有通知。
   * ------------------------------------------------------------------ */
  var NOTIFY_BASE = '/apis/api.notification.halo.run/v1alpha1/userspaces/';

  function notifyApi(user, suffix) {
    return NOTIFY_BASE + encodeURIComponent(user) + '/notifications' + (suffix || '');
  }

  var notifyEl = null;

  function closeNotify() {
    if (!notifyEl) return;
    notifyEl.hidden = true;
    notifyEl = null;
    document.removeEventListener('click', onDocClickNotify, true);
  }

  function onDocClickNotify(e) {
    if (notifyEl && !notifyEl.contains(e.target)) closeNotify();
  }

  function setNotifyStatus(panel, text) {
    var box = $('[data-x-notify-status]', panel);
    if (!box) return;
    if (!text) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.textContent = text;
  }

  function renderNotifyList(panel, items) {
    var list = $('[data-x-notify-list]', panel);
    var badge = $('[data-x-notify-badge]', document);
    if (!list) return;

    var unread = 0;
    items.forEach(function (it) {
      if (it && it.spec && it.spec.unread) unread++;
    });

    if (!items.length) {
      setNotifyStatus(panel, '还没有通知');
      list.hidden = true;
      if (badge) badge.hidden = true;
      return;
    }

    setNotifyStatus(panel, '');
    list.innerHTML = items
      .map(function (it) {
        var spec = (it && it.spec) || {};
        var meta = (it && it.metadata) || {};
        var title = spec.title || spec.reason || '通知';
        var time = meta.creationTimestamp ? relativeTime(new Date(meta.creationTimestamp)) : '';
        var body = (spec.rawContent || '').slice(0, 120);
        return (
          '<li class="x-notify__item' + (spec.unread ? ' is-unread' : '') + '"' +
          ' data-x-notify-item="' + escapeHtml(meta.name || '') + '">' +
          '<span class="x-notify__dot"></span>' +
          '<div class="x-notify__body">' +
          '<div class="x-notify__itemhead">' +
          '<span class="x-notify__itemtitle">' + escapeHtml(title) + '</span>' +
          '<span class="x-notify__time">' + escapeHtml(time) + '</span>' +
          '</div>' +
          (body ? '<p class="x-notify__text">' + escapeHtml(body) + '</p>' : '') +
          '</div>' +
          '</li>'
        );
      })
      .join('');
    list.hidden = false;

    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }
  }

  function loadNotify(panel, silent) {
    var user = panel.getAttribute('data-x-notify-user');
    if (!user || user === 'anonymousUser') return;
    if (!silent) setNotifyStatus(panel, '正在加载…');

    fetch(notifyApi(user, '?page=0&size=20'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        renderNotifyList(panel, (data && data.items) || []);
      })
      .catch(function () {
        /* 拉不到就安静地隐藏，不在页面上留下一个坏入口 */
        setNotifyStatus(panel, '通知暂时不可用');
        var badge = $('[data-x-notify-badge]', document);
        if (badge) badge.hidden = true;
      });
  }

  function markNotifyRead(panel, name) {
    var user = panel.getAttribute('data-x-notify-user');
    if (!user || !name) return;
    fetch(notifyApi(user, '/' + encodeURIComponent(name) + '/mark-as-read'), {
      method: 'PUT',
      credentials: 'same-origin'
    }).catch(function () {});
  }

  function markNotifyAllRead(panel) {
    var user = panel.getAttribute('data-x-notify-user');
    var names = $$('[data-x-notify-item]', panel)
      .filter(function (el) { return el.classList.contains('is-unread'); })
      .map(function (el) { return el.getAttribute('data-x-notify-item'); });
    if (!user || !names.length) return;

    fetch(notifyApi(user, '/-/mark-specified-as-read'), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: names })
    })
      .then(function () {
        $$('[data-x-notify-item]', panel).forEach(function (el) {
          el.classList.remove('is-unread');
        });
        var badge = $('[data-x-notify-badge]', document);
        if (badge) badge.hidden = true;
      })
      .catch(function () {});
  }

  function toggleNotify(btn) {
    var li = btn.closest('.x-nav__notify');
    var panel = li ? $('[data-x-notify]', li) : null;
    if (!panel) return;

    if (notifyEl === panel) {
      closeNotify();
      return;
    }
    closeNotify();
    closeNavMore();
    closeAccountMenu();
    panel.hidden = false;
    notifyEl = panel;
    loadNotify(panel, true);
    setTimeout(function () {
      document.addEventListener('click', onDocClickNotify, true);
    }, 0);
  }

  /* 进页面就静默拉一次，只为了把未读徽标显示出来 */
  function initNotifications() {
    var panel = $('[data-x-notify]');
    if (!panel) return;
    var user = panel.getAttribute('data-x-notify-user');
    if (!user || user === 'anonymousUser') return;
    loadNotify(panel, true);
  }

  /* ------------------------------------------------------------------
   * 6. 分享
   * ------------------------------------------------------------------ */
  function shareLink(btn) {
    var href = btn.getAttribute('data-href') || location.href;
    var url = href.indexOf('http') === 0 ? href : location.origin + href;
    if (navigator.share) {
      navigator
        .share({ title: document.title, url: url })
        .catch(function () {});
      return;
    }
    copyText(url).then(
      function () {
        toast('链接已复制');
      },
      function () {
        toast('复制失败');
      }
    );
  }

  /* ------------------------------------------------------------------
   * 7. 首页 Tabs
   * ------------------------------------------------------------------ */
  function initTabs() {
    var timeline = $('[data-x-timeline]');
    var tabs = $$('[data-x-tab]');
    if (!timeline || !tabs.length) return;

    var emptyPinned = $('.x-empty--pinned');

    function render(mode) {
      var items = $$('.x-post', timeline);
      var visible = 0;
      items.forEach(function (item) {
        var pinned = item.getAttribute('data-pinned') === 'true';
        var show = mode === 'all' || pinned;
        item.hidden = !show;
        if (show) visible++;
      });
      if (emptyPinned) emptyPinned.hidden = !(mode === 'pinned' && visible === 0);
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var mode = tab.getAttribute('data-x-tab');
        tabs.forEach(function (t) {
          t.classList.toggle('is-active', t === tab);
        });
        render(mode);
      });
    });
  }

  /* ------------------------------------------------------------------
   * 8. 搜索页
   * ------------------------------------------------------------------ */
  function searchCard(hit) {
    var title = hit.title || hit.metadataName || '无标题';
    var desc = (hit.description || hit.content || '').slice(0, 200);
    var tags = (hit.tags || []).slice(0, 3);
    return (
      '<article class="x-post" data-href="' + escapeHtml(hit.permalink) + '">' +
      '<span class="x-post__avatar"><span class="x-avatar x-avatar--40 x-avatar--fallback">' +
      escapeHtml((title || 'X').charAt(0)) +
      '</span></span>' +
      '<div class="x-post__body">' +
      '<header class="x-post__head">' +
      '<span class="x-post__name"><span>搜索结果</span></span>' +
      '<span class="x-post__handle">@' + escapeHtml(hit.ownerName || 'blog') + '</span>' +
      '</header>' +
      '<div class="x-post__content">' +
      '<a class="x-post__title-link" href="' + escapeHtml(hit.permalink) + '">' +
      '<h3 class="x-post__title">' + title + '</h3>' +
      '</a>' +
      (desc ? '<p class="x-post__excerpt">' + escapeHtml(desc) + '</p>' : '') +
      (tags.length
        ? '<div class="x-post__topics">' +
          tags
            .map(function (t) {
              return '<span class="x-post__topic">#' + escapeHtml(t) + '</span>';
            })
            .join('') +
          '</div>'
        : '') +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function initSearch() {
    var form = $('#x-search-form');
    var input = $('#x-search-input');
    var results = $('#x-search-results');
    if (!form || !input || !results) return;

    var status = $('#x-search-status');
    var hint = $('#x-search-hint');
    var empty = $('#x-search-empty');
    var errorBox = $('#x-search-error');

    function reset() {
      if (hint) hint.hidden = false;
      if (empty) empty.hidden = true;
      if (errorBox) errorBox.hidden = true;
      if (status) status.hidden = true;
      results.innerHTML = '';
    }

    function run(keyword) {
      if (!keyword) {
        reset();
        return;
      }
      if (hint) hint.hidden = true;
      if (empty) empty.hidden = true;
      if (errorBox) errorBox.hidden = true;
      if (status) {
        status.hidden = false;
        status.textContent = '正在搜索「' + keyword + '」…';
      }
      results.innerHTML = '';

      fetch('/apis/api.halo.run/v1alpha1/indices/-/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword,
          limit: 30,
          highlightPreTag: '<mark>',
          highlightPostTag: '</mark>'
        })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('search failed');
          return res.json();
        })
        .then(function (data) {
          var hits = (data && data.hits) || [];
          if (!hits.length) {
            if (status) status.hidden = true;
            if (empty) empty.hidden = false;
            return;
          }
          results.innerHTML = hits.map(searchCard).join('');
          results.setAttribute('data-x-timeline', '');
          if (status) {
            status.hidden = false;
            status.textContent = '找到 ' + hits.length + ' 条结果';
          }
        })
        .catch(function () {
          if (status) status.hidden = true;
          if (errorBox) errorBox.hidden = false;
        });
    }

    var initial = new URLSearchParams(location.search).get('keyword') || '';
    if (initial) input.value = initial;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var keyword = input.value.trim();
      var url = new URL(location.href);
      if (keyword) url.searchParams.set('keyword', keyword);
      else url.searchParams.delete('keyword');
      history.replaceState(null, '', url.toString());
      run(keyword);
    });

    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        run(input.value.trim());
      }, 300);
    });

    if (initial) run(initial);
    else reset();
  }

  /* ------------------------------------------------------------------
   * 9. 全局事件委托
   * ------------------------------------------------------------------ */
  function initActions() {
    document.addEventListener('click', function (e) {
      /* 账号菜单：点按钮开合，点心外部由 document 上的捕获监听关掉 */
      var menuBtn = e.target.closest('[data-x-action="account-menu"]');
      if (menuBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleAccountMenu(menuBtn);
        return;
      }

      /* 先处理弹层的开与关，避免被下面的按钮逻辑抢走 */
      var opener = e.target.closest('[data-x-modal-open]');
      if (opener) {
        e.preventDefault();
        openModal(opener.getAttribute('data-x-modal-open'));
        return;
      }
      var closer = e.target.closest('[data-x-modal-close]');
      if (closer) {
        e.preventDefault();
        closeModal();
        return;
      }

      var actionEl = e.target.closest('[data-x-action]');
      if (actionEl) {
        var action = actionEl.getAttribute('data-x-action');
        if (action === 'theme') {
          e.preventDefault();
          /* 缓存里的旧页面可能还留着按钮，这里再兜一层 */
          if (root.getAttribute('data-allow-switch') !== 'true') {
            toast('全站配色由站点设置统一决定');
            return;
          }
          if (themeMenu) closeThemeMenu();
          else openThemeMenu(actionEl);
          return;
        }
        if (action === 'like' || action === 'moment-like') {
          e.preventDefault();
          e.stopPropagation();
          toggleLike(actionEl);
          return;
        }
        if (action === 'copy') {
          e.preventDefault();
          e.stopPropagation();
          var href = actionEl.getAttribute('data-href') || location.href;
          copyText(href.indexOf('http') === 0 ? href : location.origin + href).then(
            function () {
              toast('链接已复制');
            },
            function () {
              toast('复制失败');
            }
          );
          return;
        }
        if (action === 'share') {
          e.preventDefault();
          e.stopPropagation();
          shareLink(actionEl);
          return;
        }
        if (action === 'bookmark') {
          e.preventDefault();
          e.stopPropagation();
          toggleBookmark(actionEl);
          return;
        }
        if (action === 'back') {
          if (document.referrer && document.referrer.indexOf(location.origin) === 0) {
            e.preventDefault();
            history.back();
          }
          return;
        }
        if (action === 'top') {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (action === 'notify-toggle') {
          e.preventDefault();
          e.stopPropagation();
          toggleNotify(actionEl);
          return;
        }
        if (action === 'notify-read-all') {
          e.preventDefault();
          e.stopPropagation();
          var panel = actionEl.closest('[data-x-notify]');
          if (panel) markNotifyAllRead(panel);
          return;
        }
        if (action === 'nav-more') {
          e.preventDefault();
          e.stopPropagation();
          var navMore = actionEl.parentElement.querySelector('[data-x-nav-more]');
          if (navMore) {
            var willOpen = navMore.hidden;
            closeNavMore();
            if (willOpen) {
              navMore.hidden = false;
              navMoreEl = navMore;
              setTimeout(function () {
                document.addEventListener('click', onDocClickNavMore, true);
              }, 0);
            }
          }
          return;
        }
        if (action === 'more' || action === 'account') {
          e.preventDefault();
          toast('更多入口可以放到站点导航里');
          return;
        }
      }

      /* 点击卡片空白处进入详情（与 X 一致） */
      /* 点通知条目：标记已读并去掉未读样式 */
      var notifyItem = e.target.closest('[data-x-notify-item]');
      if (notifyItem && notifyEl) {
        var itemName = notifyItem.getAttribute('data-x-notify-item');
        if (notifyItem.classList.contains('is-unread')) {
          notifyItem.classList.remove('is-unread');
          markNotifyRead(notifyEl, itemName);
          var badgeEl = $('[data-x-notify-badge]', document);
          if (badgeEl) {
            var left = $$('[data-x-notify-item].is-unread', notifyEl).length;
            if (left > 0) badgeEl.textContent = left > 99 ? '99+' : String(left);
            else badgeEl.hidden = true;
          }
        }
        return;
      }

      var post = e.target.closest('.x-post[data-href]');
      if (post && !e.target.closest('a, button, input')) {
        location.href = post.getAttribute('data-href');
      }
    });
  }

  /* ------------------------------------------------------------------
   * 10. 导航高亮
   * 页面布局契约只允许 html(head, content) 两个参数，无法把「当前栏目」
   * 传进布局，因此在客户端按路径判定。
   * ------------------------------------------------------------------ */
  function initNavActive() {
    var path = location.pathname;
    if (path.length > 1) path = path.replace(/\/+$/, '');
    if (path === '' || path === '/index.html') path = '/';

    var best = null;
    var bestLength = -1;

    $$('.x-nav__item[href], .x-tabbar__item[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.indexOf('javascript:') === 0) return;
      var target = href.replace(/\/+$/, '') || '/';
      var matched =
        target === '/' ? path === '/' : path === target || path.indexOf(target + '/') === 0;
      if (matched && target.length > bestLength) {
        bestLength = target.length;
        best = a;
      }
    });

    if (best) best.classList.add('is-active');
  }

  /* ------------------------------------------------------------------
   * 11. 弹层：发瞬间 / 编辑个人资料
   * ------------------------------------------------------------------ */

  /* Halo 的 CSRF 只保护表单端点，/apis/** 在豁免名单里
     （CsrfConfigurer 里 NegatedServerWebExchangeMatcher 明确排除了 /api/** 和 /apis/**），
     所以这里带会话 cookie 直接请求即可，不需要任何令牌，也不该去读那个 HttpOnly 的 XSRF-TOKEN。 */
  var MOMENT_API = '/apis/uc.api.moment.halo.run/v1alpha1/moments';
  var PROFILE_API = '/apis/uc.api.halo.run/v1alpha1/users/-';
  var AVATAR_API = '/apis/uc.api.halo.run/v1alpha1/users/-/avatar';

  function apiErrorText(res) {
    return res
      .text()
      .then(function (text) {
        var message = '';
        try {
          var body = JSON.parse(text);
          message = body.detail || body.title || body.message || '';
        } catch (err) {
          message = String(text || '').slice(0, 160);
        }
        var error = new Error(message || 'HTTP ' + res.status);
        error.status = res.status;
        throw error;
      });
  }

  function haloApi(path, options) {
    options = options || {};
    var opt = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {},
      cache: 'no-store'
    };
    if (options.body !== undefined) {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        opt.body = options.body;
      } else {
        opt.headers['Content-Type'] = 'application/json';
        opt.body = JSON.stringify(options.body);
      }
    }
    return fetch(path, opt).then(function (res) {
      if (res.status === 401 || res.status === 302 || res.status === 0) {
        throw new Error('登录状态已失效，请刷新页面后重新登录');
      }
      if (!res.ok) return apiErrorText(res);
      var type = res.headers.get('Content-Type') || '';
      return type.indexOf('json') >= 0 ? res.json() : res.text();
    });
  }

  /* 弹层开关 —— 同一时刻只允许开一个 */
  var activeModal = null;
  var lastFocused = null;

  function xModalEl(name) {
    return document.querySelector('[data-x-modal="' + name + '"]');
  }

  function closeModal() {
    if (!activeModal) return;
    activeModal.hidden = true;
    activeModal = null;
    document.body.classList.remove('x-has-modal');
    if (lastFocused && lastFocused.focus) {
      try {
        lastFocused.focus();
      } catch (e) {}
    }
    lastFocused = null;
  }

  function openModal(name) {
    var el = xModalEl(name);
    if (!el) return null;
    if (activeModal === el) return el;
    closeModal();
    lastFocused = document.activeElement;
    el.hidden = false;
    document.body.classList.add('x-has-modal');
    activeModal = el;
    var focusable = $('textarea, input:not([type="hidden"]):not([disabled])', el);
    if (focusable) {
      setTimeout(function () {
        focusable.focus();
        if (focusable.setSelectionRange) {
          focusable.setSelectionRange(focusable.value.length, focusable.value.length);
        }
      }, 40);
    }
    return el;
  }

  function setHint(el, message, isError) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
  }

  function initModalKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAccountMenu();
        closeNotify();
      }
      if (e.key !== 'Escape' || !activeModal) return;
      /* 编辑资料时 Esc 默认先关弹层，避免误丢内容 */
      e.preventDefault();
      closeModal();
    });
  }

  /* 纯文本 → HTML：先把尖括号转义，再按空行分段，段内换行转 <br>。
     瞬间插件不会替我们做这次转换，所以必须客户端生成 html。 */
  function plainToHtml(text) {
    return String(text)
      .split(/\n{2,}/)
      .map(function (block) {
        return '<p>' + escapeHtml(block.trim()).replace(/\n/g, '<br>') + '</p>';
      })
      .join('');
  }

  function randomToken(length) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    for (var i = 0; i < length; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  /* --- 发瞬间 --- */
  function initCompose() {
    var modal = xModalEl('compose');
    if (!modal) return;

    var input = $('[data-x-compose-input]', modal);
    var submit = $('[data-x-compose-submit]', modal);
    var counter = $('[data-x-compose-count]', modal);
    var status = $('[data-x-compose-status]', modal);
    if (!input || !submit) return;

    var MAX = 2000;

    function refresh() {
      var length = input.value.length;
      if (counter) counter.textContent = length ? length + ' / ' + MAX : '';
      submit.disabled = !input.value.trim() || length > MAX;
    }

    input.addEventListener('input', refresh);
    refresh();

    input.addEventListener('keydown', function (e) {
      /* Cmd/Ctrl + Enter 直接发布，和 X 一致 */
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submit.click();
      }
    });

    submit.addEventListener('click', function () {
      var text = input.value.trim();
      if (!text) return;

      submit.disabled = true;
      setHint(status, '正在发布…');

      haloApi(MOMENT_API, {
        method: 'POST',
        body: {
          apiVersion: 'moment.halo.run/v1alpha1',
          kind: 'Moment',
          metadata: { name: 'moment-' + randomToken(8) },
          spec: {
            content: { raw: text, html: plainToHtml(text), medium: [] },
            visible: 'PUBLIC',
            tags: []
          }
        }
      })
        .then(function () {
          input.value = '';
          refresh();
          setHint(status, '');
          closeModal();
          toast('已发布，正在刷新…');
          setTimeout(function () {
            location.reload();
          }, 500);
        })
        .catch(function (err) {
          submit.disabled = false;
          setHint(
            status,
            '发布失败：' + err.message + '（若提示需要审核，说明当前账号没有直接发布权限）',
            true
          );
        });
    });
  }

  /* --- 编辑个人资料 --- */
  /* halo-plugin-X 提供的扩展资料。拿不到就整块不显示 —— 主题不依赖这个插件。 */
  var PLUGINX_API = '/apis/x.api.halo.run/v1alpha1/my-profile';

  function fillPluginX(modal, profile) {
    var box = $('[data-x-plugin-x]', modal);
    if (!box) return;
    box.hidden = false;
    [['[data-x-profile-cover]', profile.cover],
     ['[data-x-profile-location]', profile.location],
     ['[data-x-profile-website]', profile.website]].forEach(function (pair) {
      var el = $(pair[0], modal);
      if (el) el.value = pair[1] || '';
    });
  }

  function savePluginX(modal) {
    var cover = $('[data-x-profile-cover]', modal);
    var location = $('[data-x-profile-location]', modal);
    var website = $('[data-x-profile-website]', modal);
    /* 空字符串在插件侧表示「删除该字段」，语义正确，直接透传 */
    return haloApi(PLUGINX_API, {
      method: 'PUT',
      body: {
        cover: cover ? cover.value.trim() : null,
        location: location ? location.value.trim() : null,
        website: website ? website.value.trim() : null
      }
    });
  }

  function initProfileEdit() {
    var modal = xModalEl('profile');
    if (!modal) return;

    var nameInput = $('[data-x-profile-name]', modal);
    var bioInput = $('[data-x-profile-bio]', modal);
    var saveBtn = $('[data-x-profile-save]', modal);
    var hint = $('[data-x-profile-hint]', modal);
    var fileInput = $('[data-x-avatar-input]', modal);
    var avatarBox = $('[data-x-avatar-box]', modal);
    if (!nameInput || !saveBtn) return;

    /* 探测 halo-plugin-X：装了就显示扩展字段，没装就保持隐藏 */
    var pluginXOk = false;
    haloApi(PLUGINX_API, { method: 'GET' })
      .then(function (profile) {
        pluginXOk = true;
        fillPluginX(modal, profile || {});
      })
      .catch(function () {
        pluginXOk = false;
        var box = $('[data-x-plugin-x]', modal);
        if (box) box.hidden = true;
      });

    if (fileInput && avatarBox) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;

        /* 本地立刻预览，避免等网络往返 */
        if (file.type.indexOf('image/') !== 0) {
          setHint(hint, '请选择图片文件', true);
          fileInput.value = '';
          return;
        }
        try {
          var reader = new FileReader();
          reader.onload = function () {
            avatarBox.innerHTML =
              '<img class="x-avatar x-avatar--96" alt="头像预览" src="' + reader.result + '" />';
          };
          reader.readAsDataURL(file);
        } catch (e) {}

        var form = new FormData();
        form.append('file', file);
        setHint(hint, '正在上传头像…');
        haloApi(AVATAR_API, { method: 'POST', body: form })
          .then(function () {
            setHint(hint, '头像已更新');
          })
          .catch(function (err) {
            setHint(hint, '头像上传失败：' + err.message, true);
          });
      });
    }

    saveBtn.addEventListener('click', function () {
      var displayName = (nameInput.value || '').trim();
      if (!displayName) {
        setHint(hint, '名称不能为空', true);
        nameInput.focus();
        return;
      }

      saveBtn.disabled = true;
      setHint(hint, '正在保存…');

      haloApi(PROFILE_API, {
        method: 'PUT',
        body: { displayName: displayName, bio: (bioInput && bioInput.value ? bioInput.value : '').trim() }
      })
        .then(function () {
          /* 扩展资料是插件的独立接口，失败了也不该拦住显示名/简介的保存 */
          if (!pluginXOk) return null;
          return savePluginX(modal).catch(function () {
            toast('显示名和简介已保存，扩展资料没能写入');
            return null;
          });
        })
        .then(function () {
          setHint(hint, '');
          closeModal();
          toast('资料已更新，正在刷新…');
          setTimeout(function () {
            location.reload();
          }, 500);
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          setHint(hint, '保存失败：' + err.message, true);
        });
    });
  }

  /* ------------------------------------------------------------------
   * 12. 图片载入淡入
   * 已经加载完（缓存命中）的直接跳过，避免二次闪烁
   * ------------------------------------------------------------------ */
  function initImageFade() {
    $$('img').forEach(function (img) {
      if (img.complete) return;
      img.classList.add('x-img--pending');
      function done() {
        img.classList.remove('x-img--pending');
      }
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
  }

  /* ------------------------------------------------------------------
   * 13. 启动
   * ------------------------------------------------------------------ */
  function boot() {
    initNavActive();
    initTimes();
    initReading();
    restoreLikes();
    initTabs();
    initSearch();
    initActions();
    initAuthorTopics();
    initNotifications();
    reportView();
    initModalKeys();
    initCompose();
    initProfileEdit();
    initImageFade();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
