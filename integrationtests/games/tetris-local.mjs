import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(touch) {
    let def, s, screen;
    const labels = [], effects = [], calls = [];
    const G = { W: 960, H: 540, HUD: 30, level: 1, lives: 4, key: {}, hit: {}, mouse: {},
        isTouch: () => touch, register: (_, d) => { def = d; },
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)), pick: (a) => a[0],
        rng: (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = Math.imul(seed ^ seed >>> 15, seed | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; },
        win: () => { screen = G.level === 10 ? 'victory' : 'clear'; },
        loseLife: () => { if (--G.lives <= 0) screen = 'over'; return G.lives; },
        text: (value, x, y, opts) => labels.push({ value, x, y, ...opts }),
    };
    for (const name of ['tone', 'noise', 'sfx', 'shake', 'flash', 'burst', 'popup', 'addScore']) G[name] = (...args) => effects.push({ name, args });
    const ctx = new Proxy({}, { get: (_, name) => (...args) => calls.push({ name, args }) });
    vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/tetris/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    G.debug = { errors: [], s: () => s, state: () => ({ screen }),
        start(level) { G.level = level; G.lives = 4; G.key = {}; G.hit = {}; G.mouse = {}; s = def.init(level); screen = 'play'; },
        step(n, input) {
            for (let i = 0; i < n && screen === 'play'; i++) {
                const c = typeof input === 'function' ? input(i, s) : input;
                const old = G.key, mouse = G.mouse;
                G.key = c; G.hit = {};
                for (const key of ['left', 'right', 'up', 'down', 'a', 'b']) G.hit[key] = !!c[key] && !old[key];
                G.mouse = { ...(c.mouse || {}), hit: !!c.mouse?.down && !mouse.down };
                def.update(s, 1 / 60);
            }
        },
    };
    return { G, def, ctx, labels, effects, calls };
}
const phone = fixture(true), desktop = fixture(false);
for (const level of [1, 5, 10]) {
    for (const f of [phone, desktop]) f.G.debug.start(level);
    for (let n = 0; n < 900; n++) {
        const input = { left: n % 180 < 60, right: n % 180 >= 120, a: n % 23 === 0, down: n % 120 < 10 };
        phone.G.debug.step(1, input); desktop.G.debug.step(1, input);
        const state = (f) => JSON.stringify({ ...f.G.debug.s(), touch: undefined });
        assert.equal(state(phone), state(desktop), `level ${level}: touch pad preserves rules and timing`);
    }
}
for (const point of [{ x: NaN, y: 200 }, { x: Infinity, y: 200 }, { x: 300, y: NaN }, { x: 300, y: Infinity }, { x: 155, y: 200 }, { x: 804, y: 200 }, { x: 400, y: 39 }, { x: 400, y: 541 }]) {
    phone.G.debug.start(1); phone.G.debug.step(1, { mouse: { ...point, down: true } });
    assert.equal(phone.G.debug.s().col, 5, 'invalid/outside taps do not move');
    assert.equal(phone.G.debug.s().shots.length, 0, 'invalid/outside taps do not fire');
}
for (const [x, col] of [[156, 0], [803.99, 11]]) {
    phone.G.debug.start(1);
    const s = phone.G.debug.s();
    // Both edge columns are explicitly useful so aim assistance cannot alter them.
    s.rows[0].cells[col] = null;
    if (!s.rows[1].cells[col]) s.rows[1].cells[col] = { kind: 'n', color: '#fff', hp: 0, glow: 0 };
    const firedBefore = phone.effects.filter((e) => e.name === 'tone' && e.args[0] === 520).length;
    phone.G.debug.step(1, { mouse: { x, y: 540, down: true } });
    assert.equal(s.col, col, 'visual board edges map to correct column');
    assert.equal(s.lx, 264 + (col + 0.5) * 36, 'tap places carriage directly under shot');
    assert.equal(s.shots.length, 1);
    phone.G.debug.step(60, { mouse: { x, y: 540, down: true } });
    assert.equal(phone.effects.filter((e) => e.name === 'tone' && e.args[0] === 520).length, firedBefore + 1, 'holding a tap does not spray shots');
}
phone.G.debug.start(1);
phone.G.debug.s().rows[0].cells[0] = { kind: 'armour', hp: 2, color: '#fff', glow: 0 };
const effectStart = phone.effects.length;
phone.G.debug.step(60, { mouse: { x: 183, y: 460, down: true } });
const impact = phone.effects.slice(effectStart).find((e) => e.name === 'burst');
assert.equal(impact.args[0], 183, 'phone armour impact matches the widened column');
phone.G.debug.start(1);
const miss = phone.G.debug.s();
for (const row of miss.rows) for (let c = 0; c < 12; c++) row.cells[c] = { kind: 'n', hp: 0, color: '#fff', glow: 0 };
phone.G.debug.step(12, { mouse: { x: 183, y: 460, down: true } });
assert.ok(miss.rows[0].stub, 'an unaimed tap still adds the harmful stub');
assert.ok(miss.cool > 0.35, 'a missed tap still jams the launcher');
assert.equal(miss.lines, 0, 'misses do not clear rows for free');
phone.G.debug.start(1); phone.G.debug.step(1, { left: true, right: true });
assert.equal(phone.G.debug.s().col, 5, 'opposite controls cancel');
desktop.G.debug.start(1); desktop.G.debug.step(1, { mouse: { x: 400, y: 200, down: true } });
assert.equal(desktop.G.debug.s().shots.length, 0, 'desktop mouse retains its behavior');
phone.G.debug.start(10);
const s = phone.G.debug.s(); s.combo = 4; s.comboT = 2; s.surgeT = 0.5; s.shiftT = 0.1;
s.rows[0].shift = 1; phone.G.key = { down: true }; phone.def.draw(s, phone.ctx);
for (const message of ['STEEL', 'HIT x2', 'BOMB', '3 ROWS', 'SLIDE', 'SURGE!', 'NOW', 'LINES', 'COMBO', 'RUSH +']) {
    const label = phone.labels.find((v) => v.value === message);
    assert.ok(label && label.size >= 24, `combined phone cue ${message} stays large`);
    assert.ok(label.y >= 40 && label.y <= 540);
    assert.ok(label.x < 130 || label.x > 830, 'labels stay beside the playfield');
}
assert.ok(phone.calls.some((c) => c.name === 'scale' && c.args[0] === 1.5 && c.args[1] === 1), 'phone enlarges columns without changing vertical cues');
for (const f of [phone, desktop]) {
    f.calls.length = 0; f.G.debug.start(10); f.def.draw(f.G.debug.s(), f.ctx);
}
assert.ok(phone.calls.length < desktop.calls.length, 'phone omits decorative calls despite its larger cues');
for (const f of [phone, desktop]) {
    const result = vm.runInNewContext(readFileSync(new URL('./tetris-bot.js', import.meta.url), 'utf8'), { SnoGame: f.G });
    console.log(JSON.stringify({ touch: f === phone, ...result }));
    assert.ok(result.wins.every((v) => ['clear', 'victory'].includes(v.screen)), 'ordinary inputs win 1/5/10');
    assert.ok(result.idle.every((v) => v.screen === 'over'), 'idle fails');
}
console.log('ok tetris: phone targets, edge validation, combined cues, identical challenge, input wins and idle losses');
