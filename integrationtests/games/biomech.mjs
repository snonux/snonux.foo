#!/usr/bin/env node
// Spine Crawler's rules, without a browser: a shot splits a worm and leaves
// bone, parasites eat bone, the Queen takes damage only in the head, and the
// level is won only once her and every segment are gone.
// Run: node integrationtests/games/biomech.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const CELL = 24, OY = 36, COLS = 40;
const cellX = (c) => c * CELL + CELL / 2, cellY = (r) => OY + r * CELL + CELL / 2;

function game() {
    let def;
    const calls = { win: 0, lost: 0 };
    const rng = (seed) => { let a = seed >>> 0; return () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; }; };
    const G = {
        W: 960, H: 540, HUD: 30, level: 1, lives: 3, key: {}, hit: {}, mouse: {},
        isTouch: () => false, rng, rnd: (a, b) => (a + b) / 2, pick: (arr) => arr[0],
        clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), lerp: (a, b, t) => a + (b - a) * t,
        dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
        circ: (ax, ay, ar, bx, by, br) => Math.hypot(ax - bx, ay - by) < ar + br,
        register: (name, d) => { def = d; },
        win: () => { calls.win++; }, loseLife: () => { calls.lost++; return 2; },
        addScore() {}, burst() {}, popup() {}, tone() {}, noise() {}, sfx() {}, shake() {}, flash() {}
    };
    runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/biomech/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G }, Math });
    return { def, G, calls };
}

// A worm crawling left along `row`, its head at column `head`.
function worm(row, head, len) {
    const segs = [];
    for (let k = 0; k < len; k++) segs.push({ cx: head + k, cy: row, px: head + k, py: row, dir: -1, vd: 1, dive: false });
    return { segs, t: 0, speed: 6, gate: 0, age: 0 };
}

// A quiet level-1 field: no waves queued, no creatures due, no bone.
function quiet(def, G, level) {
    G.level = level;
    const s = def.init(level);
    s.queue = []; s.next = { spore: 99, para: 99, eye: 99 };
    s.hp = s.hp.map(() => 0); s.poison = s.poison.map(() => false);
    return s;
}

const { def, G, calls } = game();
assert.deepEqual([...def.levelNames], ['First Vertebra', 'Twin Spines', 'The Queen']);
const cfg = [1, 2, 3].map((l) => { G.level = l; return def.init(l).cfg; });
assert.ok(!cfg[0].para && !cfg[0].queen && cfg[0].spore, 'level 1: worms and sacs only');
assert.ok(cfg[1].para && cfg[1].eye && !cfg[1].queen, 'level 2: parasites and the eye');
assert.ok(cfg[2].queen > 0 && cfg[2].regen > 0, 'level 3: the Queen over a regenerating field');
assert.ok(def.ending && typeof def.ending.draw === 'function', 'a theme ending');

// A shot through the third segment: the worm splits there and bone grows.
let s = quiet(def, G, 1);
s.worms = [worm(6, 10, 6)];
s.shots = [{ x: cellX(12), y: cellY(6) + 4 }];
def.update(s, 0.001);
assert.equal(s.worms.length, 2, 'the worm splits in two');
assert.deepEqual(s.worms.map((w) => w.segs.length), [2, 3], 'front and rear part');
assert.equal(s.hp[6 * COLS + 12], 3, 'the wound calcifies into a full node');
console.log('ok   biomech: a hit splits the worm and leaves a node');

// A parasite chews through the bone it crosses.
s = quiet(def, G, 2);
s.worms = [worm(2, 30, 3)];
s.hp[18 * COLS + 20] = 3;
s.bugs = [{ kind: 'para', x: cellX(20), y: cellY(18), vx: 0, vy: 0, r: 11, hp: 1, turn: 9 }];
def.update(s, 0.001);
assert.equal(s.hp[18 * COLS + 20], 0, 'the parasite ate the node');
console.log('ok   biomech: parasites eat nodes');

// The Queen: armour swallows shots, the head bleeds, and her death plus an
// empty field wins the level.
s = quiet(def, G, 3);
s.worms = []; s.queen.brood = 99;
def.update(s, 0.001);
const q = s.queen, hp = q.hp;
s.shots = [{ x: q.x + 60, y: q.y + 20 }];
def.update(s, 0.001);
assert.equal(s.queen.hp, hp, 'a shot on the carapace does nothing');
assert.equal(s.shots.length, 0, 'the armour stops the shot');
for (let i = 0; i < hp; i++) {
    s.shots = [{ x: s.queen.x, y: s.queen.y + 46 }];
    def.update(s, 0.001);
    if (!s.queen) break;
}
assert.equal(s.queen, null, 'shots to the head kill her');
assert.equal(calls.win, 1, 'with her brood gone too, the level is won');
console.log('ok   biomech: only the Queen\'s head is soft, and killing her wins');
