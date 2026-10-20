#!/usr/bin/env node
// Cathedral phone flight, rendering and ordinary-input play checks.
// Run: node integrationtests/games/cathedral.mjs [--browser]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

function game(touch, level) {
    let def, screen = 'play', lives = 4, score = 0, seed = 42;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const G = {
        W: 960, H: 540, HUD: 30, key: {}, hit: {}, isTouch: () => touch,
        rng: (n) => () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; },
        rnd: (a, b) => a + random() * (b - a), clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
        register: (name, d) => { def = d; },
        circ: (ax, ay, ar, bx, by, br) => (ax - bx) ** 2 + (ay - by) ** 2 < (ar + br) ** 2,
        get lives() { return lives; }, addLife: () => lives = Math.min(4, lives + 1),
        loseLife: () => { if (--lives === 0) screen = 'over'; return lives; },
        addScore: (n) => score += n, win: (n) => { score += n; screen = level === 3 ? 'victory' : 'clear'; },
        sfx() {}, tone() {}, noise() {}, burst() {}, popup() {}, shake() {}, flash() {}, text() {}
    };
    const math = Object.create(Math); math.random = random;
    runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/cathedral/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G }, Math: math });
    const s = def.init(level);
    return { s, def, state: () => ({ screen, lives, score }), step(input) {
        const prev = G.key; G.key = input; G.hit = {};
        for (const k in input) G.hit[k] = input[k] && !prev[k];
        if (screen === 'play') def.update(s, 1 / 60);
    } };
}

// The campaign bot (pad inputs only) plays each level in the browser.
const BOT = readFileSync(new URL('./bots/cathedral.js', import.meta.url), 'utf8');

// Isolate vertical flight to compare held-pad accessibility with desktop hover.
const desktop = game(false, 1), phone = game(true, 1);
for (const g of [desktop, phone]) {
    g.s.p.x = 310; g.s.p.y = 380;
    for (let i = 0; i < 90; i++) g.step({ a: true });
}
assert.ok(phone.s.p.y < desktop.s.p.y - 70, 'holding FLAP climbs on phone');
assert.equal(desktop.s.p.flapRepeat, .51, 'desktop hover rate is preserved');
assert.equal(phone.s.p.flapRepeat, .32);
for (const level of [1, 2, 3]) {
    const d = game(false, level), p = game(true, level);
    assert.deepEqual(JSON.parse(JSON.stringify(d.s.ledges)), JSON.parse(JSON.stringify(p.s.ledges)));
    assert.deepEqual(JSON.parse(JSON.stringify(d.s.cfg)), JSON.parse(JSON.stringify(p.s.cfg)));
    assert.equal(p.s.motes.length, 12, 'phone omits small decorative motes');
    for (let i = 0; i < 18000 && p.state().screen === 'play'; i++) p.step({});
    assert.equal(p.state().screen, 'over', `level ${level}: idle must lose`);
}
console.log('ok   cathedral held FLAP, unchanged layouts, and idle losses');

function render(g) {
    let calls = 0;
    const radii = [];
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, { get: (o, key) => o[key] || ((...args) => {
        calls++;
        if (key === 'arc') radii.push(args[2]);
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return gradient;
    }) });
    g.def.draw(g.s, ctx);
    return { calls, radii };
}
for (const level of [1, 2, 3]) {
    const d = game(false, level), p = game(true, level);
    for (const g of [d, p]) {
        g.s.p.x = 310; g.s.p.y = 350;
        g.s.orbs.push({ x: 340, y: 350, vx: 0, vy: 0, hw: 8, hh: 8,
            tier: 0, arm: 0, hatch: 8, max: 8 });
    }
    const dr = render(d), pr = render(p);
    assert.ok(pr.calls < dr.calls * .8, 'phone reduces decorative draw calls by at least 20%');
    assert.ok(Math.max(...pr.radii.filter(r => r < 20)) > Math.max(...dr.radii.filter(r => r < 20)), 'phone souls have larger bodies and rings');
    d.step({}); p.step({});
    assert.equal(d.s.orbs.length, 1, 'desktop keeps original catch distance');
    assert.equal(p.s.orbs.length, 0, 'phone catch distance matches larger soul');
    console.log(`ok   cathedral level ${level}: desktop ${dr.calls}, phone ${pr.calls} canvas calls`);
}

// The ending is drawn every frame for as long as it is shown: it must draw
// something at any age, and never hand the canvas a negative radius (which
// throws).
{
    const { def } = game(false, 3), radii = [];
    let calls = 0;
    const ctx = new Proxy({}, { get: (o, key) => o[key] || ((...args) => { calls++; if (key === 'arc') radii.push(args[2]); }) });
    for (const t of [0, 0.3, 1, 2.5, 7, 30]) def.ending.draw({ t, data: {} }, ctx);
    assert.ok(calls > 100 && radii.length > 0 && radii.every(r => r >= 0), 'ending draws bells and glass');
    assert.deepEqual([...def.levelNames], ['Matins', 'The Censer', 'Archdemon']);
    console.log('ok   cathedral three levels and the ending');
}

if (process.argv.includes('--browser')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            const name = phone ? phone.name : 'desktop';
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('cathedral')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'cathedral registration');
            for (const level of [1, 2, 3]) {
                const result = await page.eval(`(function () {
                    const bot = ${BOT}, mem = {};
                    const originalRandom = Math.random;
                    let seed = 93, ticks = 0;
                    try {
                        Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
                        SnoGame.debug.start(${level});
                        for (; ticks < 18000 && SnoGame.debug.state().screen === 'play'; ticks++) {
                            SnoGame.debug.step(1, (i, s) => bot.play(s, SnoGame, mem));
                        }
                        return {state: SnoGame.debug.state(), ticks};
                    } finally { Math.random = originalRandom; }
                })()`);
                assert.equal(result.state.screen, level === 3 ? 'victory' : 'clear', `${name} level ${level}: ${JSON.stringify(result)}`);
                console.log(`ok   cathedral ${name} level ${level}: ${result.ticks} ticks, ${result.state.lives} lives left`);
                // Show an active frame at this level, rather than its clear banner.
                await page.eval(`(function () { const bot = ${BOT}, mem = {}; SnoGame.debug.start(${level}); SnoGame.debug.step(180, (i, s) => bot.play(s, SnoGame, mem)); })()`);
                await page.screenshot(`/tmp/cathedral-${name}-${level}.jpg`);
            }
            const idle = await page.eval('(function(){SnoGame.debug.start(1);SnoGame.debug.step(18000,{});return SnoGame.debug.state();})()');
            assert.equal(idle.screen, 'over', `${name}: idle loses`);
            assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
            assert.deepEqual(page.problems, []);
            console.log(`ok   cathedral ${name}: idle loses, no game or page errors`);
            await page.eval('SnoGame.quit()');
        }
    } finally { await close(); }
}
