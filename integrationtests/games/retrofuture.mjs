#!/usr/bin/env node
// Atomic Defense: readable phone battery status without changing wave rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';
let def, phone = false, labels = [], calls = [], s, screen, previous = false;
const G = { W: 960, H: 540, HUD: 30, t: 0, level: 1, lives: 3, key: {}, hit: {}, mouse: { x: 480, y: 270 },
    register: (_, d) => { def = d; }, isTouch: () => phone,
    clamp: (n, a, b) => Math.min(b, Math.max(a, n)), dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    circ: (ax, ay, ar, bx, by, br) => Math.hypot(ax - bx, ay - by) <= ar + br,
    circRect: (x, y, r, rx, ry, rw, rh) => Math.hypot(x - G.clamp(x, rx, rx + rw), y - G.clamp(y, ry, ry + rh)) <= r,
    rng: (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = Math.imul(seed ^ seed >>> 15, seed | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; },
    win: () => { screen = G.level === 3 ? 'victory' : 'clear'; },
    text: (text, x, y, options) => labels.push({ text, x, y, ...options }) };
for (const name of ['tone', 'noise', 'burst', 'popup', 'shake', 'flash', 'addScore', 'sfx']) G[name] = () => {};
const reset = (level = 1) => { G.level = level; G.lives = 3; G.t = 0; G.key = {}; G.hit = {}; G.mouse = { x: 480, y: 270 };
    s = def.init(level); screen = 'play'; previous = false; return s; };
G.die = () => { if (--G.lives <= 0) screen = 'over'; else s = def.init(G.level); };
vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/retrofuture/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
const ctx = new Proxy({}, { get: (_, name) => (...args) => { calls.push({ name, args }); if (name === 'createLinearGradient') return { addColorStop() {} }; }, set: () => true });
const rules = (state) => JSON.stringify({ ...state, touch: undefined });
for (let level = 1; level <= 3; level++) {
    phone = false; const desktop = reset(level); phone = true; const mobile = reset(level);
    assert.equal(rules(desktop), rules(mobile), `level ${level} keeps every wave and site`);
    for (let i = 0; i < 120; i++) { def.update(desktop, 1 / 60); def.update(mobile, 1 / 60); }
    assert.equal(rules(desktop), rules(mobile), `level ${level} keeps physics and targeting`);
}
phone = true; reset(); G.mouse = { x: 200, y: 160, hit: true }; def.update(s, 1 / 60);
assert.equal(s.shots[0].tx, 200); assert.equal(s.shots[0].ty, 160); assert.equal(s.sites[0].ammo, 9);
G.mouse = { x: 200, y: 160 }; G.key = { right: true }; G.hit = {};
for (let i = 0; i < 30; i++) def.update(s, 1 / 60);
G.mouse.hit = true; def.update(s, 1 / 60); assert.equal(s.shots.at(-1).tx, 200, 'repeated same-position tap reclaims pad aim');
reset(); G.hit = { a: true }; def.update(s, 1 / 60); assert.equal(s.shots.length, 1, 'FIRE pad shoots');
reset(); s.sites[0].ammo = 3; s.sites[4].ammo = 0; s.sites[8].alive = false;
labels = []; def.draw(s, ctx);
for (const text of ['LOW 3', 'OUT', 'LOST']) assert.ok(labels.some((l) => l.text === text && l.size >= 26 && l.y > 496));
assert.equal(s.foes.length, 0); G.mouse = { x: 600, y: 200, hit: true }; def.update(s, 1 / 60);
assert.equal(s.shots[0].sx, 70, 'empty and destroyed batteries cannot fire');
s.sites[0].ammo = 0; G.mouse.hit = true; s.cool = 0; def.update(s, 1 / 60);
assert.equal(s.shots.length, 1, 'no ammunition produces no phantom shot');
reset(3); s.boss = { x: 480, y: 96, hp: 8, max: 15, hurt: 0, volley: 1 };
s.spare = 2; labels = []; calls = []; def.draw(s, ctx);
assert.ok(labels.some((l) => l.text === 'MOTHERSHIP' && l.size >= 22 && l.y > G.HUD));
assert.ok(def.hud(s).includes('AMMO 30 +2 CITY'), 'wave, ammunition and banked cities fit together');
assert.ok(!calls.some((c) => c.name === 'fillRect' && c.args[0] === 0 && c.args[2] === 960 && c.args[1] > G.HUD && c.args[1] < 496 && c.args[3] > 2), 'status never masks the sky');
const drawCalls = (touch) => { reset(3); s.touch = touch; calls = []; def.draw(s, ctx); return calls.length; };
assert.ok(drawCalls(true) < drawCalls(false), 'phone spends fewer calls on scenery and ammunition');
G.debug = { start: reset, state: () => ({ screen }), s: () => s, errors: [], step: (ticks, input) => {
    for (let i = 0; i < ticks && screen === 'play'; i++) { const ctl = typeof input === 'function' ? input(i, s, G) : input;
        const mouse = ctl.mouse || {}; G.key = ctl; G.hit = { a: !!ctl.a && !previous };
        G.mouse = { x: mouse.x ?? G.mouse.x, y: mouse.y ?? G.mouse.y, hit: !!mouse.down && !previous };
        previous = !!(ctl.a || mouse.down); G.t += 1 / 60; def.update(s, 1 / 60); }
} };
// A MIRV splits into three; losing the last city costs a life.
phone = false; reset(2);
s.foes = [{ id: 99, kind: 'mirv', x: 300, y: 200, tx: 260, speed: 60, hp: 1, seen: 0, hurt: 0, zip: 0, vx: 0, vy: 60, splitY: 202, trail: [{ x: 300, y: 200 }] }];
G.key = {}; G.hit = {}; G.mouse = { x: 480, y: 270 }; def.update(s, 1 / 30);
assert.equal(s.foes.length, 3, 'a MIRV splits into three warheads');
reset(1); s.sites.forEach((c) => { if (!c.base) c.alive = false; }); def.update(s, 1 / 60);
assert.equal(G.lives, 2, 'the last city lost costs a life');
// The campaign bot (bots/retrofuture.js) plays every level with the mouse.
const BOT = readFileSync(new URL('./bots/retrofuture.js', import.meta.url), 'utf8');
const bot = `(function (bot) {
    var G = SnoGame, wins = [];
    for (var level = 1; level <= 3; level++) {
        var mem = {}, ticks = 0, boss = false, splits = 0, dark = false;
        G.debug.start(level);
        while (ticks++ < 40000 && G.debug.state().screen === 'play') {
            var s = G.debug.s(), mirvs = s.foes.filter(function (f) { return f.kind === 'mirv'; }).length;
            boss = boss || !!s.boss; dark = dark || !!(s.cfg.night && s.cfg.night[s.wave]);
            G.debug.step(1, bot.play(s, G, mem));
            s = G.debug.s();
            splits += Math.max(0, mirvs - s.foes.filter(function (f) { return f.kind === 'mirv'; }).length);
        }
        var cities = G.debug.s().sites.filter(function (c) { return !c.base && c.alive; }).length;
        wins.push({ level: level, screen: G.debug.state().screen, ticks: ticks, boss: boss, splits: splits, dark: dark, cities: cities });
    }
    G.debug.start(1); G.debug.step(50000, {});
    return { wins: wins, idle: G.debug.state().screen, errors: G.debug.errors.slice() };
})(${BOT})`;
const checkRun = (result) => {
    for (const win of result.wins) assert.equal(win.screen, win.level === 3 ? 'victory' : 'clear', JSON.stringify(win));
    assert.deepEqual(result.wins.map((w) => w.boss), [false, false, true], 'the mothership is the final assault');
    assert.deepEqual(result.wins.map((w) => w.dark), [false, false, true], 'the blackout is a wave of the finale');
    assert.ok(result.wins[1].splits > 0 && result.wins[2].splits > 0, 'MIRVs split in levels 2 and 3');
    assert.ok(result.wins.every((w) => w.cities > 0), 'cities survive');
    assert.equal(result.idle, 'over');
};
for (const touch of [false, true]) { phone = touch; checkRun(JSON.parse(JSON.stringify(vm.runInNewContext(bot, { SnoGame: G, Math })))); }
console.log('ok retrofuture local: unchanged rules, tap/FIRE aim, battery failures, MIRV split, city loss, readable status, less drawing, wins 1/2/3 and idle loss');
if (!process.argv.includes('--local')) {
    const { page, base, close } = await startSession();
    try { for (const mode of [null, ...PHONES]) {
        if (mode) await page.emulatePhone(mode.width, mode.height);
        await page.goto(`${base}/index.html`); await page.eval("SnoGame.launch('retrofuture')");
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'registration');
        const result = await page.eval(bot);
        checkRun(result); assert.deepEqual(result.errors, []);
        console.log(`ok retrofuture ${mode?.name || 'desktop'}: input wins and idle loss`);
    } } finally { await close(); }
}
