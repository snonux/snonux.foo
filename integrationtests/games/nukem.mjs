#!/usr/bin/env node
// Rendering regressions without Chrome: keep phone status legible and bound
// drawing to the viewport without discarding threats at either edge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let def;
const G = {
    W: 960, H: 540, HUD: 30, cam: { x: 0, y: 0 },
    isTouch: () => false,
    register: (_, game) => { def = game; },
    text() {}, key: {}, hit: {}, lives: 4,
    loseLife() { return --this.lives; },
    sfx() {}, burst() {}, popup() {}, noise() {}, tone() {}, shake() {}, flash() {}, addScore() {}, win() {}, gameOver() {}
};
const shared = readFileSync(new URL('../../internal/generator/templates/shared/games.js', import.meta.url), 'utf8');
// Exercise the actual engine's geometry and tile physics without its DOM.
vm.runInNewContext(shared.slice(shared.indexOf('    G.clamp ='), shared.indexOf('    // Saved progress:')), { G, Math });
vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/nukem/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G }, Math });

function render(s) {
    const texts = [], calls = [];
    G.text = (text, x, y, opts) => texts.push({ text, x, y, ...opts });
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, {
        get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
            ? () => gradient : (...args) => calls.push({ key, args }),
        set: () => true
    });
    def.draw(s, ctx);
    return { texts, calls };
}

for (const level of [1, 5, 9, 10]) {
    G.cam.x = 0;
    const s = def.init(level);
    s.touch = true; s.p.weapon = 'spread'; s.p.ammo = 999; s.p.nades = 12; s.haveCard = true;
    const phone = render(s);
    assert.equal(def.hud(s), `T-${Math.ceil(s.clock)}`, 'phone HUD leaves room for lives');
    assert(phone.texts.some(t => t.text === 'SPREAD 999  GRN 12  KEY' && t.size >= 20 && t.y >= G.HUD));
    assert(phone.texts.some(t => t.text === 'HP 100' && t.size >= 20 && t.y >= G.HUD));
    assert(phone.texts.filter(t => /^[+SRG]$/.test(t.text)).every(t => t.size >= 20));
    s.touch = false;
    assert(def.hud(s).includes('SPREAD 999  GRN 12  KEY'), 'desktop HUD retains equipment');
    assert(render(s).texts.some(t => t.text === 'HEALTH' && t.size === 13));
    // Appending arbitrary offscreen scenery must not add raster operations.
    const before = render(s).calls.length;
    s.barrels.push({ x: 20000, y: 450, w: 20, h: 26, fuse: 0 });
    s.pickups.push({ x: 20000, y: 450, kind: 'r' });
    s.lasers.push({ x: 20000, y: 450, w: 8, h: 30, ph: 0 });
    s.movers.push({ ax: 20000, bx: 21000, ay: 300, by: 300, x: 20000, y: 300, w: 90, h: 12 });
    s.checks.push({ x: 20000, on: true });
    s.shots.push({ x: 20000, y: 450, foe: true, r: 4 });
    s.nades.push({ x: 20000, y: 450, w: 8, h: 8, fuse: 1 });
    s.blasts.push({ x: 20000, y: 450, r: 100, t: 0.2 });
    assert.equal(render(s).calls.length, before, `level ${level}: offscreen culling`);
    s.shots.push({ x: 955, y: 450, foe: true, r: 4 });
    assert(render(s).calls.some(c => c.key === 'arc' && c.args[0] === 955), 'visible threat survives culling');
    s.blasts.push({ x: 990, y: 450, r: 100, t: 0.2 });
    assert(render(s).calls.some(c => c.key === 'arc' && c.args[0] === 990), 'blast crossing viewport edge remains visible');
    s.movers.push({ ax: -100, bx: 1100, ay: 300, by: 300, x: 450, y: 300, w: 90, h: 12 });
    assert(render(s).calls.some(c => c.key === 'lineTo' && c.args[0] === 1145), 'crossing rail remains visible');
}
// A running jump keeps FIRE held and DOWN drift does not stop a running
// thumb. These are ordinary pad key combinations with real tile physics.
const controls = def.init(1); controls.touch = true;
G.key = {}; G.hit = {};
for (let i = 0; i < 10; i++) def.update(controls, 1 / 60);
const startX = controls.p.x, floorY = controls.p.y;
G.key = { right: true, up: true, a: true }; G.hit = { up: true, a: true };
def.update(controls, 1 / 60); G.hit = {};
for (let i = 0; i < 8; i++) def.update(controls, 1 / 60);
assert(controls.p.x > startX && controls.p.y < floorY && controls.shots.some(b => !b.foe), 'running jump and FIRE together');
const drift = def.init(1); drift.touch = true;
G.key = {}; G.hit = {};
for (let i = 0; i < 10; i++) def.update(drift, 1 / 60);
G.key = { right: true, down: true };
def.update(drift, 1 / 60);
assert(!drift.p.crouch && drift.p.vx > 0, 'diagonal thumb drift keeps running');
G.key = { down: true };
def.update(drift, 1 / 60);
assert(drift.p.crouch, 'DOWN still ducks when stationary');
assert.equal(def.touch.a, 'FIRE');
assert.equal(def.touch.b, 'NADE');
assert(def.controls.some(line => line.includes('Run + ↑ + FIRE')), 'combined pad inputs are explained');
console.log('nukem phone status, desktop HUD, offscreen culling and edge threats passed');

// Run the same expression that play.mjs can use in Chrome. Only pad inputs
// advance the world, including the boss's real AI and the idle-loss clock.
let world, screen = 'play', held = {};
G.isTouch = () => true;
G.win = () => { screen = world.level === 10 ? 'victory' : 'clear'; };
G.gameOver = () => { screen = 'over'; };
G.loseLife = () => { if (--G.lives <= 0) screen = 'over'; return G.lives; };
G.debug = {
    start(level) {
        G.lives = 4; G.cam.x = 0; held = {}; G.key = {}; G.hit = {};
        world = def.init(level); screen = 'play';
    },
    state: () => ({ screen }),
    s: () => world,
    step(n, input) {
        for (let i = 0; i < n && screen === 'play'; i++) {
            const keys = typeof input === 'function' ? input(i, world, G) : input;
            G.hit = {};
            for (const k of Object.keys(keys)) G.hit[k] = keys[k] && !held[k];
            G.key = keys; held = keys;
            def.update(world, 1 / 60);
        }
    }
};
const wins = vm.runInNewContext(readFileSync(new URL('./nukem-bot.js', import.meta.url), 'utf8'), { SnoGame: G, Math });
for (const win of wins) {
    assert.equal(win.screen, win.level === 10 ? 'victory' : 'clear', `level ${win.level} ordinary-input win`);
    assert(win.haveCard && win.bossDown, `level ${win.level} actually completes objective`);
    assert.equal(win.idleScreen, 'over', `level ${win.level} idle cannot win`);
}
console.log(JSON.stringify(wins));

// The optional browser gate runs the same ordinary-input proof against the
// full engine, then captures levels 1/5/10 in desktop or both phone layouts.
// node integrationtests/games/nukem.mjs --browser [--touch] [--shots=/tmp/nukem]
if (process.argv.includes('--browser')) {
    const { startSession, sleep } = await import('./lib.mjs');
    const { mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const shotDir = process.argv.find(arg => arg.startsWith('--shots='))?.slice(8);
    if (shotDir) mkdirSync(shotDir, { recursive: true });
    const layouts = process.argv.includes('--touch')
        ? [{ name: 'landscape', width: 844, height: 390 }, { name: 'portrait', width: 390, height: 844 }]
        : [{ name: 'desktop' }];
    const { page, base, close } = await startSession();
    try {
        for (const layout of layouts) {
            if (layout.width) await page.emulatePhone(layout.width, layout.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('nukem')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'nukem registration');
            const proof = await page.eval(readFileSync(new URL('./nukem-bot.js', import.meta.url), 'utf8'));
            for (const win of proof) {
                assert.equal(win.screen, win.level === 10 ? 'victory' : 'clear', `${layout.name} level ${win.level} ordinary-input win`);
                assert(win.haveCard && win.bossDown, `${layout.name} level ${win.level} objective`);
                assert.equal(win.idleScreen, 'over', `${layout.name} level ${win.level} idle loss`);
            }
            console.log(layout.name, JSON.stringify(proof));
            if (shotDir) for (const level of [1, 5, 10]) {
                await page.eval(`SnoGame.debug.start(${level}); SnoGame.debug.step(30, {});`);
                await sleep(80);
                await page.screenshot(join(shotDir, `nukem-${layout.name}-L${level}.jpg`));
            }
            assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
            assert.deepEqual(page.problems, []);
        }
    } finally {
        await close();
    }
}
