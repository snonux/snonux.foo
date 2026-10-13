#!/usr/bin/env node
// Phone visibility must not change ball physics or desktop capsule catches.
// Run: node integrationtests/games/breakout.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function game(touch) {
    let def;
    const text = [], arcs = [];
    const G = {
        W: 960, H: 540, HUD: 30, t: 0, level: 1, lives: 4,
        mouse: { x: 480 }, key: {}, hit: {}, isTouch: () => touch,
        rng: () => () => 0.5, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        register: (name, d) => { def = d; },
        sfx() {}, addScore() {}, text: (label, x, y, opts) => text.push({ label, ...opts }),
    };
    const ctx = { fillRect() {}, beginPath() {}, fill() {}, arc: (x, y, r) => arcs.push(r) };
    runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/breakout/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    return { def, G, ctx, text, arcs };
}

for (const touch of [false, true]) {
    const { def, G, ctx, text, arcs } = game(touch);
    for (const level of [1, 5, 10]) {
        const s = def.init(level);
        assert.equal(s.touch, touch);
        assert.equal(s.speed, 310 + level * 10, 'phone keeps ball speed');
        assert.equal(s.paddle.w, 136 - level * 3, 'phone keeps paddle physics');
        assert.equal(s.balls[0].y, 492, 'phone keeps serve collision radius');
    }
    const s = def.init(1);
    s.caps.push({ x: s.paddle.x, y: 420, kind: 'wide' });
    def.draw(s, ctx);
    assert.deepEqual(arcs, touch ? [13, 7] : [7], 'phone halo leaves physical ball visible');
    assert.equal(text[0].size, touch ? 22 : 13, 'capsule labels fit the phone drawing');
    assert.equal(text[1].label, touch ? 'SERVE or tap the board' : 'SPACE or click to serve');

    // A visible capsule edge overlaps the paddle on phones. Desktop retains
    // its original smaller catch range, so the same offset is a miss there.
    s.caps = [{ x: s.paddle.x + s.paddle.w / 2 + 20, y: 500, kind: 'wide' }];
    def.update(s, 1 / 60);
    assert.equal(s.timers.wide, touch ? 14 : 0);
    assert.equal(s.caps.length, touch ? 0 : 1);

    // Misses below or beside the drawn phone capsule must not collect it.
    if (touch) {
        s.timers.wide = 0;
        s.caps = [{ x: s.paddle.x, y: 523.5, kind: 'wide' }];
        def.update(s, 0);
        assert.equal(s.timers.wide, 14, 'bottom edge overlapping the 12px paddle collects');
        assert.equal(s.caps.length, 0);
        s.timers.wide = 0;
        s.caps = [{ x: s.paddle.x + s.paddle.w / 2 + 25, y: 500, kind: 'wide' },
            { x: s.paddle.x, y: 525, kind: 'wide' }];
        def.update(s, 0);
        assert.equal(s.timers.wide, 0);
        assert.equal(s.caps.length, 2);
    }
    console.log(`ok   breakout ${touch ? 'phone' : 'desktop'} visuals and capsule catch bounds`);
}
