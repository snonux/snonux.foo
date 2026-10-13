// Phone rendering checks and shared movement/detection regressions; no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../internal/generator/templates/themes/surveillance/game.js', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../../internal/generator/templates/shared/games.js', import.meta.url), 'utf8');
export function fixture(touch, level) {
    let def, screen = 'play', calls = [], texts = [];
    const ctx = new Proxy({ canvas: { width: 960, height: 540 } }, {
        get: (o, k) => k in o ? o[k] : (...args) => { calls.push([k, ...args]); }
    });
    const G = { W: 960, H: 540, HUD: 30, t: 0, lives: 4, key: {}, hit: {},
        isTouch: () => touch, register: (_, d) => { def = d; },
        clamp: (v, a, b) => Math.max(a, Math.min(v, b)),
        lerp: (a, b, t) => a + (b - a) * t, dist: (a, b, x, y) => Math.hypot(a - x, b - y),
        loseLife: () => { if (--G.lives === 0) screen = 'over'; return G.lives; },
        gameOver: () => { screen = 'over'; }, win: () => { screen = 'clear'; },
        text: (...args) => texts.push(args) };
    for (const k of ['popup', 'tone', 'noise', 'burst', 'flash', 'shake', 'addScore']) G[k] = () => {};
    const sandbox = { G, window: { SnoGame: G }, document: { createElement: () => ({ getContext: () => ctx }) } };
    vm.runInNewContext(engine.slice(engine.indexOf('    G.rng ='), engine.indexOf('    // Saved progress:')), sandbox);
    vm.runInNewContext(source, sandbox);
    const s = def.init(level);
    return { G, def, s, ctx, screen: () => screen, step(input = {}) {
        G.key = input; G.hit = input.hit || {}; G.t += 1 / 60; def.update(s, 1 / 60);
    }, draw() { calls = []; texts = []; def.draw(s, ctx); return { calls, texts }; } };
}
for (const level of [1, 5, 10]) {
    const d = fixture(false, level), p = fixture(true, level);
    for (const key of ['map', 'cams', 'lasers', 'plates', 'guards', 'drones', 'lights', 'drives', 'def', 'player'])
        assert.equal(JSON.stringify(p.s[key]), JSON.stringify(d.s[key]), `level ${level}: unchanged ${key}`);
    for (let i = 0; i < 240; i++) {
        const input = { right: i < 80, down: i >= 80 && i < 160, b: i >= 160, a: i === 200, hit: { a: i === 200 } };
        d.step(input); p.step(input);
        for (const key of ['player', 'det', 'emp', 'time', 'got'])
            assert.equal(JSON.stringify(p.s[key]), JSON.stringify(d.s[key]), `level ${level}: identical input ${key}`);
    }
    d.draw(); p.draw(); const dr = d.draw(), pr = p.draw();
    if (level >= 5) assert.ok(pr.calls.length < dr.calls.length * .85, 'phone cuts short-ring drawing calls');
    assert.ok(pr.texts.find(t => t[0] === 'DETECTION')[3].size >= 20);
    assert.ok(p.def.hud(p.s).length < d.def.hud(d.s).length);
    assert.ok(p.s.plan && p.s.plan !== d.s.plan, 'floor plan belongs to each fresh state');
    console.log(`ok surveillance level ${level}: identical movement/detection, desktop ${dr.calls.length}, phone ${pr.calls.length} canvas calls`);
    const idle = fixture(true, level);
    for (let i = 0; i < 12000 && idle.screen() === 'play'; i++) idle.step();
    assert.equal(idle.screen(), 'over', `level ${level}: idle loses`);
}
const g = fixture(true, 10), pl = g.s.plates[0];
g.s.player.x = pl.x - 7; g.s.player.y = pl.y - 7;
g.step({ a: true, hit: { a: true } });
assert.equal(g.G.lives, 4, 'EMP disables plate before contact checks');
assert.ok(pl.off > 4.9);
const missed = fixture(true, 1);
missed.step({ a: true, hit: { a: true } });
assert.equal(missed.s.emp, 1, 'a pulse outside device range still spends a charge');
for (let i = 0; i < 20; i++) missed.step({ a: true });
assert.equal(missed.s.emp, 1, 'holding EMP spends only one charge');
const caught = fixture(true, 10), plate = caught.s.plates[0];
caught.s.player.x = plate.x - 7; caught.s.player.y = plate.y - 7; caught.step();
assert.equal(caught.G.lives, 3, 'live plate still catches instantly');
assert.equal(caught.s.got, 0);
// Simultaneous grace, EMP, alarm and reactivation warnings must still draw.
g.s.safe = 1; g.s.det = .8; g.s.seen = true; g.s.empFx = .3; g.s.lasers.forEach(l => l.off = .2);
const warnings = g.draw();
assert.ok(warnings.calls.some(c => c[0] === 'strokeRect' && c[1] === 2), 'alarm frame survives combined warnings');
assert.ok(warnings.calls.some(c => c[0] === 'setLineDash' && c[1].length), 'reactivating beams retain warning dashes');
console.log('ok surveillance idle losses, EMP miss/hold, live plate catch and combined warnings');
