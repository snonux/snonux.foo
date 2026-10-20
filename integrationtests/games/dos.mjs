#!/usr/bin/env node
// DOS phone rendering, held FIRE, and ordinary-input level wins.
// Run: node integrationtests/games/dos.mjs [--browser]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

function game(touch, level, seed = 93) {
    let def, screen = 'play', lives = 4, score = 0;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const G = {
        W: 960, H: 540, HUD: 30, key: {}, hit: {}, isTouch: () => touch,
        rng: (seed) => () => {
            seed = (seed + 0x6D2B79F5) >>> 0;
            let t = seed; t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        },
        dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
        pick: (a) => a[Math.floor(random() * a.length)],
        register: (name, d) => { def = d; },
        get lives() { return lives; },
        loseLife: () => { if (--lives === 0) screen = 'over'; return lives; },
        addScore: (n) => score += n, win: (n) => { score += n; screen = level === 3 ? 'victory' : 'clear'; },
        tone() {}, burst() {}, popup() {}, shake() {}, flash() {}, text() {}
    };
    const math = Object.create(Math); math.random = random;
    runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/dos/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G }, Math: math });
    const s = def.init(level);
    return { s, def, G, state: () => ({ screen, lives, score }), step(input) {
        const prev = G.key; G.key = input; G.hit = {};
        for (const k in input) G.hit[k] = input[k] && !prev[k];
        if (screen === 'play') def.update(s, 1 / 60);
    } };
}

// BFS to a reachable emerald. Read state, but change it only through pad keys.
function steer(s, tick) {
    const p = s.pl, dirs = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]];
    // Plan from the cell the digger is heading for, where its next hop starts.
    const oc = p.c + p.dc, or = p.r + p.dr;
    const start = or * 20 + oc, seen = new Set([start]), q = [[oc, or, null]];
    // A cell right under a bag is only entered from the side, and never
    // while the bag wobbles: from above or below it lands on the digger.
    const underBag = (c, r, side) => s.bags.some(b => b.c === c && b.r === r - 1 && (!side || b.state !== 'rest'));
    // An emerald in the cell ahead is already ours: keep going, rather than
    // turn back mid-hop toward the next one.
    const ahead = dirs.find(d => d[1] === p.dc && d[2] === p.dr);
    if (ahead && s.gem[start]) return { [ahead[0]]: true, a: tick % 2 === 0 };
    // Too close to a monster to follow the plan: step to the free cell
    // furthest from all of them.
    const gap = (c, r) => Math.min(99, ...s.enemies.map(e => Math.abs(e.c + e.dc * e.p - c) + Math.abs(e.r + e.dr * e.p - r)));
    const x = Math.round(p.c + p.dc * p.p), y = Math.round(p.r + p.dr * p.p);
    if (s.power <= 0 && gap(p.c + p.dc * p.p, p.r + p.dr * p.p) < 2.2) {
        const free = dirs.filter(([, dx, dy]) => x + dx >= 0 && x + dx < 20 && y + dy >= 0 && y + dy < 10 &&
            !s.rock[(y + dy) * 20 + x + dx] && !s.bags.some(b => b.c === x + dx && b.r <= y + dy && b.r >= y + dy - 1));
        free.sort((m, n) => gap(x + n[1], y + n[2]) - gap(x + m[1], y + m[2]));
        if (free.length) return { [free[0][0]]: true, a: tick % 2 === 0 };
    }
    let target = null;
    // Face and shoot a monster in an open straight tunnel before it arrives.
    if (s.charge >= 1 && !s.shot && s.power <= 0) {
        for (const e of s.enemies) {
            const dx = e.c + e.dc * e.p - p.c, dy = e.r + e.dr * e.p - p.r;
            const name = Math.abs(dx) < .5 ? (dy < 0 ? 'up' : 'down') : Math.abs(dy) < .5 ? (dx < 0 ? 'left' : 'right') : null;
            if (!name || Math.abs(dx) + Math.abs(dy) > 4 || e.born > 0) continue;
            const dir = dirs.find(d => d[0] === name);
            let clear = true;
            for (let n = 1; n < Math.abs(dx) + Math.abs(dy); n++) {
                const index = (p.r + dir[2] * n) * 20 + p.c + dir[1] * n;
                if (s.dirt[index] || s.rock[index]) clear = false;
            }
            if (clear) return { [name]: true, a: tick % 2 === 0 };
        }
    }
    for (let head = 0; head < q.length; head++) {
        const [c, r, first] = q[head];
        if (first && s.gem[r * 20 + c]) { target = first; break; }
        for (const [name, dx, dy] of dirs) {
            const nc = c + dx, nr = r + dy, index = nr * 20 + nc;
            if (nc < 0 || nc >= 20 || nr < 0 || nr >= 10 || seen.has(index) || s.rock[index]) continue;
            if (s.bags.some(b => b.c === nc && b.r === nr && b.state !== 'fall') || underBag(nc, nr, dx !== 0)) continue;
            seen.add(index); q.push([nc, nr, first || name]);
        }
    }
    const input = { a: tick % 2 === 0 };
    if (target) input[target] = true;
    return input;
}

for (const level of [1, 2, 3]) {
    const d = game(false, level), p = game(true, level);
    for (const key of ['cfg', 'dirt', 'rock', 'gem', 'bags', 'pl']) {
        assert.deepEqual(JSON.parse(JSON.stringify(p.s[key])), JSON.parse(JSON.stringify(d.s[key])), `unchanged ${key}`);
    }
    for (const g of [d, p]) {
        let ticks = 0;
        for (; ticks < 24000 && g.state().screen === 'play'; ticks++) g.step(steer(g.s, ticks));
        assert.equal(g.state().screen, level === 3 ? 'victory' : 'clear', `level ${level}: ${JSON.stringify(g.state())}, ${g.s.left} gems`);
        console.log(`ok   dos ${g.s.touch ? 'phone' : 'desktop'} level ${level}: ${ticks} ticks, ${g.state().lives} lives`);
    }
    const idle = game(true, level);
    for (let i = 0; i < 24000 && idle.state().screen === 'play'; i++) idle.step({});
    assert.equal(idle.state().screen, 'over', 'idle loses');
}

const d = game(false, 1), p = game(true, 1);
for (const g of [d, p]) for (let i = 0; i < 205; i++) g.step({ a: true });
assert.ok(d.s.charge > .99, 'desktop held button still requires a new press');
assert.ok(p.s.charge < .15, 'phone held FIRE retries after normal recharge');
assert.equal(p.s.recharge, d.s.recharge, 'recharge duration is unchanged');

function render(g) {
    let calls = 0; const texts = [], rects = [], scales = [];
    g.G.text = (...a) => texts.push(a);
    const ctx = new Proxy({}, { get: (o, key) => o[key] || ((...args) => {
        calls++;
        if (key === 'rect') rects.push(args);
        if (key === 'scale') scales.push(args);
    }) });
    g.def.draw(g.s, ctx);
    return { calls, texts, rects, scales };
}
for (const level of [1, 2, 3]) {
    const d = game(false, level), p = game(true, level);
    const dr = render(d), pr = render(p);
    assert.ok(pr.calls < dr.calls, 'quieter phone dirt reduces canvas calls');
    assert.ok(pr.scales.some(a => a[0] === 1.15), 'phone sprite enlargement');
    p.s.msg = 'BAG.SYS unstable'; p.s.power = 1.2; p.s.charge = .4;
    const warnings = render(p).texts;
    for (const text of ['BAG.SYS unstable', 'TURBO 2s', 'FIRE 40%']) assert.ok(warnings.some(a => a[0] === text), `simultaneous ${text}`);
    assert.ok(warnings.every(a => a[3].size >= 26 || a[0] === '$'), 'status enlarged');
    console.log(`ok   dos level ${level}: desktop ${dr.calls}, phone ${pr.calls} canvas calls; combined warnings`);
}

if (process.argv.includes('--browser')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            const name = phone ? phone.name : 'desktop';
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('dos')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'dos registration');
            for (const level of [1, 2, 3]) {
                const result = await page.eval(`(function () {
                    const steer = ${steer.toString()}, originalRandom = Math.random;
                    let seed = ${level === 3 ? 5 : 93}, ticks = 0;
                    try {
                        Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
                        SnoGame.debug.start(${level});
                        for (; ticks < 24000 && SnoGame.debug.state().screen === 'play'; ticks++) SnoGame.debug.step(1, (i, s) => steer(s, ticks));
                        return {state: SnoGame.debug.state(), ticks};
                    } finally { Math.random = originalRandom; }
                })()`);
                assert.equal(result.state.screen, level === 3 ? 'victory' : 'clear', `${name} level ${level}: ${JSON.stringify(result)}`);
                console.log(`ok   dos ${name} level ${level}: ${result.ticks} ticks, ${result.state.lives} lives`);
                await page.eval(`SnoGame.debug.start(${level}); SnoGame.debug.step(180, (i,s) => (${steer.toString()})(s,i));`);
                await page.screenshot(`/tmp/dos-${name}-${level}.jpg`);
            }
            // Rendering fixture only: expose simultaneous warnings without
            // changing the states used by the ordinary-input win checks above.
            await page.eval("SnoGame.debug.start(3); Object.assign(SnoGame.debug.s(), {msg: 'BAG.SYS unstable', power: 1.2, charge: .4});");
            await new Promise(r => setTimeout(r, 80));
            await page.screenshot(`/tmp/dos-${name}-warnings.jpg`);
            const idle = await page.eval('(function(){SnoGame.debug.start(1);SnoGame.debug.step(24000,{});return SnoGame.debug.state();})()');
            assert.equal(idle.screen, 'over', `${name}: idle loses`);
            assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
            assert.deepEqual(page.problems, []);
            await page.eval('SnoGame.quit()');
        }
    } finally { await close(); }
}
