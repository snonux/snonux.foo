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
        addScore: (n) => score += n, win: (n) => { score += n; screen = level === 10 ? 'victory' : 'clear'; },
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

// Read position/velocity and souls, then steer and flap using only pad inputs.
function steer(s, tick) {
    function wrap(x) { return (x + 1440) % 960 - 480; }
    const p = s.p;
    const distance = (d) => Math.abs(wrap(d.x - p.x)) + Math.abs(d.y - p.y);
    let target = s.orbs.filter(o => o.arm < .25).sort((a, b) => distance(a) - distance(b))[0];
    const orb = !!target;
    if (!target) target = s.demons.filter(d => d.spawn <= 0 && d.grace <= 0).sort((a, b) => distance(a) - distance(b))[0];
    let tx = target ? target.x : 200, ty = target ? (orb ? target.y : target.y - (target.boss ? 26 : 17)) : 120;
    if (!orb && target && target.y < 100) { ty = 190; tx = (target.x + 200 + 960) % 960; }
    for (const c of s.censers) {
        if (Math.hypot(wrap(p.x - c.bx), p.y - c.by) >= 85) continue;
        tx = (c.bx + (wrap(p.x - c.bx) < 0 ? -120 : 120) + 960) % 960; ty = Math.min(ty, c.by - 80);
    }
    ty = Math.min(ty, 445);
    // Climb beside a ledge instead of flapping into its underside.
    if (p.ceil && ty < p.ceil.y) {
        const l = p.ceil, side = wrap(p.x - (l.x + l.w / 2)) < 0 ? -1 : 1;
        tx = (l.x + (side < 0 ? -30 : l.w + 30) + 960) % 960;
    }
    const dx = wrap(tx - p.x), predicted = p.y + p.vy * .18;
    return { left: dx - p.vx * .2 < -8, right: dx - p.vx * .2 > 8,
        a: predicted > ty && p.vy > -190 && tick % 7 === 0 };
}

// Isolate vertical flight to compare held-pad accessibility with desktop hover.
const desktop = game(false, 1), phone = game(true, 1);
for (const g of [desktop, phone]) {
    g.s.p.x = 310; g.s.p.y = 380;
    for (let i = 0; i < 90; i++) g.step({ a: true });
}
assert.ok(phone.s.p.y < desktop.s.p.y - 70, 'holding FLAP climbs on phone');
assert.equal(desktop.s.p.flapRepeat, .51, 'desktop hover rate is preserved');
assert.equal(phone.s.p.flapRepeat, .32);
for (const level of [1, 5, 10]) {
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
for (const level of [1, 5, 10]) {
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

if (process.argv.includes('--browser')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            const name = phone ? phone.name : 'desktop';
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('cathedral')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'cathedral registration');
            for (const level of [1, 5, 10]) {
                const result = await page.eval(`(function () {
                    const steer = ${steer.toString()};
                    const originalRandom = Math.random;
                    let seed = ${!phone && level === 10 ? 42 : 93}, ticks = 0;
                    try {
                        Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
                        SnoGame.debug.start(${level});
                        for (; ticks < 18000 && SnoGame.debug.state().screen === 'play'; ticks++) {
                            SnoGame.debug.step(1, (i, s) => steer(s, ticks));
                        }
                        return {state: SnoGame.debug.state(), ticks};
                    } finally { Math.random = originalRandom; }
                })()`);
                assert.equal(result.state.screen, level === 10 ? 'victory' : 'clear', `${name} level ${level}: ${JSON.stringify(result)}`);
                console.log(`ok   cathedral ${name} level ${level}: ${result.ticks} ticks, ${result.state.lives} lives left`);
                // Show an active frame at this level, rather than its clear banner.
                await page.eval(`SnoGame.debug.start(${level}); SnoGame.debug.step(180, (i,s) => (${steer.toString()})(s,i));`);
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
