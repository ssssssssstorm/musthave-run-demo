// Channel subscription gate: getChatMember + fail-open if the bot is not a channel admin.
'use strict';

const { CHANNEL, SUB_CACHE_MS, isAdminUsername } = require('./meta');
const tgBot = require('./telegram-bot');

const BOT_NOT_ADMIN_RE = /member list is inaccessible|chat not found|bot is not a (member|administrator)|need administrator|not enough rights|PEER_ID_INVALID|chat_id is empty/i;

function membershipPasses(result) {
  if (!result) return false;
  const st = result.status;
  if (st === 'member' || st === 'administrator' || st === 'creator') return true;
  if (st === 'restricted' && result.is_member) return true;
  return false;
}

function isBotNotAdminError(desc) {
  return BOT_NOT_ADMIN_RE.test(String(desc || ''));
}

function createGate(pool, meta) {
  let botAdmin = { t: 0, ok: false, err: '', checked: false };

  async function refreshBotAdmin() {
    const now = Date.now();
    if (botAdmin.checked && now - botAdmin.t < 120000) return botAdmin;
    const me = await tgBot.getMe();
    const botId = me && me.ok && me.result && me.result.id;
    if (!botId) {
      botAdmin = { t: now, ok: false, err: 'getMe failed', checked: true };
      console.log('[gate] bot admin check failed: getMe');
      return botAdmin;
    }
    const r = await tgBot.getChatMember(CHANNEL.chatId, botId);
    if (!r.ok) {
      const err = r.description || 'getChatMember failed';
      botAdmin = { t: now, ok: false, err: err, checked: true };
      console.log('[gate] bot not admin:', String(err).slice(0, 120));
      return botAdmin;
    }
    const st = r.result && r.result.status;
    const ok = st === 'administrator' || st === 'creator';
    botAdmin = { t: now, ok: ok, err: ok ? '' : ('bot status ' + st), checked: true };
    if (!ok) console.log('[gate] bot not admin: status=' + st);
    return botAdmin;
  }

  async function gateEnabled() {
    const v = await meta.getSetting('gate_enabled', 'true');
    return v === 'true' || v === '1' || v === 'on';
  }

  async function gateStatus() {
    const enabled = await gateEnabled();
    const ba = await refreshBotAdmin();
    let flag = '';
    if (enabled && !ba.ok) flag = 'gate not active: bot not admin';
    return {
      enabled,
      active: enabled && ba.ok,
      botAdmin: ba.ok,
      botAdminError: ba.err || '',
      flag,
      channel: CHANNEL.username,
      channelUrl: CHANNEL.url,
    };
  }

  async function checkUser(user, opts) {
    opts = opts || {};
    const force = !!opts.force;
    const gst = await gateStatus();
    const bypassVip = await meta.isVipUser(user);
    const bypassAdmin = isAdminUsername(user && user.username);
    if (bypassVip || bypassAdmin) {
      return {
        ok: true, required: false, subscribed: true, open: true,
        bypass: bypassAdmin ? 'admin' : 'vip',
        gate: gst,
      };
    }
    if (!gst.enabled) {
      return { ok: true, required: false, subscribed: true, open: true, gate: gst };
    }
    if (!gst.botAdmin) {
      // Fail OPEN: let people play, surface the admin flag.
      return {
        ok: true, required: true, subscribed: true, open: true,
        inactive: true, reason: 'bot_not_admin',
        flag: gst.flag, gate: gst,
      };
    }

    const db = opts.client || pool;
    // Cached pass
    if (!force && user && user.id) {
      try {
        const row = await db.query(
          'SELECT sub_status, sub_checked_at FROM players WHERE tg_id = $1',
          [user.id]
        );
        if (row.rows[0] && row.rows[0].sub_status === 'ok' && row.rows[0].sub_checked_at) {
          const age = Date.now() - new Date(row.rows[0].sub_checked_at).getTime();
          if (age >= 0 && age < SUB_CACHE_MS) {
            return { ok: true, required: true, subscribed: true, open: true, cached: true, gate: gst };
          }
        }
      } catch (_) {}
    }

    const r = await tgBot.getChatMember(CHANNEL.chatId, user.id);
    if (!r.ok) {
      if (isBotNotAdminError(r.description)) {
        botAdmin = { t: Date.now(), ok: false, err: r.description || 'inaccessible', checked: true };
        console.log('[gate] getChatMember failed, fail-open:', String(r.description).slice(0, 120));
        return {
          ok: true, required: true, subscribed: true, open: true,
          inactive: true, reason: 'bot_not_admin',
          flag: 'gate not active: bot not admin',
          gate: await gateStatus(),
        };
      }
      console.log('[gate] getChatMember error', String(r.description || '').slice(0, 120));
      // Transient error: do not lock the player out of the menu, but do not claim subscribed.
      return {
        ok: false, required: true, subscribed: false, open: true,
        error: 'check_failed', gate: gst,
      };
    }
    const subscribed = membershipPasses(r.result);
    try {
      await db.query(
        `UPDATE players SET sub_status = $2, sub_checked_at = now(), updated_at = now() WHERE tg_id = $1`,
        [user.id, subscribed ? 'ok' : 'no']
      );
    } catch (_) {}
    return {
      ok: true, required: true, subscribed, open: subscribed,
      status: r.result && r.result.status,
      gate: gst,
    };
  }

  // For /api/score: reject only when the gate is truly active and the user is not subscribed.
  async function assertSubscribedOrThrow(user) {
    const r = await checkUser(user, { force: false });
    if (r.bypass || !r.required || r.inactive || r.subscribed || r.open && !r.required) return r;
    if (r.gate && r.gate.active && !r.subscribed) {
      const err = new Error('not_subscribed');
      err.status = 403;
      err.payload = { ok: false, error: 'not_subscribed', channel: CHANNEL.username };
      throw err;
    }
    return r;
  }

  return { gateEnabled, gateStatus, checkUser, assertSubscribedOrThrow, refreshBotAdmin };
}

module.exports = { createGate, membershipPasses, isBotNotAdminError, CHANNEL };
