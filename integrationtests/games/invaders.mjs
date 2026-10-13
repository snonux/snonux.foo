#!/usr/bin/env node
// Formation: phone braking/readability and ordinary-input completion checks.
// node integrationtests/games/invaders.mjs [--browser]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startSession, sleep } from './lib.mjs';
import { PHONES } from './touch.mjs';

function game(touch, level, source) {
    let def, screen = 'play', lives = 3, time = 0;
    const G = { W: 960, H: 540, HUD: 30, level, key: {}, isTouch: () => touch,
        rng: n => () => { n |= 0; n = n + 0x6D2B79F5 | 0; let t = Math.imul(n ^ n >>> 15, 1 | n);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; },
        clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
        aabb: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
        dist: (a, b, c, d) => Math.hypot(a - c, b - d), get t() { return time; }, get lives() { return lives; },
        register: (_, d) => { def = d; }, loseLife: () => { if (!--lives) screen = 'over'; },
        die: () => { screen = 'landed'; }, win: () => { screen = 'clear'; },
        addScore() {}, sfx() {}, tone() {}, noise() {}, burst() {}, popup() {}, shake() {}, flash() {}, text() {} };
    runInNewContext(source || readFileSync(new URL('../../internal/generator/templates/themes/invaders/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    const s = def.init(level);
    return { G, s, def, screen: () => screen, step(input) { G.key = input; time += 1 / 60; if (screen === 'play') def.update(s, 1 / 60); } };
}

// Predict the crossing point of a shot, then choose a safe nearby firing lane.
// This bot reads state but only presses left/right/FIRE; it never edits state.
function steer(i, s) {
    const p = s.player, form = s.inv.filter(e => e.state === 'form');
    let best = p.x, cost = Infinity;
    for (let x = 30; x <= 930; x += 15) {
        let aim = 150;
        for (const e of form) {
            const g = s.groups[e.g], flight = (480 - e.y) / 720;
            const thin = 1 - Math.min(1, s.inv.filter(v => v.kind !== 'm').length / s.total);
            const v = s.cfg.lo + (s.cfg.hi - s.cfg.lo) * thin * thin;
            aim = Math.min(aim, Math.abs(x - (e.x + g.dir * v * flight)));
        }
        if (s.boss) aim = Math.min(aim, Math.max(0, Math.abs(x - (s.boss.x + s.boss.vx * .45)) - 45));
        for (const e of s.inv.filter(e => e.state !== 'form')) aim = Math.min(aim, Math.abs(x - (e.x + e.vx * .2)));
        let danger = 0;
        for (const b of s.bombs) {
            const eta = (496 - b.y) / b.vy;
            if (eta < 0 || eta > 1.3) continue;
            const bx = b.x + b.vx * eta;
            const reach = p.x + Math.max(-340 * eta, Math.min(340 * eta, x - p.x));
            if (Math.abs(reach - bx) < (b.kind === 'zig' ? 85 : 60)) danger += 2500 * (1.4 - eta);
        }
        for (const b of s.beams) if (Math.abs(x - b.src.x) < 45) danger += 1500;
        for (const e of s.inv) if (e.state !== 'form' && e.y > 360 && Math.abs(x - e.x - e.vx * .2) < 60) danger += 500;
        let capsule = 0;
        for (const c of s.caps) if (c.y > 270 && Math.abs(c.x - p.x) < (496 - c.y) * 2) capsule = Math.max(capsule, Math.max(0, 100 - Math.abs(x - c.x)));
        const c = aim + Math.abs(x - p.x) * .14 + danger - capsule;
        if (c < cost) { cost = c; best = x; }
    }
    return { left: p.x > best + 5, right: p.x < best - 5, a: true };
}

function paints(g) {
    let paint = 0;
    const ctx = new Proxy({}, { get: (_, k) => (...args) => { if (['fillRect', 'fill', 'stroke'].includes(k)) paint++; }, set: () => true });
    g.def.draw(g.s, ctx);
    return paint;
}
const updated = game(false, 1);
console.log('paint submissions:', paints(updated));
assert(paints(updated) < 200);
const phoneHud = game(true, 10);
phoneHud.s.power = { rapid: 10, double: 10 }; phoneHud.s.shield = true;
assert.equal(phoneHud.def.hud(phoneHud.s), 'R+D+S  FOES 28');

// Simultaneous beam, shield and capsule powers must keep a visible warning.
phoneHud.s.beams.push({ src: phoneHud.s.inv[0], t: 0 });
phoneHud.s.shots.push({ x: 480, y: 300 });
phoneHud.s.bombs.push({ x: 500, y: 320, kind: 'bolt', t: 0 });
const marks = [];
const ctx = new Proxy({ globalAlpha: 1 }, {
    get: (target, k) => k in target ? target[k] : (...args) => {
        if (k === 'fillRect') marks.push({ args, alpha: target.globalAlpha, color: target.fillStyle });
    }
});
phoneHud.def.draw(phoneHud.s, ctx);
assert(marks.some(m => m.args[2] === 8 && m.args[3] > 300 && m.alpha >= .55));
assert(marks.some(m => m.args[2] === 44 && m.args[1] === 512));
assert(marks.some(m => m.args[2] === 8 && m.args[3] === 14));
assert(marks.some(m => m.args[2] === 10 && m.args[3] === 7));

for (const touch of [false, true]) {
    const g = game(touch, 1);
    for (let i = 0; i < 60; i++) g.step({ right: true });
    const x = g.s.player.x;
    for (let i = 0; i < 60; i++) g.step({});
    const drift = g.s.player.x - x;
    assert(drift < (touch ? 12 : 24), `release drift ${drift}`);
    console.log(`${touch ? 'phone' : 'desktop'} release drift: ${drift.toFixed(2)} world px`);
    for (const level of [1, 5, 10]) {
        const run = game(touch, level);
        let ticks = 0;
        while (run.screen() === 'play' && ticks < 36000) { run.step(steer(ticks, run.s)); ticks++; }
        console.log({ touch, level, screen: run.screen(), seconds: ticks / 60, lives: run.G.lives, foes: run.s.inv.length, boss: run.s.boss?.hp });
        assert.equal(run.screen(), 'clear');
        const idle = game(touch, level);
        for (let i = 0; i < 36000 && idle.screen() === 'play'; i++) idle.step({});
        assert.notEqual(idle.screen(), 'play');
        assert.notEqual(idle.screen(), 'clear');
    }
}

if (process.argv.includes('--browser')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of PHONES) {
            await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('invaders')");
            await page.waitFor('SnoGame.debug.state()?.registered', 'register');
            for (const level of [1, 5, 10]) {
                await page.eval(`SnoGame.debug.start(${level}); SnoGame.debug.step(600, ${steer.toString()})`);
                await sleep(80);
                await page.screenshot(`/tmp/invaders-${phone.name}-${level}.jpg`);
                const result = await page.eval(`(function(){SnoGame.debug.start(${level});var input=${steer.toString()},ticks=0;while(SnoGame.debug.state().screen==='play'&&ticks<36000){SnoGame.debug.step(1,input);ticks++;}return {screen:SnoGame.debug.state().screen,ticks,errors:SnoGame.debug.errors};})()`);
                assert(['clear', 'victory'].includes(result.screen), JSON.stringify(result));
                assert.equal(result.errors.length, 0);
                console.log(phone.name, level, result);
                const idle = await page.eval(`(function(){SnoGame.debug.start(${level});var ticks=0;while(SnoGame.debug.state().screen==='play'&&ticks<36000){SnoGame.debug.step(1,{});ticks++;}return SnoGame.debug.state().screen;})()`);
                assert.equal(idle, 'over');
            }
        }
    } finally { await close(); }
}
