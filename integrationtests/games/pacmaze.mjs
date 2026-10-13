#!/usr/bin/env node
// Local regressions: phone presentation must retain maze rules and input timing.
// Run: node integrationtests/games/pacmaze.mjs (no browser needed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let def, mobile = false, canvases = 0;
const calls = [];
function context(width = 960, height = 540) {
    return new Proxy({ canvas: { width, height }, globalAlpha: 1,
        fillRect(...args) { calls.push(['fillRect', this.fillStyle, ...args]); },
        rect(...args) { calls.push(['rect', this.fillStyle, ...args]); },
        arc(...args) { calls.push(['arc', this.fillStyle, ...args]); },
        fill() { calls.push(['fill', this.fillStyle]); },
        drawImage(pic) { calls.push(['image', pic]); },
        createRadialGradient() { return { addColorStop() {} }; }
    }, { get(target, key) { return key in target ? target[key] : () => {}; } });
}
const G = { W: 960, H: 540, HUD: 30, t: 0, hit: {}, key: {}, lives: 4,
    isTouch: () => mobile, register(theme, game) { assert.equal(theme, 'pacmaze'); def = game; },
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    clamp: (x, lo, hi) => Math.max(lo, Math.min(x, hi)),
    text() {}, tone() {}, noise() {}, burst() {}, addScore() {}, sfx() {},
    pick: (xs) => xs[0]
};
vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/pacmaze/game.js', import.meta.url), 'utf8'), {
    window: { SnoGame: G }, document: { createElement() {
        canvases++;
        const pic = { width: 960, height: 540 };
        pic.getContext = () => context(pic.width, pic.height);
        return pic;
    } }
});
function draw(s) { calls.length = 0; def.draw(s, context()); return calls.slice(); }
for (let level = 1; level <= 10; level++) {
    mobile = false; const desktop = def.init(level);
    mobile = true; const phone = def.init(level);
    const rules = (s) => JSON.parse(JSON.stringify({ ...s, mobile: undefined }));
    assert.deepEqual(rules(phone), rules(desktop), `level ${level}: phone changes only presentation`);
}
assert.equal(def.touch.dirs, 4);
assert.deepEqual(Array.from(def.touch.hide), ['a', 'b']);
mobile = true;
let s = def.init(1);
// A turn pressed early remains pending after the finger lifts, or while the
// old direction remains held. A new press overrides it, including reversal.
s.pl.dx = -1; s.pl.dy = 0; s.pl.want = 1;
G.hit = { up: true }; G.key = { left: true, up: true };
def.update(s, 0); assert.equal(s.pl.want, 0);
G.hit = {}; G.key = { left: true };
def.update(s, 0); assert.equal(s.pl.want, 0, 'old held direction must not erase queued turn');
G.key = {}; def.update(s, 0); assert.equal(s.pl.want, 0, 'release retains turn');
G.hit = { right: true }; def.update(s, 0); assert.equal(s.pl.want, 3, 'new reversal overrides pending turn');
G.hit = {}; G.key = { left: true, down: true }; s.pl.want = -1;
def.update(s, 0); assert.equal(s.pl.want, -1, 'ambiguous input does not invent a turn');
G.key = {}; s.pl.dx = s.pl.dy = 0; G.key.up = true;
def.update(s, 0); assert.equal(s.pl.want, 0, 'held direction recovers a missed press edge');
G.key = {};
let rendered = draw(s);
assert.ok(rendered.some((c) => c[0] === 'arc' && c[4] === 12.5), 'phone actor is 25px wide');
assert.equal(rendered.filter((c) => c[0] === 'rect' && c[4] === 6 && c[5] === 6).length, s.left - 4, 'batch retains every ordinary dot');
assert.equal(rendered.filter((c) => c[0] === 'fillRect' && c[4] === 6 && c[5] === 6).length, 0, 'dots no longer issue separate fills');
const first = s.walls.pic; draw(s); assert.equal(s.walls.pic, first, 'static wall picture is reused');
const next = def.init(5); draw(next); assert.notEqual(next.walls.pic, first, 'preview states own independent wall caches');
s = def.init(10); s.shade = 1; s.fright = 0.5; s.gateT = 2.3;
s.ghosts.forEach((g) => { g.scared = true; });
for (const time of [0, 0.1]) {
    G.t = time; rendered = draw(s);
    const darkAt = rendered.findIndex((c) => c[0] === 'fillRect' && typeof c[1] === 'object');
    assert.ok(darkAt >= 0, 'fixture draws darkness');
    assert.ok(rendered.slice(darkAt + 1).some((c) => c[0] === 'fillRect' && ['#ffd84a', '#ffad88'].includes(c[1]) && (c[4] === 8 || c[5] === 8)), 'closing shutter stays visible through darkness and both warning pulses');
    assert.ok(rendered.some((c) => c[0] === 'arc' && ['#f6f7ff', '#3a55ff'].includes(c[1]) && c[4] === 12.5), 'power warning keeps distinct frightened ghost body');
}
assert.ok(canvases >= 3);
console.log('ok   pacmaze: unchanged phone rules, input buffering/misses, batched dots, per-state walls and combined dark/power/gate warnings');
