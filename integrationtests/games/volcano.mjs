#!/usr/bin/env node
// Phone rendering and unchanged climbing physics, plus ordinary pad-input wins.
// node integrationtests/games/volcano.mjs [--browser] [--shots=/tmp/volcano]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startSession, sleep } from './lib.mjs';
import { PHONES } from './touch.mjs';
const source = readFileSync(new URL('../../internal/generator/templates/themes/volcano/game.js', import.meta.url), 'utf8');
const bot = readFileSync(new URL('./volcano-bot.js', import.meta.url), 'utf8');
function rng(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function game(touch, level) {
    let def, s, screen = 'play', lives = 4, score = 0, prev = {};
    const random = rng(2), effects = [];
    const G = { W: 960, H: 540, HUD: 30, cam: {}, level, key: {}, hit: {},
        isTouch: () => touch, rng, rnd: (a, b) => a + random() * (b - a),
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)), register: (_, d) => def = d,
        aabb: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
        circRect: (x, y, r, rx, ry, w, h) => Math.hypot(x - Math.max(rx, Math.min(rx + w, x)), y - Math.max(ry, Math.min(ry + h, y))) < r,
        get lives() { return lives; }, die: () => { if (--lives === 0) screen = 'over'; else s = def.init(level); },
        win: () => screen = level === 3 ? 'victory' : 'clear', addScore: n => score += n,
        sfx() {}, tone() {}, noise() {}, burst: (x, y) => effects.push({x, y}), popup() {}, shake() {}, flash() {}, text() {} };
    runInNewContext(source, { window: { SnoGame: G } }); s = def.init(level);
    G.debug = {state: () => ({screen, lives, score}), s: () => s, step: (n, input) => {
        for (let i = 0; i < n && screen === 'play'; i++) {
            const inp = typeof input === 'function' ? input(i, s, G) : input;
            G.key = inp; G.hit = {}; for (const k in inp) G.hit[k] = inp[k] && !prev[k]; prev = inp;
            def.update(s, 1 / 60);
        }
        return G.debug.state();
    }};
    return {G, def, effects, get s() {return s;}, run: () => runInNewContext(bot, {SnoGame: G})};
}
for (const level of [1, 2, 3]) {
    const desktop = game(false, level), phone = game(true, level);
    const comparable = s => JSON.stringify({...s, touch: undefined});
    assert.equal(comparable(desktop.s), comparable(phone.s), 'phone uses the same shaft and physics');
    for (const g of [desktop, phone]) {
        const result = g.run();
        assert.equal(result.state.screen, level === 3 ? 'victory' : 'clear', `normal controls win level ${level}`);
        console.log(`ok volcano ${g.s.touch ? 'phone' : 'desktop'} level ${level}: ${result.ticks} ticks, ${result.state.lives} lives`);
    }
    const idle = game(true, level); idle.G.debug.step(12000, {});
    assert.equal(idle.G.debug.state().screen, 'over', 'idle loses every life');
}
// Isolate failure hazards without turning the play bot into a state editor.
const miss = game(true, 1); miss.s.p.y = 360; miss.G.debug.step(1, {});
assert.equal(miss.G.debug.state().lives, 3, 'falling into rising lava costs a life');
const fall = game(true, 3), column = fall.s.falls[0];
fall.s.time = column.period - column.ph; fall.s.p.x = column.x - 10; fall.s.p.y = column.y0 + 20;
fall.G.debug.step(1, {}); assert.equal(fall.G.debug.state().lives, 3, 'active lava column kills');
const crumble = game(true, 2), cracked = crumble.s.ledges.find(l => l.kind === 'crumble');
crumble.s.p.x = cracked.x + 10; crumble.s.p.y = cracked.y - 30; crumble.s.p.on = cracked;
crumble.G.debug.step(1, {}); assert.equal(cracked.state, 'shake');
crumble.G.debug.step(74, {}); assert.equal(cracked.state, 'gone', 'cracked ledge collapses');
// Wall-kick dust uses the same projection as the wall, with unchanged y.
for (const touch of [false, true]) {
    const kick = game(touch, 1);
    Object.assign(kick.s.p, {x: 180, y: -150, wall: -1, ground: false, on: null, coy: 0, vy: 20});
    kick.G.debug.step(1, {a: true});
    assert.deepEqual(kick.effects[0], {x: touch ? 75 : 180, y: -120}, 'engine effect origin matches visible wall');
}
const render = g => {
    const calls = [], gradient = {addColorStop() {}};
    const ctx = new Proxy({}, {get: (o, k) => o[k] || ((...args) => {calls.push({k, args}); if (k === 'createLinearGradient') return gradient;})});
    g.def.draw(g.s, ctx); return calls;
};
const d = game(false, 1), p = game(true, 1), dc = render(d), pc = render(p);
assert(!dc.some(c => c.k === 'scale'), 'desktop projection stays unchanged');
assert(pc.some(c => c.k === 'scale' && c.args[0] === 1.35), 'phone magnifies only across shaft');
assert(pc.length < dc.length, 'phone decoration costs fewer canvas calls');
assert.equal(480 + (180 - 480) * 1.35, 75, 'left wall leaves room for meter');
assert.equal(480 + (780 - 480) * 1.35, 885, 'right wall stays visible');
assert(pc.length < 400, 'phone frame stays within a few hundred canvas calls');
console.log(`ok volcano lava, missed jump, column, crumble, projection and drawing cost (${dc.length} desktop / ${pc.length} phone calls)`);
if (process.argv.includes('--browser')) {
    const shots = (process.argv.find(a => a.startsWith('--shots=')) || '--shots=/tmp/volcano').slice(8);
    mkdirSync(shots, {recursive: true});
    const {page, base, close} = await startSession();
    try {
        for (const layout of [{name: 'desktop'}, ...PHONES]) {
            if (layout.width) await page.emulatePhone(layout.width, layout.height);
            await page.goto(`${base}/index.html`); await page.eval("SnoGame.launch('volcano')");
            await page.waitFor('SnoGame.debug.state().registered', 'volcano registration');
            for (const level of [1, 2, 3]) {
                await page.eval(`(function(){Math.random = ${rng.toString()}(9); SnoGame.debug.start(${level}); return ${bot.replace('ticks < 36000', 'ticks < 240')};})()`);
                await sleep(80); await page.screenshot(`${shots}/${layout.name}-level${level}.jpg`);
                // Engine particles consume randomness too; this seeded run exercises
                // their normal behavior without depending on real-frame timing.
                const result = await page.eval(`(function(){Math.random = ${rng.toString()}(9); SnoGame.debug.start(${level}); return ${bot};})()`);
                assert.equal(result.state.screen, level === 3 ? 'victory' : 'clear', `${layout.name} level ${level} ordinary-input win`);
                assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
                console.log(JSON.stringify({layout: layout.name, level, ...result}));
            }
            await page.eval(`Math.random = ${rng.toString()}(9); SnoGame.debug.start(1); for(var tick=0;tick<12000;tick++) SnoGame.debug.step(1, {a: SnoGame.debug.state().screen==='intro' && tick%2===0})`);
            assert.equal((await page.eval('SnoGame.debug.state()')).screen, 'over', 'browser idle loses');
            await page.eval('SnoGame.quit()');
        }
        assert.deepEqual(page.problems, []);
    } finally { await close(); }
}
