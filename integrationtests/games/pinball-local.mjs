// Simulation checks that do not launch Chrome; useful while browser tests queue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(touch = true) {
    let def;
    const G = {
        W: 960, H: 540, lives: 4, key: {}, hit: {}, mouse: {},
        isTouch: () => touch, register: (_, d) => { def = d; },
        clamp: (v, a, b) => Math.max(a, Math.min(v, b)),
        lerp: (a, b, t) => a + (b - a) * t,
        dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
        rng: (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
        rnd: (a, b) => (a + b) / 2, pick: (arr) => arr[0],
        closestOnSeg: (px, py, ax, ay, bx, by) => {
            const dx = bx - ax, dy = by - ay;
            const t = G.clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
            return { x: ax + dx * t, y: ay + dy * t, t };
        },
        loseLife: () => --G.lives, addLife: (max) => { G.lives = Math.min(max, G.lives + 1); },
    };
    for (const name of ['noise', 'tone', 'sfx', 'shake', 'flash', 'burst', 'popup', 'addScore', 'win']) G[name] = () => {};
    vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/pinball/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    const tick = (s, input = {}) => { G.key = input; G.hit = input.hit || {}; G.mouse = input.mouse || {}; def.update(s, 1 / 60); };
    return { G, def, tick };
}

const phone = fixture(), desktop = fixture(false);
for (let level = 1; level <= 10; level++) {
    const a = phone.def.init(level), b = desktop.def.init(level);
    for (const key of ['walls', 'bumpers', 'targets', 'lanes', 'saucers', 'magnets', 'flippers', 'balls', 'cfg']) {
        assert.equal(JSON.stringify(a[key]), JSON.stringify(b[key]), `level ${level}: phone must preserve ${key}`);
    }
}
let s = phone.def.init(1);
phone.tick(s, { left: true, a: true });
assert.ok(s.ctl.left && s.ctl.right && s.ctl.plunge, 'two pad thumbs hold both flippers while charging');
assert.ok(s.flippers[0].a < s.flippers[0].rest && s.flippers[1].a > s.flippers[1].rest);
phone.tick(s);
assert.ok(!s.ctl.left && !s.ctl.right && !s.ctl.plunge, 'release cannot leave a flipper held');
for (const [x, side] of [[0, 'left'], [472, 'left'], [479, 'left'], [480, 'right'], [959, 'right']]) {
    s = phone.def.init(1);
    phone.tick(s, { mouse: { x, y: 200, down: true } });
    assert.ok(s.ctl[side], `canvas tap at ${x} flips ${side}`);
    assert.equal(s.ctl.plunge, side === 'right');
}
s = desktop.def.init(1);
desktop.tick(s, { a: true, b: true, mouse: { x: 100, down: true } });
assert.ok(s.ctl.plunge && !s.ctl.left && !s.ctl.right && !s.ctl.nudge, 'desktop aliases stay unchanged');
s = phone.def.init(1);
for (let i = 0; i < 9; i++) { phone.tick(s, { left: true }); phone.tick(s); }
assert.ok(s.hot, 'wasted flapping must still overheat coils');
for (let i = 0; i < 480; i++) phone.tick(s);
assert.ok(!s.hot, 'coils recover after cooling');
s = phone.def.init(1);
for (let i = 0; i < 3; i++) {
    phone.tick(s, { b: true, hit: { b: true } });
    for (let j = 0; j < 19; j++) phone.tick(s);
}
assert.ok(s.tilted && s.save === 0, 'three quick phone nudges must still disable flippers and saver');
console.log('ok pinball simulation: unchanged table, two thumbs, canvas half edges, releases, desktop aliases, overheat and tilt');
