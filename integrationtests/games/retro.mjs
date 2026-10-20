#!/usr/bin/env node
// Carrier Lost: phone tells, unchanged hazards, and ordinary FLIP-input wins.
// --local does not reserve a browser lane.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

let def, phone = false, labels = [], calls = [], s, screen, previous = false;
const G = { W: 960, H: 540, HUD: 30, t: 0, level: 1, lives: 3, cam: {}, key: {}, hit: {}, mouse: {},
    register: (_, d) => { def = d; }, isTouch: () => phone,
    clamp: (n, a, b) => Math.min(b, Math.max(a, n)), lerp: (a, b, t) => a + (b - a) * t,
    rng: (seed) => () => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = Math.imul(seed ^ seed >>> 15, seed | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    },
    rnd: (a, b) => (a + b) / 2, pick: (a) => a[0],
    aabb: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    loseLife: () => { if (--G.lives === 0) screen = 'over'; return G.lives; },
    addLife: (max) => { G.lives = Math.min(max, G.lives + 1); },
    win: () => { screen = G.level === 3 ? 'victory' : 'clear'; },
    text: (text, x, y, options) => labels.push({ text, x, y, ...options }) };
for (const name of ['tone', 'noise', 'burst', 'popup', 'shake', 'flash', 'addScore']) G[name] = () => {};
vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/retro/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
const ctx = new Proxy({}, { get: (_, name) => (...args) => calls.push({ name, args }), set: () => true });
const rules = (s) => JSON.stringify({ ...s, touch: undefined });
for (let level = 1; level <= 3; level++) {
    phone = false; const desktop = def.init(level);
    phone = true; const mobile = def.init(level);
    assert.equal(rules(desktop), rules(mobile), `level ${level} retains all rules/layouts`);
    G.mouse = {};
    for (let tick = 0; tick < 90; tick++) {
        G.hit = { a: tick % 45 === 0 };
        def.update(desktop, 1 / 60); def.update(mobile, 1 / 60);
    }
    assert.equal(rules(desktop), rules(mobile), `level ${level} retains flip/scroll physics`);
}
const reset = (level = 1) => { G.level = level; G.lives = 3; G.t = 0; G.hit = {}; G.mouse = {}; s = def.init(level); screen = 'play'; previous = false; return s; };
reset(); G.mouse.hit = true; def.update(s, 1 / 60); assert.equal(s.g, -1, 'canvas tap flips');
G.mouse = {}; G.hit = { a: true }; def.update(s, 1 / 60);
assert.equal(s.g, -1, 'a second tap in flight cannot reverse gravity');
reset(); G.hit = { a: true }; def.update(s, 1 / 60); assert.equal(s.g, -1, 'pad FLIP works');
reset(); s.zones = [{ type: 'jam', x0: 0, x1: 1000 }]; G.hit = { a: true }; def.update(s, 1 / 60);
assert.equal(s.g, 1, 'jam still blocks a flip'); assert.equal(G.lives, 3, 'denied flip is not a phantom hit');
phone = false; reset(); G.mouse.hit = true; def.update(s, 1 / 60); assert.equal(s.g, 1, 'desktop click stays inert');
phone = true; reset(3); s.x = 1000; s.haz = [{ type: 'burst', x: 1350, w: 180, lane: 1, d0: 1200, d1: 1530 }];
s.zones = ['jam', 'turbo', 'fog'].map((type) => ({ type, x0: 0, x1: 2000 }));
for (const t of [0, .1]) {
    G.t = t; labels = []; calls = []; def.draw(s, ctx);
    assert.ok(labels.some((l) => l.text === '!'), 'warning remains present across its blink cycle');
    const modes = labels.find((l) => l.text === 'JAMMED - NO FLIP / 2X SPEED / DROPOUT');
    assert.ok(modes && modes.size >= 28 && modes.y < 112, 'all active modes stay legible above the corridor');
    assert.ok(labels.some((l) => l.text === 'FLIP LOCKED' && l.y > 442));
    assert.ok(!calls.some((c) => c.name === 'fillRect' && c.args[0] === 0 && c.args[2] === 960 &&
        c.args[1] > 30 && c.args[1] < 442 && c.args[1] + c.args[3] > 112),
    'status must not mask the ceiling or corridor');
}
s.zones = []; s.haz[0].x = 1600; labels = []; def.draw(s, ctx);
assert.ok(!labels.some((l) => l.text === '!'), 'out-of-range burst has no warning');
const drawCalls = (touch) => { s.touch = touch; s.zones = [{ type: 'fog', x0: 0, x1: 2000 }]; s.haz[0].x = 1200; calls = []; def.draw(s, ctx); return calls.length; };
assert.ok(drawCalls(true) < drawCalls(false), 'phone uses less waveform/static draw work');
G.debug = { start: reset, state: () => ({ screen }), s: () => s, errors: [], step: (ticks, input) => {
    for (let i = 0; i < ticks && screen === 'play'; i++) {
        const ctl = typeof input === 'function' ? input(i) : input;
        G.hit = { a: !!ctl.a && !previous }; G.mouse = {}; previous = !!ctl.a;
        G.t += 1 / 60; def.update(s, 1 / 60);
    }
} };
// The relay is the checkpoint: past it a crash respawns there with a life
// handed back first; reaching the end of the line wins.
reset(); G.lives = 2; s.x = s.prevX = s.cpX - 1; def.update(s, 1 / 60);
assert.ok(s.cp && G.lives === 3, 'the relay locks and hands back a life');
s.y = 600; def.update(s, 1 / 60); assert.equal(G.lives, 2, 'falling out of the line crashes');
while (s.redial > 0) def.update(s, 1 / 60);
assert.equal(s.x, s.cpX, 'the respawn is at the relay');
reset(2); s.x = s.prevX = s.len - 1; s.haz = []; def.update(s, 1 / 60);
assert.equal(screen, 'clear', 'the end of the line clears the level');
const lens = [1, 2, 3].map((l) => def.init(l).len);
assert.ok(lens[0] < lens[1] && lens[1] < lens[2], 'each line is longer than the last');

// The campaign bot (bots/retro.js) plays each level with FLIP alone.
const BOT = readFileSync(new URL('./bots/retro.js', import.meta.url), 'utf8');
const bot = `(function (bot) {
    var G = SnoGame, results = [];
    for (var level = 1; level <= 3; level++) {
        var mem = {}, ticks = 0;
        G.debug.start(level);
        while (ticks++ < 14000 && G.debug.state().screen === 'play') G.debug.step(1, bot.play(G.debug.s(), G, mem));
        results.push({ level: level, screen: G.debug.state().screen, ticks: ticks });
    }
    G.debug.start(1); G.debug.step(14000, {});
    return { wins: results, idle: G.debug.state().screen, errors: G.debug.errors.slice() };
})(${BOT})`;
for (const touch of [false, true]) {
    phone = touch;
    const result = vm.runInNewContext(bot, { SnoGame: G, Math });
    for (const win of result.wins) assert.equal(win.screen, win.level === 3 ? 'victory' : 'clear', JSON.stringify(win));
    assert.equal(result.idle, 'over', 'idle must lose');
}
console.log('ok   retro local: same layouts, tap/pad/midair/jam paths, persistent combined cues, less phone drawing, relay checkpoint, finish line, FLIP wins and idle loss');
if (!process.argv.includes('--local')) {
    const { page, base, close } = await startSession();
    try {
        for (const mode of [null, ...PHONES]) {
            if (mode) await page.emulatePhone(mode.width, mode.height);
            await page.goto(`${base}/index.html`); await page.eval("SnoGame.launch('retro')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'retro registration');
            const result = await page.eval(bot);
            for (const win of result.wins) assert.equal(win.screen, win.level === 3 ? 'victory' : 'clear', JSON.stringify(win));
            assert.equal(result.idle, 'over'); assert.deepEqual(result.errors, []);
            console.log(`ok   retro ${mode?.name || 'desktop'}: FLIP-input wins 1/2/3 and idle loss`);
        }
    } finally { await close(); }
}
