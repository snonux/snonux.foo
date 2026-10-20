#!/usr/bin/env node
// Phone rendering must stay readable without changing demolition physics.
// Run: node integrationtests/games/brutalist.mjs [--browser]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

function rendering(touch, level, damaged = false, hazards = false) {
    let def, calls = 0;
    const labels = [], rects = [];
    const G = {
        W: 960, H: 540, HUD: 30, t: 0, level, isTouch: () => touch,
        rng: () => () => 0.5, rnd: (a, b) => (a + b) / 2,
        clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
        register: (name, d) => { def = d; },
        text: (label, x, y, opts) => labels.push({ label, x, y, ...opts }),
    };
    const ctx = new Proxy({}, { get: (o, k) => o[k] || ((...args) => {
        calls++;
        if (k === 'fillRect') rects.push(args);
    }) });
    runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/brutalist/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    const s = def.init(level);
    if (damaged) s.grid[0].find((b) => b && b.kind === 0).hp = 0.2;
    if (hazards) { s.wind.f = 60; s.tremor.warn = true; }
    s.chunks.push({ x: 200, y: 200, tx: 100, rot: 0, size: 22 });
    def.draw(s, ctx);
    return { calls, labels, rects, s };
}

for (const level of [1, 2, 3]) {
    const desktop = rendering(false, level), phone = rendering(true, level);
    assert.deepEqual(JSON.parse(JSON.stringify(phone.s.grid)), JSON.parse(JSON.stringify(desktop.s.grid)), 'phone keeps demolition layout and block hit points');
    for (const k of ['total', 'need', 'time', 'L', 'cab', 'ball']) {
        assert.deepEqual(JSON.parse(JSON.stringify(phone.s[k])), JSON.parse(JSON.stringify(desktop.s[k])), `phone keeps ${k}`);
    }
    const status = phone.labels.filter((l) => /^(DEMOLISH|TIME)/.test(l.label));
    assert.equal(status.length, 2);
    assert.ok(status.every((l) => l.size === 28 && l.y - l.size >= 470));
    assert.ok(phone.labels.every((l) => l.y - l.size >= 30), 'phone labels clear the engine HUD');
    assert.ok(phone.rects.some((r) => r[1] === 476 && r[2] === 68 && r[3] === 9), 'phone debris mark matches its danger width and has more contrast');
    assert.ok(phone.calls < desktop.calls * 0.8, 'phone removes at least 20% of decorative canvas calls');
    if (level === 3) assert.ok(phone.labels.some((l) => l.label === '!' && l.size === 26));
    assert.equal(rendering(true, level, true).calls - phone.calls, 5, 'damaged phone blocks keep a single visible crack');
    assert.equal(rendering(false, level, true).calls - desktop.calls, 11, 'desktop keeps detailed damage cracks');
    console.log(`ok   brutalist level ${level} rendering: desktop ${desktop.calls}, phone ${phone.calls} canvas calls`);
}

for (const touch of [false, true]) {
    const labels = rendering(touch, 3, false, true).labels;
    const wind = labels.find((l) => l.label.startsWith('WIND'));
    const tremor = labels.find((l) => l.label.startsWith('TREMOR'));
    assert.ok(wind && tremor, 'simultaneous hazards both show warnings');
    assert.ok(tremor.y - tremor.size > wind.y, 'wind and tremor warnings occupy separate rows');
}

// Read the ball/cab and incoming chunks, then drive, reel and brake with only
// pad buttons. Seed hazards for reproducibility; never alter the game state.
function demolish() {
    const results = [];
    for (const level of [1, 2, 3]) {
        let seed = 42;
        const oldRandom = Math.random;
        Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        SnoGame.debug.start(level);
        let ticks = 0, dir = 1;
        const period = level === 3 ? 130 : 150, length = level === 3 ? 350 : 390;
        try {
            for (; ticks < 18000 && SnoGame.debug.state().screen === 'play'; ticks++) {
                if (ticks % period === 0) dir = -dir;
                SnoGame.debug.step(1, (i, s) => {
                    const danger = s.chunks.find((k) => Math.abs(k.tx - s.cab.x) < 100 && k.vy > 0 && k.y > 150);
                    const move = danger ? (s.cab.x > 120 ? -1 : 1) : dir;
                    return { right: move > 0, left: move < 0, down: s.L < length,
                        up: s.L > length + 10, a: !danger && ticks % period > period - 20 };
                });
            }
        } finally { Math.random = oldRandom; }
        results.push({ level, ticks, state: SnoGame.debug.state(), gone: SnoGame.debug.s().gone, need: SnoGame.debug.s().need });
    }
    return results;
}

if (process.argv.includes('--browser')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            const name = phone ? phone.name : 'desktop';
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('brutalist')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'brutalist registration');
            for (const r of await page.eval(`(${demolish.toString()})()`)) {
                assert.equal(r.state.screen, r.level === 3 ? 'victory' : 'clear', `${name}: level ${r.level} must be won through play: ${JSON.stringify(r)}`);
                assert.ok(r.gone >= r.need, `${name}: target was actually demolished`);
            }
            const idle = await page.eval('(function(){SnoGame.debug.start(1);SnoGame.debug.step(9000,{});return SnoGame.debug.state();})()');
            assert.equal(idle.screen, 'over', `${name}: idle loses`);
            assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
            assert.deepEqual(page.problems, []);
            console.log(`ok   brutalist ${name}: pad-only wins 1, 2, 3; idle loses`);
            await page.eval('SnoGame.quit()');
        }
    } finally { await close(); }
}
