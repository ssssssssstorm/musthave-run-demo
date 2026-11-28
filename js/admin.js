(function () {
  'use strict';

  const TOKEN_KEY = 'mh_admin_token_v1';
  const DEFAULTS = [
    'https://musthave-run-api.netlify.app',
    'https://musthave-run-api.onrender.com'
  ];

  function resolveBases() {
    const q = new URLSearchParams(location.search).get('api');
    if (q && /^https?:\/\//.test(q)) return [q.replace(/\/+$/, '')];
    try {
      if (location.pathname.indexOf('/admin') !== -1 && /onrender\.com|localhost|127\.0\.0\.1/.test(location.hostname)) {
        return [location.origin];
      }
    } catch (_) {}
    return DEFAULTS.slice();
  }

  let bases = resolveBases();
  let token = '';
  try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) {}
  let actor = '';
  let seasonsCache = [];
  let mailConfirm = '';
  let mailText = '';
  let mailTimer = 0;

  function headers(json) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = 'Bearer ' + token;
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.initData && tg.initData.length > 20) h['X-Telegram-Init-Data'] = tg.initData;
    } catch (_) {}
    return h;
  }

  function fetchOne(base, path, opts, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 20000) : 0;
    const o = Object.assign({}, opts || {}, ctl ? { signal: ctl.signal } : {});
    return fetch(base + path, o).then(function (res) {
      const ct = res.headers.get('content-type') || '';
      if (ct.indexOf('text/csv') !== -1) {
        return res.text().then(function (text) {
          return { status: res.status, csv: text, data: { ok: res.status === 200 } };
        });
      }
      return res.json().then(function (data) {
        return { status: res.status, data: data || {} };
      }).catch(function () { return { status: res.status, data: {} }; });
    }).then(function (out) {
      if (timer) clearTimeout(timer);
      return out;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function api(path, opts) {
    let last = null;
    let i = 0;
    function next() {
      if (i >= bases.length) {
        if (last && typeof last.status === 'number') return last;
        throw last || new Error('no_api');
      }
      const base = bases[i++];
      return fetchOne(base, path, opts, i < bases.length ? 8000 : 25000).then(function (res) {
        if (res.status >= 500 && i < bases.length) { last = res; return next(); }
        bases = [base].concat(bases.filter(function (b) { return b !== base; }));
        return res;
      }, function (err) { last = err; return next(); });
    }
    return next();
  }

  function get(path) { return api(path, { headers: headers(false) }); }
  function post(path, body) {
    return api(path, { method: 'POST', headers: headers(true), body: JSON.stringify(body || {}) });
  }

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    // Display Europe/Moscow (UTC+3) by adding 3h to UTC parts when host is UTC, else use local (box is already Moscow).
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function nameOf(p) {
    if (p.username) return '@' + p.username;
    return p.name || p.firstName || ('id ' + (p.id || ''));
  }

  function setTab(id) {
    const tabs = document.querySelectorAll('.tab');
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === id);
    }
    const sections = ['dash', 'board', 'players', 'seasons', 'cheat', 'mail', 'settings'];
    for (let i = 0; i < sections.length; i++) {
      const el = $('tab-' + sections[i]);
      if (el) el.classList.toggle('hidden', sections[i] !== id);
    }
    if (id === 'dash') loadDash();
    if (id === 'board') loadBoard();
    if (id === 'players') loadPlayers();
    if (id === 'seasons') loadSeasons();
    if (id === 'cheat') loadCheat();
    if (id === 'settings') loadSettings();
  }

  function loggedIn(info) {
    show($('login'), false);
    show($('app'), true);
    $('whoami').textContent = 'Вы: ' + (info.actor || actor || 'admin');
    setTab('dash');
  }

  function loginErr(msg) {
    const el = $('login-err');
    el.textContent = msg;
    show(el, true);
  }

  function saveToken(t, who) {
    token = t;
    actor = who || 'admin';
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch (_) {}
  }

  function logout() {
    token = '';
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
    show($('app'), false);
    show($('login'), true);
  }

  function tryTgInit() {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && typeof tg.ready === 'function') tg.ready();
    } catch (_) {}
  }

  function loginPassword() {
    const pw = $('login-pass').value;
    loginErr('');
    post('/api/admin/auth', { password: pw }).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok && r.data.token) {
        saveToken(r.data.token, r.data.actor);
        loggedIn(r.data);
      } else if (r.data && r.data.error === 'password_not_configured') {
        loginErr('Пароль на сервере ещё не задан. Добавь ADMIN_PASSWORD в Render.');
      } else {
        loginErr('Неверный пароль.');
      }
    }).catch(function () { loginErr('Сеть. Попробуй ещё раз.'); });
  }

  function loginTelegram() {
    loginErr('');
    tryTgInit();
    const tg = window.Telegram && window.Telegram.WebApp;
    const initData = tg && tg.initData;
    if (!initData) {
      loginErr('Открой админку через Telegram-бот (мини-приложение) или войди по паролю.');
      return;
    }
    post('/api/admin/auth', { initData: initData }).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok && r.data.token) {
        saveToken(r.data.token, r.data.actor);
        loggedIn(r.data);
      } else {
        loginErr('Этот Telegram-аккаунт не в списке админов.');
      }
    }).catch(function () { loginErr('Сеть. Попробуй ещё раз.'); });
  }

  function autoLogin() {
    tryTgInit();
    if (token) {
      get('/api/admin/dashboard').then(function (r) {
        if (r.status === 200 && r.data && r.data.ok) loggedIn({ actor: 'session' });
        else logout();
      }).catch(function () {});
      return;
    }
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initData && tg.initData.length > 20) {
      loginTelegram();
    }
  }

  function statBox(lbl, val) {
    return '<div class="stat"><div class="stat-lbl">' + esc(lbl) + '</div><div class="stat-val">' + esc(val) + '</div></div>';
  }

  function drawBars(canvas, items, pick, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#20102F';
    ctx.fillRect(0, 0, w, h);
    if (!items || !items.length) return;
    let max = 1;
    for (let i = 0; i < items.length; i++) max = Math.max(max, pick(items[i]) || 0);
    const gap = 4;
    const barW = Math.max(6, Math.floor((w - 20 - gap * items.length) / items.length));
    for (let i = 0; i < items.length; i++) {
      const v = pick(items[i]) || 0;
      const bh = Math.round((h - 28) * (v / max));
      const x = 10 + i * (barW + gap);
      ctx.fillStyle = color;
      ctx.fillRect(x, h - 16 - bh, barW, bh);
      ctx.fillStyle = '#E8C4D6';
      ctx.font = '8px monospace';
      ctx.fillText(String(items[i].day || '').slice(8, 10), x, h - 4);
    }
  }

  function loadDash() {
    get('/api/admin/dashboard').then(function (r) {
      if (!(r.data && r.data.ok)) return;
      const s = r.data.stats || {};
      $('dash-stats').innerHTML = [
        statBox('Игроки', s.players),
        statBox('DAU', s.dau),
        statBox('Забеги сегодня', s.runs_today),
        statBox('Принято сегодня', s.accepted_today),
        statBox('Средний счёт', Math.round((s.avg_score || 0) * 10) / 10),
        statBox('Рекорд', s.best_score),
        statBox('Рефералы', s.referrals),
        statBox('Бан', s.banned)
      ].join('');
      const g = r.data.gate || {};
      const flag = $('gate-flag');
      if (g.flag || (g.enabled && !g.botAdmin)) {
        flag.textContent = g.flag || 'gate not active: bot not admin';
        flag.className = 'flag';
        show(flag, true);
      } else if (!g.enabled) {
        flag.textContent = 'Гейт подписки выключен';
        flag.className = 'flag';
        show(flag, true);
      } else {
        flag.textContent = 'Гейт активен • @' + (g.channel || 'musthavetobacco');
        flag.className = 'flag ok';
        show(flag, true);
      }
      drawBars($('chart-runs'), r.data.days, function (d) { return d.runs; }, '#FF4A8D');
      drawBars($('chart-score'), r.data.days, function (d) { return d.best; }, '#FFD100');
    });
    get('/api/admin/winners').then(function (r) {
      if (!(r.data && r.data.ok)) return;
      const box = $('winners');
      if (!r.data.winners.length) { box.innerHTML = '<p class="muted">Пока нет игроков в сезоне #' + esc(r.data.season) + '</p>'; return; }
      box.innerHTML = r.data.winners.map(function (w) {
        return '<div class="winner r' + w.rank + '"><span>#' + w.rank + ' ' + esc(nameOf(w)) + '</span><strong>' + esc(w.score) + '</strong></div>';
      }).join('');
    });
  }

  function fillSeasonSelect(sel, current) {
    if (!sel) return;
    const cur = current || (seasonsCache[0] && seasonsCache[0].id);
    sel.innerHTML = seasonsCache.map(function (s) {
      return '<option value="' + s.id + '"' + (String(s.id) === String(cur) ? ' selected' : '') + '>Сезон #' + s.id + (s.ended_at ? ' (архив)' : '') + '</option>';
    }).join('');
  }

  function loadSeasonsThen(cb) {
    get('/api/admin/seasons').then(function (r) {
      if (r.data && r.data.ok) {
        seasonsCache = r.data.seasons || [];
        if (cb) cb(r.data.current);
      }
    });
  }

  function loadBoard() {
    loadSeasonsThen(function (cur) {
      fillSeasonSelect($('board-season'), cur);
      const q = ($('board-q').value || '').trim();
      const season = $('board-season').value;
      get('/api/admin/leaderboard?limit=100&q=' + encodeURIComponent(q) + '&season=' + encodeURIComponent(season)).then(function (r) {
        const body = $('board-body');
        if (!(r.data && r.data.ok)) { body.innerHTML = ''; return; }
        body.innerHTML = r.data.top.map(function (row) {
          const cls = row.rank <= 3 ? 'top' + row.rank : '';
          const badges = (row.vip ? '<span class="badge vip">VIP</span>' : '') +
            (row.banned ? '<span class="badge ban">BAN</span>' : '') +
            (row.subscribed ? '<span class="badge sub">SUB</span>' : '');
          return '<tr class="clickable ' + cls + '" data-id="' + esc(row.id) + '"><td>' + row.rank + '</td><td>' +
            esc(nameOf(row)) + ' ' + badges + '</td><td>' + esc(row.score) + '</td><td>' + esc(row.runs) +
            '</td><td><button type="button" data-id="' + esc(row.id) + '">Карточка</button></td></tr>';
        }).join('') || '<tr><td colspan="5">Пусто</td></tr>';
      });
    });
  }

  function loadPlayers() {
    const q = ($('players-q').value || '').trim();
    get('/api/admin/players?limit=80&q=' + encodeURIComponent(q)).then(function (r) {
      const body = $('players-body');
      if (!(r.data && r.data.ok)) { body.innerHTML = ''; return; }
      $('players-total').textContent = 'Всего: ' + r.data.total;
      body.innerHTML = r.data.players.map(function (p) {
        const badges = (p.vip ? '<span class="badge vip">VIP</span>' : '') +
          (p.banned ? '<span class="badge ban">BAN</span>' : '') +
          (p.subStatus === 'ok' ? '<span class="badge sub">SUB</span>' : '');
        return '<tr class="clickable" data-id="' + esc(p.id) + '"><td>' + esc(p.id) + '</td><td>' +
          esc(nameOf(p)) + '</td><td>' + badges + '</td><td><button type="button" data-id="' + esc(p.id) + '">Открыть</button></td></tr>';
      }).join('');
    });
  }

  function openPlayer(id) {
    get('/api/admin/player/' + id).then(function (r) {
      if (!(r.data && r.data.ok)) return;
      const p = r.data.player;
      const el = $('player-card');
      const runs = (p.runs || []).map(function (x) {
        return '<tr><td>' + esc(fmtTime(x.created_at)) + '</td><td>' + esc(x.score) + '</td><td>' +
          (x.accepted ? 'ok' : esc(x.reject_reason || 'no')) + '</td></tr>';
      }).join('');
      el.innerHTML =
        '<h2>' + esc(nameOf(p)) + ' <span class="muted">#' + esc(p.id) + '</span></h2>' +
        '<p>' +
          (p.vip ? '<span class="badge vip">VIP</span>' : '') +
          (p.banned ? '<span class="badge ban">BAN</span>' : '') +
          (p.subStatus === 'ok' ? '<span class="badge sub">SUB</span>' : '<span class="badge no">NO SUB</span>') +
        '</p>' +
        '<p>Первый визит: ' + esc(fmtTime(p.firstSeen)) + '<br/>Подписка: ' + esc(p.subStatus || '—') +
        '<br/>Рефералов: ' + esc(p.invited) + (p.invitedBy ? ' • пригласил ' + esc(p.invitedBy) : '') +
        '<br/>Выдано жизней (всего грантов): ' + esc(p.grants) + '</p>' +
        '<div class="row">' +
          '<button type="button" data-act="ban" data-id="' + esc(p.id) + '">' + (p.banned ? 'Разбанить' : 'Забанить') + '</button>' +
          '<button type="button" data-act="vip" data-id="' + esc(p.id) + '" data-username="' + esc(p.username || '') + '">' + (p.vip ? 'Снять VIP' : 'Дать VIP') + '</button>' +
          '<button type="button" class="peach" data-act="lives" data-id="' + esc(p.id) + '">+1 жизнь</button>' +
          '<button type="button" class="bad" data-act="reset-lives" data-id="' + esc(p.id) + '">Сбросить жизни</button>' +
          '<button type="button" class="ghost" data-act="wipe" data-id="' + esc(p.id) + '">Удалить очки сезона</button>' +
          '<button type="button" class="bad" data-act="delete" data-id="' + esc(p.id) + '">Удалить игрока</button>' +
          '<button type="button" class="ghost" data-act="close">Закрыть</button>' +
        '</div>' +
        '<h3 class="pixel" style="font-size:9px;margin:14px 0 6px">Забеги</h3>' +
        '<div style="overflow:auto;max-height:240px"><table><thead><tr><th>Когда</th><th>Счёт</th><th></th></tr></thead><tbody>' +
        (runs || '<tr><td colspan="3">Нет забегов</td></tr>') + '</tbody></table></div>';
      show($('player-modal'), true);
    });
  }

  function playerAction(act, id, username) {
    if (act === 'close') { show($('player-modal'), false); return; }
    const body = { action: act };
    if (act === 'ban') {
      /* toggle decided by label — fetch? we pass unban if needed via data */
    }
    if (act === 'lives') body.action = 'lives', body.amount = 1;
    if (act === 'reset-lives') {
      if (!confirm('Сбросить дневные жизни этого игрока?')) return;
      body.action = 'reset-lives';
    }
    if (act === 'wipe') body.action = 'delete-score';
    if (act === 'delete') {
      if (!confirm('Удалить игрока и все его данные?')) return;
      body.action = 'delete-player';
    }
    if (act === 'vip') {
      body.action = 'vip';
      /* current state is in button text: "Снять VIP" means currently vip */
    }
    if (act === 'ban') {
      const btn = document.querySelector('#player-card button[data-act="ban"]');
      body.action = (btn && btn.textContent.indexOf('Разбан') !== -1) ? 'unban' : 'ban';
    }
    if (act === 'vip') {
      const btn = document.querySelector('#player-card button[data-act="vip"]');
      body.vip = !(btn && btn.textContent.indexOf('Снять') !== -1);
      body.username = username || '';
    }
    post('/api/admin/player/' + id, body).then(function (r) {
      if (r.data && r.data.ok) {
        if (act === 'delete') { show($('player-modal'), false); loadPlayers(); loadBoard(); }
        else openPlayer(id);
        loadDash();
      } else {
        alert((r.data && r.data.error) || 'Ошибка');
      }
    });
  }

  function loadSeasons() {
    get('/api/admin/seasons').then(function (r) {
      if (!(r.data && r.data.ok)) return;
      seasonsCache = r.data.seasons || [];
      $('seasons-list').innerHTML = seasonsCache.map(function (s) {
        const cur = String(s.id) === String(r.data.current) ? ' • текущий' : '';
        const end = s.ended_at ? (' — закрыт ' + fmtTime(s.ended_at)) : ' — открыт';
        return '<div class="winner"><span>#' + s.id + ' ' + esc(s.name || '') + cur + end +
          '</span><span>' + esc(s.players) + ' игроков, рекорд ' + esc(s.best) +
          ' <button type="button" data-season="' + s.id + '">Рейтинг</button></span></div>';
      }).join('') || '<p class="muted">Нет сезонов</p>';
      fillSeasonSelect($('export-season'), r.data.current);
    });
  }

  function prepareSeasonReset() {
    post('/api/admin/seasons/confirm', {}).then(function (r) {
      if (!(r.data && r.data.ok)) { alert('Не удалось подготовить сброс'); return; }
      $('btn-season-yes').setAttribute('data-confirm', r.data.confirm);
      show($('season-confirm'), true);
    });
  }
  function doSeasonReset() {
    const confirmTok = $('btn-season-yes').getAttribute('data-confirm');
    post('/api/admin/seasons/reset', { confirm: confirmTok }).then(function (r) {
      show($('season-confirm'), false);
      if (r.data && r.data.ok) { loadSeasons(); loadDash(); loadBoard(); }
      else alert((r.data && r.data.error) || 'Ошибка');
    });
  }

  function prepareFullReset() {
    $('full-reset-status').textContent = '';
    $('full-reset-phrase').value = '';
    post('/api/admin/test-reset/confirm', {}).then(function (r) {
      if (!(r.data && r.data.ok)) { alert('Не удалось подготовить сброс'); return; }
      $('btn-full-reset-yes').setAttribute('data-confirm', r.data.confirm);
      show($('full-reset-confirm'), true);
    });
  }
  function doFullReset() {
    const phrase = ($('full-reset-phrase').value || '').trim();
    if (phrase !== 'СБРОС') {
      $('full-reset-status').textContent = 'Введи СБРОС заглавными буквами.';
      return;
    }
    const confirmTok = $('btn-full-reset-yes').getAttribute('data-confirm');
    post('/api/admin/test-reset', { confirm: confirmTok, phrase: phrase }).then(function (r) {
      if (r.data && r.data.ok) {
        show($('full-reset-confirm'), false);
        $('full-reset-status').textContent = 'Готово: сезон #' + r.data.from + ' → #' + r.data.to + ', epoch ' + r.data.resetEpoch;
        loadSeasons();
        loadDash();
        loadBoard();
      } else {
        $('full-reset-status').textContent = (r.data && r.data.error) || 'Ошибка';
      }
    });
  }

  function loadCheat() {
    get('/api/admin/suspicious?limit=100').then(function (r) {
      const body = $('cheat-body');
      if (!(r.data && r.data.ok)) { body.innerHTML = ''; return; }
      body.innerHTML = r.data.runs.map(function (x) {
        return '<tr class="clickable" data-id="' + esc(x.tgId) + '"><td>' + esc(fmtTime(x.createdAt)) +
          '</td><td>' + esc(x.username ? '@' + x.username : (x.name || x.tgId)) +
          '</td><td>' + esc(x.score) + '</td><td>' + esc(x.reason) + '</td></tr>';
      }).join('') || '<tr><td colspan="4">Чисто</td></tr>';
    });
  }

  function loadSettings() {
    get('/api/admin/gate').then(function (r) {
      const g = r.data && r.data.gate || {};
      const lines = [
        'Канал: @' + (g.channel || 'musthavetobacco'),
        'Гейт в настройках: ' + (g.enabled ? 'вкл' : 'выкл'),
        'Бот — админ канала: ' + (g.botAdmin ? 'да' : 'нет'),
        g.flag ? ('Статус: ' + g.flag) : (g.active ? 'Статус: активен' : 'Статус: не активен')
      ];
      if (g.botAdminError && !g.botAdmin) lines.push('Ошибка: ' + g.botAdminError);
      $('gate-box').innerHTML = '<p>' + lines.map(esc).join('<br/>') + '</p>';
    });
    get('/api/admin/vips').then(function (r) {
      if (r.data && r.data.ok) $('vip-list').textContent = (r.data.usernames || []).join(', ');
    });
    loadSeasonsThen(function (cur) { fillSeasonSelect($('export-season'), cur); });
  }

  function setGate(on) {
    post('/api/admin/gate', { enabled: on }).then(function () { loadSettings(); loadDash(); });
  }

  function vipEdit(add) {
    const name = ($('vip-name').value || '').replace(/^@/, '').trim();
    if (!name) return;
    post('/api/admin/vips', { username: name, vip: add }).then(function () { loadSettings(); });
  }

  function exportCsv() {
    const season = $('export-season').value;
    get('/api/admin/export?season=' + encodeURIComponent(season)).then(function (r) {
      if (!r.csv) { alert('Не удалось скачать'); return; }
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'musthave-season-' + season + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function prepMail() {
    mailText = ($('mail-text').value || '').trim();
    if (!mailText) return;
    post('/api/admin/broadcast/prepare', { text: mailText }).then(function (r) {
      if (!(r.data && r.data.ok)) { $('mail-status').textContent = (r.data && r.data.error) || 'Ошибка'; return; }
      mailConfirm = r.data.confirm;
      $('mail-preview').textContent = 'Получателей: ' + r.data.recipients + '. Отправить это сообщение?';
      show($('mail-confirm'), true);
    });
  }
  function sendMail() {
    post('/api/admin/broadcast', { text: mailText, confirm: mailConfirm }).then(function (r) {
      show($('mail-confirm'), false);
      if (!(r.data && r.data.ok)) {
        $('mail-status').textContent = (r.data && r.data.error) || 'Ошибка (лимит 1 рассылка / 10 мин)';
        return;
      }
      $('mail-status').textContent = 'Отправка… 0/' + r.data.total;
      if (mailTimer) clearInterval(mailTimer);
      mailTimer = setInterval(function () {
        get('/api/admin/broadcast/status').then(function (s) {
          const j = s.data && s.data.job;
          if (!j) return;
          $('mail-status').textContent = (j.running ? 'Отправка… ' : 'Готово: ') + j.sent + '/' + j.total + ' (ошибок ' + j.failed + ')';
          if (!j.running && mailTimer) { clearInterval(mailTimer); mailTimer = 0; }
        });
      }, 1000);
    });
  }

  $('btn-login-pass').addEventListener('click', loginPassword);
  $('login-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') loginPassword(); });
  $('btn-login-tg').addEventListener('click', loginTelegram);
  $('btn-logout').addEventListener('click', logout);
  $('tabs').addEventListener('click', function (e) {
    const t = e.target.closest ? e.target.closest('.tab') : null;
    if (t) setTab(t.getAttribute('data-tab'));
  });
  $('btn-board').addEventListener('click', loadBoard);
  $('board-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadBoard(); });
  $('btn-players').addEventListener('click', loadPlayers);
  $('players-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadPlayers(); });
  $('board-body').addEventListener('click', function (e) {
    const id = e.target.getAttribute('data-id') || (e.target.closest && e.target.closest('[data-id]') && e.target.closest('[data-id]').getAttribute('data-id'));
    if (id) openPlayer(id);
  });
  $('players-body').addEventListener('click', function (e) {
    const id = e.target.getAttribute('data-id') || (e.target.closest && e.target.closest('[data-id]') && e.target.closest('[data-id]').getAttribute('data-id'));
    if (id) openPlayer(id);
  });
  $('cheat-body').addEventListener('click', function (e) {
    const id = e.target.getAttribute('data-id') || (e.target.closest && e.target.closest('[data-id]') && e.target.closest('[data-id]').getAttribute('data-id'));
    if (id) openPlayer(id);
  });
  $('player-card').addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('button[data-act]') : (e.target.getAttribute && e.target.getAttribute('data-act') ? e.target : null);
    if (!btn) return;
    playerAction(btn.getAttribute('data-act'), btn.getAttribute('data-id'), btn.getAttribute('data-username'));
  });
  $('player-modal').addEventListener('click', function (e) {
    if (e.target.id === 'player-modal') show($('player-modal'), false);
  });
  $('btn-season-reset').addEventListener('click', prepareSeasonReset);
  $('btn-season-no').addEventListener('click', function () { show($('season-confirm'), false); });
  $('btn-season-yes').addEventListener('click', doSeasonReset);
  $('btn-full-reset').addEventListener('click', prepareFullReset);
  $('btn-full-reset-no').addEventListener('click', function () {
    show($('full-reset-confirm'), false);
    $('full-reset-status').textContent = '';
  });
  $('btn-full-reset-yes').addEventListener('click', doFullReset);
  $('seasons-list').addEventListener('click', function (e) {
    const s = e.target.getAttribute('data-season');
    if (s) { $('board-season').value = s; setTab('board'); }
  });
  $('btn-gate-on').addEventListener('click', function () { setGate(true); });
  $('btn-gate-off').addEventListener('click', function () { setGate(false); });
  $('btn-vip-add').addEventListener('click', function () { vipEdit(true); });
  $('btn-vip-del').addEventListener('click', function () { vipEdit(false); });
  $('btn-export').addEventListener('click', exportCsv);
  $('btn-mail-prep').addEventListener('click', prepMail);
  $('btn-mail-cancel').addEventListener('click', function () { show($('mail-confirm'), false); });
  $('btn-mail-send').addEventListener('click', sendMail);

  get('/api/admin/auth/methods').then(function (r) {
    if (r.data && r.data.ok && !r.data.passwordEnabled) {
      $('login-hint').textContent = 'Пароль ещё не задан (ADMIN_PASSWORD). Админы ttvwraithh, pnkmnmr, musthave_pinkman могут войти через Telegram.';
    }
  }).catch(function () {});

  if (document.readyState === 'complete') autoLogin();
  else window.addEventListener('load', autoLogin);
})();
