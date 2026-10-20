#!/usr/bin/env node
// Run --local without Chrome; the browser path verifies ordinary-input play.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { sleep, startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

let def, phone = false, labels = [], rects = [], lives;
const G = { W: 960, H: 540, HUD: 30, t: 0, key: {}, hit: {}, mouse: {},
    isTouch: () => phone, register: (_, d) => { def = d; },
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    dist: (x, y, a, b) => Math.hypot(x - a, y - b),
    circ: (x, y, r, a, b, q) => Math.hypot(x - a, y - b) < r + q,
    rng: (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
    rnd: (a, b) => (a + b) / 2, pick: (a) => a[0],
    loseLife: () => --lives,
    text: (text, x, y, options) => labels.push({ text, x, y, ...options })
};
for (const name of ['tone', 'noise', 'sfx', 'popup', 'burst', 'shake', 'flash', 'addScore', 'win']) G[name] = () => {};
vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/plasma/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_, name) => name === 'createRadialGradient' ? () => gradient : (...args) => {
    if (name === 'fillRect') rects.push(args);
}, set: () => true });

for (let level = 1; level <= 3; level++) {
    phone = false; const desktop = def.init(level);
    phone = true; const mobile = def.init(level);
    for (const key of ['waves', 'lv', 'orbs', 'p', 'bombs', 'k', 'stars']) {
        assert.equal(JSON.stringify(desktop[key]), JSON.stringify(mobile[key]), `${key}: unchanged level ${level}`);
    }
    assert.equal(mobile.bk, desktop.bk * .85, 'retain existing phone bullet speed');
}
const move = (slow) => {
    const s = def.init(1); G.key = {}; G.hit = {}; G.mouse = { down: true, x: 100, y: 100 };
    def.update(s, 1 / 60); const x = s.p.x;
    G.key.a = slow; G.mouse.x += 100; def.update(s, 1 / 60);
    return s.p.x - x;
};
assert.ok(Math.abs(move(false) - 425 / 60) < 1e-6);
assert.ok(Math.abs(move(true) - 170 / 60) < 1e-6, 'SLOW must focus canvas drag as well as the pad');
G.mouse = {}; G.key = { left: true, up: true, a: true }; G.hit = { b: true };
const miss = def.init(1); lives = 4; def.update(miss, 1 / 60);
assert.equal(miss.bombs, 2); assert.ok(miss.shots.length > 0);
assert.ok(miss.p.x < 480 && miss.p.y < 470, 'diagonal steering, focus, autofire and bomb combine');
assert.equal(lives, 4, 'bombing empty sky must not cause phantom damage');
G.key = {}; G.hit = {}; const contact = def.init(1); contact.p.inv = 0;
contact.bullets = [{ x: contact.p.x, y: contact.p.y, vx: 0, vy: 0, r: 5, w: 0, life: 1 }];
const before = lives; def.update(contact, 1 / 60); assert.equal(lives, before - 1);
const stars = def.init(3); stars.touch = false; rects = []; def.draw(stars, ctx);
const desktopFills = rects.length; stars.touch = true; rects = []; def.draw(stars, ctx);
assert.equal(desktopFills - rects.length, 70, 'batch all phone stars into one path');
const s = def.init(3); s.boss = { x: 480, y: 96, r: 44, n: 4, phase: 0, per: 550, hp: 550, age: 0 };
s.lanes = [{ x: 100, y: 96, t: .5 }, { x: 900, y: 96, t: 1.1 }];
labels = []; rects = []; def.draw(s, ctx);
for (const label of ['SPREAD 1', 'BEAM 1', 'HOMING 1', 'THE EYE']) {
    assert.ok(labels.some((l) => l.text === label && l.size >= 26 && l.glow), `${label} readable`);
}
assert.equal(labels.filter((l) => l.text === '!').length, 1, 'warn only for the charging lane');
assert.ok(!rects.some((r) => r[0] === 0 && r[2] === 960 && r[1] >= 30), 'no opaque fullwidth phone HUD');
assert.equal(JSON.stringify(def.touch), JSON.stringify({ a: 'SLOW', b: 'BOMB' }));
console.log('ok   plasma local: drag focus, simultaneous controls, contact damage, readable combined cues');

// The mechanics the campaign leans on: three levels and three bosses, a
// graze every 40 earns a bomb, three orbs of a colour merge into a weapon.
assert.deepEqual(def.levelNames.length, 3);
const kits = [1, 2, 3].map((level) => def.init(level).lv);
assert.deepEqual(kits.map((k) => k.spread + k.beam + k.homing), [0, 1, 3], 'each level starts better armed');
G.key = {}; G.hit = {}; G.mouse = {};
const grazer = def.init(1); grazer.p.inv = 0; grazer.graze = 39;
grazer.bullets = [{ x: grazer.p.x + 15, y: grazer.p.y, vx: 0, vy: 0, r: 5, w: 0, life: 1 }];
def.update(grazer, 1 / 60);
assert.equal(grazer.graze, 40); assert.equal(grazer.bombs, 4, 'the 40th graze earns a bomb');
const merger = def.init(1);
merger.drops = [0, 1, 2].map(() => ({ x: merger.p.x, y: merger.p.y, t: 0 }));   // t 0: cyan, spread
def.update(merger, 1 / 60);
assert.equal(merger.lv.spread, 1, 'three cyan orbs merge into SPREAD 1');
console.log('ok   plasma local: three levels, graze bombs, orb merges');

// One level played by the campaign bot (bots/plasma.js) with ordinary input;
// `stop` ends it early for a screenshot of a boss fight in full swing.
const BOT = readFileSync(new URL('./bots/plasma.js', import.meta.url), 'utf8');
const playLevel = (level, stop) => `(function (bot) {
    var G = SnoGame, mem = {}, ticks = 0, bombs = 0, boss = '';
    G.debug.start(${level});
    while (ticks < 36000 && G.debug.state().screen === 'play') {
        var s = G.debug.s(), input = bot.play(s, G, mem);
        if (input.b) bombs++;
        if (s.boss) boss = s.boss.n + ' phases';
        ${stop ? "if (s.stage === 'boss' && s.boss.phase >= 1 && s.bullets.length > 30) break;" : ''}
        G.debug.step(1, input); ticks++;
    }
    var end = G.debug.s();
    return { level: ${level}, screen: G.debug.state().screen, seconds: ticks / 60, graze: end.graze, boss: boss,
        bombs: bombs, weapons: end.lv.spread + end.lv.beam + end.lv.homing, errors: G.debug.errors.slice() };
})(${BOT})`;

if (!process.argv.includes('--local')) {
    const { page, base, close } = await startSession();
    try {
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('plasma')");
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'plasma definition');
        const shots = process.argv.find((arg) => arg.startsWith('--shots='))?.slice(8);
        for (const mode of [null, ...PHONES]) {
            if (mode) {
                await page.emulatePhone(mode.width, mode.height);
                await page.eval("SnoGame.quit();SnoGame.launch('plasma')");
                await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'phone definition');
            }
            const runs = [];
            for (const level of [1, 2, 3]) runs.push(await page.eval(playLevel(level, false)));
            for (const r of runs) {
                assert.equal(r.screen, r.level === 3 ? 'victory' : 'clear', JSON.stringify(r));
                assert.deepEqual(r.errors, []);
            }
            assert.deepEqual(runs.map((r) => r.boss), ['2 phases', '3 phases', '4 phases'], 'three bosses, each a phase longer');
            assert.ok(runs.some((r) => r.graze > 0), 'grazing: ' + JSON.stringify(runs));
            assert.ok(runs.some((r) => r.weapons > (r.level === 1 ? 0 : r.level === 2 ? 1 : 3)), 'orbs upgrade a weapon');
            const idle = await page.eval("SnoGame.debug.start(1); SnoGame.debug.step(30000, {}).screen");
            assert.equal(idle, 'over', 'idle play must lose');
            console.log(`ok   plasma ${mode?.name || 'desktop'}: bot wins 1/2/3 (${runs.map((r) => r.seconds.toFixed(0) + 's').join(' ')}, grazes ${runs.map((r) => r.graze).join('/')}, bombs ${runs.map((r) => r.bombs).join('/')}), idle loses`);
            if (!shots) continue;
            mkdirSync(shots, { recursive: true });
            for (const level of [1, 2, 3]) {
                await page.eval(playLevel(level, true));
                await sleep(80);
                await page.screenshot(`${shots}/${mode?.name || 'desktop'}-${level}.jpg`);
            }
        }
    } finally { await close(); }
}
