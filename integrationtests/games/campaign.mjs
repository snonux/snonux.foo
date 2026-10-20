#!/usr/bin/env node
// Playability test for the theme games: plays each game's whole three-level
// campaign in real Chrome with that theme's own bot, by input only.
//
//   node integrationtests/games/campaign.mjs breakout            # one theme
//   node integrationtests/games/campaign.mjs                     # every theme
//   node integrationtests/games/campaign.mjs --touch breakout    # phone, landscape
//   node integrationtests/games/campaign.mjs --touch=portrait breakout
//   node integrationtests/games/campaign.mjs --seed=3 --shots=/tmp/shots breakout
//   node integrationtests/games/campaign.mjs --levels=3 breakout # focus on one level
//
// e2e.mjs is the smoke test of the engine flow (it forces wins with
// debug.win() where its random bot fails). This is the other half: a win
// only counts here when the game itself called G.win() while the bot was
// steering with ordinary buttons, mouse and taps.
//
// Each theme brings a bot as integrationtests/games/bots/<theme>.js: one
// expression (wrap it in parentheses) that evaluates to
//
//   ({
//     play: function (s, G, mem) { return { right: true, a: s.ball.y > 300 }; },
//     fail: function (s, G, mem) { return {}; },   // optional; default: idle
//     budget: 300                                   // optional; game seconds per level
//   })
//
// play() is called once per tick of play and returns that tick's input in the
// shape debug.step() takes ({left, right, up, down, a, b, codes, mouse}). It
// may read anything: `s` is the game's state and `G` the engine, both as
// read-only views (a write throws). `mem` is the bot's own scratch object; a
// fresh one comes with each level. fail() is the negative control: a poor or
// idle strategy that must lose level 1 naturally (no debug.lose()).
//
// A bot may not call G.win/die/loseLife/gameOver/addScore/addLife or any
// SnoGame.debug hook, nor change the world: the run fails if it tries.
//
// The run, per theme: fresh cookies, Math.random seeded (--seed), launch,
// start level 1 from the title by a real Enter (a tap with --touch), play;
// on LEVEL CLEAR a real Enter/tap moves on, on GAME OVER a real Enter/tap
// retries (at most --retries times per level); after level 3 the ending must
// appear, animate and hold, and LEVELS on it must lead to the title with the
// campaign saved, which must survive a reload. Then the negative control.
// Every level records ticks, game seconds, lives lost, retries and errors.
// A level that runs out of its budget, a stalled bot or a crash fails the
// theme; the exit status is nonzero when any theme fails.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sleep, startSession, themesWithGames, ROOT } from './lib.mjs';
import { PHONES } from './touch.mjs';

export const BOTS_DIR = join(ROOT, 'integrationtests', 'games', 'bots');
const LEVELS = 3;
const DEFAULT_BUDGET = 360;      // game seconds a level may take before it fails
const CHUNK = 600;               // ticks per page round trip
const STATE = 'SnoGame.debug.state()';

function parseArgs(argv) {
    const opts = { themes: [], seed: 1, shots: '', phone: null, levels: null, retries: 2, negative: true, allowMissing: false, json: '' };
    for (const a of argv) {
        if (a.startsWith('--seed=')) opts.seed = Number(a.slice(7));
        else if (a.startsWith('--shots=')) opts.shots = resolve(a.slice(8));
        else if (a.startsWith('--levels=')) opts.levels = a.slice(9).split(',').map(Number);
        else if (a.startsWith('--retries=')) opts.retries = Number(a.slice(10));
        else if (a.startsWith('--json=')) opts.json = resolve(a.slice(7));
        else if (a === '--no-negative') opts.negative = false;
        else if (a === '--allow-missing') opts.allowMissing = true;
        else if (a === '--touch' || a.startsWith('--touch=')) opts.phone = phoneNamed(a.slice(8) || 'landscape');
        else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        else opts.themes.push(a);
    }
    if (opts.levels && !opts.levels.every((l) => l >= 1 && l <= LEVELS)) throw new Error(`--levels must be within 1..${LEVELS}`);
    if (!(opts.seed >= 0)) throw new Error('--seed must be a number');
    return opts;
}

function phoneNamed(name) {
    const phone = PHONES.find((p) => p.name === name);
    if (!phone) throw new Error(`--touch must be one of ${PHONES.map((p) => p.name).join(', ')}`);
    return phone;
}

function check(cond, message) { if (!cond) throw new Error(message); }

export function botFile(theme) { return join(BOTS_DIR, `${theme}.js`); }

// --- the runner that lives in the page -----------------------------------

// Installed once per page load. It seeds Math.random, wraps the engine's
// win/lose hooks with tripwires that fire if the bot calls them, and plays
// up to n ticks at a time, stopping as soon as the level leaves play.
const RUNNER = String.raw`(function(seed){
  var a = seed * 2654435761 >>> 0 || 1;
  Math.random = function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  var G = SnoGame, R = window.__camp = { inBot: false, cheat: '', bot: null, mem: {}, mode: 'play' };
  function trip(obj, name, label) {
    var f = obj[name];
    obj[name] = function () { if (R.inBot && !R.cheat) R.cheat = label; return f.apply(this, arguments); };
  }
  ['win', 'die', 'loseLife', 'gameOver', 'addScore', 'addLife'].forEach(function (n) { trip(G, n, 'G.' + n); });
  Object.keys(G.debug).forEach(function (n) { if (typeof G.debug[n] === 'function') trip(G.debug, n, 'SnoGame.debug.' + n); });
  // Read-only views: reads pass through, any write throws in the bot.
  var views = new WeakMap();
  function view(o) {
    if (o === null || (typeof o !== 'object' && typeof o !== 'function')) return o;
    if (views.has(o)) return views.get(o);
    var plain = Array.isArray(o) || Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null;
    var p = new Proxy(o, {
      get: function (t, k) {
        var v = Reflect.get(t, k), d = Object.getOwnPropertyDescriptor(t, k);
        if (d && !d.configurable && !d.writable) return v;
        if (typeof v === 'function') return plain ? v : v.bind(t);
        return view(v);
      },
      set: function (t, k) { R.cheat = R.cheat || 'wrote state .' + String(k); throw new TypeError('campaign bot may not write .' + String(k)); },
      defineProperty: function (t, k) { R.cheat = R.cheat || 'defined .' + String(k); throw new TypeError('campaign bot may not define .' + String(k)); },
      deleteProperty: function (t, k) { R.cheat = R.cheat || 'deleted .' + String(k); throw new TypeError('campaign bot may not delete .' + String(k)); }
    });
    views.set(o, p);
    return p;
  }
  R.view = view;
  R.load = function (src) { R.bot = (0, eval)(src); if (!R.bot || typeof R.bot.play !== 'function') throw new Error('bot has no play()'); return Object.keys(R.bot); };
  R.fresh = function (mode) { R.mem = {}; R.mode = mode; };
  function input(i, s) {
    var fn = R.mode === 'fail' ? (R.bot.fail || function () { return {}; }) : R.bot.play;
    R.inBot = true;
    try { return fn(view(s), view(G), R.mem) || {}; }
    catch (e) { R.error = String(e && e.stack || e); return {}; }
    finally { R.inBot = false; }
  }
  var LIVE = { play: 1, intro: 1, dead: 1 };
  R.run = function (n) {
    var st = G.debug.state(), lost = 0, ticks = 0, lives = st.lives;
    for (; ticks < n && LIVE[st.screen]; ticks++) {
      st = G.debug.step(1, st.screen === 'play' ? input : {});
      if (st.lives < lives) lost += lives - st.lives;
      lives = st.lives;
      if (R.cheat || R.error) break;
    }
    return { st: st, ticks: ticks, lost: lost, cheat: R.cheat, error: R.error || '', errors: G.debug.errors.slice(0, 3) };
  };
  return true;
})`;

const CANVAS_HASH = `(function(){var c=document.querySelector('#sno-game canvas');if(!c)return 0;
  var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,h=0;
  for(var i=0;i<d.length;i+=4*97)h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)>>>0;return h;})()`;

// --- input: real keys on a desktop, real taps on a phone --------------------

// Where a logical canvas point is on the page, for taps.
async function canvasPoint(page, x, y) {
    const r = await page.eval(`(function(){var b=document.querySelector('#sno-game canvas').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()`);
    return { x: r.x + x / 960 * r.w, y: r.y + y / 540 * r.h };
}

// Confirms the menu on screen the way a player would.
async function confirm(page, phone, at = { x: 480, y: 120 }) {
    if (!phone) { await page.press('Enter'); return; }
    const p = await canvasPoint(page, at.x, at.y);
    await page.tap(p.x, p.y);
}

// Menus ignore input for their first half second of game time.
async function settle(page, seconds) {
    await page.eval(`(function(){for(var i=0;i<240 && SnoGame.debug.state().age<${seconds};i++)SnoGame.debug.step(1,{});})()`);
}

// --- one theme -----------------------------------------------------------

async function shot(page, dir, name) {
    if (!dir) return '';
    const file = join(dir, name);
    await page.screenshot(file);
    return file;
}

// Plays the level on screen until it is cleared, won, lost or out of time.
async function playLevel(page, level, budget) {
    const rec = { level, ticks: 0, seconds: 0, livesLost: 0, result: '', errors: [] };
    const limit = Math.round(budget * 60);
    let wall = Date.now();
    for (;;) {
        const r = await page.eval(`__camp.run(${Math.min(CHUNK, limit - rec.ticks)})`);
        rec.ticks += r.ticks; rec.livesLost += r.lost;
        if (r.cheat) throw new Error(`level ${level}: the bot broke the rules (${r.cheat})`);
        if (r.error) throw new Error(`level ${level}: the bot threw: ${r.error.split('\n')[0]}`);
        if (r.errors.length) { rec.errors = r.errors; rec.result = 'error'; break; }
        const sc = r.st.screen;
        if (sc === 'clear' || sc === 'victory' || sc === 'over') { rec.result = sc; break; }
        if (sc === 'error') { rec.result = 'error'; break; }
        if (rec.ticks >= limit) { rec.result = 'timeout'; break; }
        if (r.ticks === 0) throw new Error(`level ${level}: stalled on screen ${sc}`);
        if (Date.now() - wall > 600000) { rec.result = 'timeout'; break; }
    }
    rec.seconds = +(rec.ticks / 60).toFixed(1);
    return rec;
}

// Plays one level with retries on game over; a retry is the GAME OVER
// screen's own "retry level" (a real Enter or tap), not a debug call.
async function playWithRetries(page, ctx, level) {
    let retries = 0;
    for (;;) {
        await page.eval('__camp.fresh("play")');
        const rec = await playLevel(page, level, ctx.budget);
        rec.retries = retries;
        ctx.log(rec);
        if (rec.result !== 'over' || retries >= ctx.opts.retries) return rec;
        retries++;
        await settle(page, 0.6);
        await confirm(page, ctx.phone);
        await page.waitFor(`${STATE}.level===${level} && (${STATE}.screen==='intro' || ${STATE}.screen==='play')`, `retry of level ${level}`);
    }
}

// The scene after level 3: it must be there, hold, animate and lead on.
async function checkEnding(page, ctx) {
    const st = await page.eval(`SnoGame.debug.step(150, {})`);
    check(st.screen === 'victory', `the ending did not hold (screen ${st.screen})`);
    const e = await page.eval('SnoGame.debug.ending()');
    check(e && (!e.fireworks || e.sparks + e.shells > 0), 'the ending shows no fireworks');
    // The scene must animate in real time too, so let the clock run.
    await page.eval('SnoGame.debug.hold(false)');
    const h1 = await page.eval(CANVAS_HASH);
    await sleep(400);
    check(h1 !== (await page.eval(CANVAS_HASH)), 'the ending does not animate');
    ctx.shots.push(await shot(page, ctx.shotDir, `${ctx.tag}-ending.jpg`));
    // LEVELS: → then Enter on a desktop, a tap on the button on a phone.
    if (ctx.phone) {
        const p = await canvasPoint(page, 630, 415);
        await page.tap(p.x, p.y);
    } else {
        await page.press('ArrowRight');
        await page.press('Enter');
    }
    await page.waitFor(`${STATE}.screen==='title'`, 'LEVELS on the ending to open the title');
    const t = await page.eval(STATE);
    check(t.won === 1 && t.unlocked === LEVELS, `campaign not saved: won ${t.won}, unlocked ${t.unlocked}`);
}

async function openGame(page, ctx) {
    await page.goto(`${ctx.base}/index.html`);
    await page.eval(`${RUNNER}(${ctx.opts.seed})`);
    await page.eval(`__camp.load(${JSON.stringify(ctx.botSrc)})`);
    await page.eval(`SnoGame.launch(${JSON.stringify(ctx.theme)})`);
    await page.waitFor(`${STATE} && ${STATE}.screen==='title'`, 'the title screen');
    // Real time must not move the game between two of our round trips:
    // those ticks would be unsteered and make a run depend on timing.
    await page.eval('SnoGame.debug.hold(true)');
}

// The whole campaign from the title, through normal transitions only.
async function playCampaign(page, ctx) {
    const levels = ctx.opts.levels;
    if (levels) {
        // Focus mode: start each level directly; debug.start() is entry only.
        for (const level of levels) {
            await page.eval(`SnoGame.debug.start(${level})`);
            const rec = await playWithRetries(page, ctx, level);
            check(rec.result === (level === LEVELS ? 'victory' : 'clear'), `level ${level}: ${rec.result} after ${rec.seconds}s`);
        }
        return;
    }
    await confirm(page, ctx.phone, { x: 480, y: 60 });
    for (let level = 1; level <= LEVELS; level++) {
        await page.waitFor(`${STATE}.level===${level} && (${STATE}.screen==='intro' || ${STATE}.screen==='play')`, `level ${level} to start`);
        const rec = await playWithRetries(page, ctx, level);
        if (rec.ticks > 240) ctx.shots.push(await shot(page, ctx.shotDir, `${ctx.tag}-L${level}.jpg`));
        check(rec.result === (level === LEVELS ? 'victory' : 'clear'), `level ${level}: ${rec.result} after ${rec.seconds}s`);
        if (level < LEVELS) { await settle(page, 0.6); await confirm(page, ctx.phone); }
    }
    await checkEnding(page, ctx);
    // The save must survive a reload.
    await openGame(page, ctx);
    const st = await page.eval(STATE);
    check(st.won === 1 && st.unlocked === LEVELS, `progress lost on reload: ${JSON.stringify(st)}`);
}

// Negative control: the bot's poor strategy (idle by default) must lose
// level 1 by the game's own rules within the budget.
async function negativeControl(page, ctx) {
    await page.eval('SnoGame.debug.hold(true); SnoGame.debug.start(1); __camp.fresh("fail")');
    const rec = await playLevel(page, 1, ctx.budget);
    rec.negative = true;
    ctx.log(rec);
    check(rec.result === 'over', `negative control: level 1 ended ${rec.result} after ${rec.seconds}s, want a natural game over`);
    check(rec.livesLost > 0, 'negative control: game over without losing a life');
}

async function runTheme(page, base, theme, opts) {
    const src = readFileSync(botFile(theme), 'utf8');
    const tag = `${theme}${opts.phone ? '-' + opts.phone.name : ''}-s${opts.seed}`;
    const ctx = { theme, base, opts, botSrc: src, phone: opts.phone, tag, shots: [], records: [], budget: DEFAULT_BUDGET, shotDir: opts.shots };
    ctx.log = (rec) => {
        ctx.records.push(rec);
        const what = rec.negative ? 'negative' : `L${rec.level}`;
        console.log(`     ${theme} ${what}: ${rec.result} in ${rec.seconds}s, lives lost ${rec.livesLost}${rec.retries ? `, retries ${rec.retries}` : ''}${rec.errors.length ? `, errors: ${rec.errors[0]}` : ''}`);
    };
    await page.send('Network.clearBrowserCookies');
    page.problems.length = 0;
    await openGame(page, ctx);
    const keys = await page.eval(`Object.keys(__camp.bot)`);
    if (keys.includes('budget')) ctx.budget = await page.eval('__camp.bot.budget');
    check(ctx.budget > 0 && ctx.budget <= 900, `bot budget ${ctx.budget}s is out of range`);
    try {
        await playCampaign(page, ctx);
        if (opts.negative) await negativeControl(page, ctx);
        check(!page.problems.length, `page errors: ${page.problems.slice(0, 3).join(' | ')}`);
    } catch (err) {
        if (!ctx.shotDir) { ctx.shotDir = mkdtempSync(join(tmpdir(), 'snonux-campaign-')); }
        const f = await shot(page, ctx.shotDir, `${tag}-FAIL.jpg`).catch(() => '');
        err.message += f ? ` (screenshot ${f})` : '';
        err.records = ctx.records;
        throw err;
    }
    return ctx.records;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const themes = opts.themes.length ? opts.themes : themesWithGames();
    const missing = themes.filter((t) => !existsSync(botFile(t)));
    if (missing.length && !opts.allowMissing) {
        console.log(`FAIL no campaign bot for: ${missing.join(' ')} (expected ${BOTS_DIR}/<theme>.js)`);
        process.exit(1);
    }
    if (opts.shots) mkdirSync(opts.shots, { recursive: true });
    const { page, base, close } = await startSession();
    if (opts.phone) await page.emulatePhone(opts.phone.width, opts.phone.height);
    const report = {}; let failed = 0;
    try {
        for (const theme of themes) {
            if (missing.includes(theme)) { console.log(`skip ${theme}: no bot`); continue; }
            const t0 = Date.now();
            try {
                report[theme] = { ok: true, levels: await runTheme(page, base, theme, opts) };
                console.log(`ok   ${theme} campaign (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
            } catch (err) {
                failed++;
                report[theme] = { ok: false, error: err.message, levels: err.records || [] };
                console.log(`FAIL ${theme}: ${err.message}`);
                await page.eval('window.SnoGame && SnoGame.quit()').catch(() => {});
            }
        }
    } finally { await close(); }
    if (opts.json) writeFileSync(opts.json, JSON.stringify({ seed: opts.seed, profile: opts.phone ? opts.phone.name : 'desktop', report }, null, 2));
    const ran = themes.length - (opts.allowMissing ? missing.length : 0);
    console.log(failed ? `${failed} of ${ran} campaigns failed` : `all ${ran} campaigns passed`);
    process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error(err); process.exit(1); });
