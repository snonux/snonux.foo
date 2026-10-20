#!/usr/bin/env node
// Gravity Well phone rendering, pad response and ordinary-input play checks.
// Run: node integrationtests/games/cosmos.mjs [--browser]
import assert from 'node:assert/strict';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function game(touch, level, seed = 42) {
    let def,
        screen = 'play',
        lives = 4,
        score = 0;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const G = {
        W: 960,
        H: 540,
        HUD: 30,
        STEP: 1 / 60,
        key: {},
        hit: {},
        isTouch: () => touch,
        rng: (n) => () => {
            n = (n + 0x6d2b79f5) >>> 0;
            let t = n;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        },
        rnd: (a, b) => a + random() * (b - a),
        clamp: (v, a, b) => Math.max(a, Math.min(v, b)),
        dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
        closestOnSeg: (px, py, ax, ay, bx, by) => {
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) /
                        ((bx - ax) ** 2 + (by - ay) ** 2 || 1)
                )
            );
            return { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
        },
        get lives() {
            return lives;
        },
        loseLife: () => {
            if (--lives === 0) screen = 'over';
            return lives;
        },
        win: (n) => {
            screen = level === 3 ? 'victory' : 'clear';
            score += n;
        },
        addScore: (n) => (score += n),
        register: (name, d) => (def = d),
        sfx() {},
        tone() {},
        noise() {},
        burst() {},
        popup() {},
        shake() {},
        flash() {},
        text() {}
    };
    const math = Object.create(Math);
    math.random = random;
    runInNewContext(
        readFileSync(
            new URL(
                '../../internal/generator/templates/themes/cosmos/game.js',
                import.meta.url
            ),
            'utf8'
        ),
        { window: { SnoGame: G }, Math: math }
    );
    const s = def.init(level);
    return {
        s,
        def,
        G,
        state: () => ({ screen, lives, score }),
        step(input) {
            const prev = G.key;
            G.key = input;
            G.hit = {};
            for (const k in input) G.hit[k] = input[k] && !prev[k];
            if (screen === 'play') def.update(s, 1 / 60);
        }
    };
}
function steer(s, tick) {
    const p = s.ship;
    const dx = (v) => ((v + 1440) % 960) - 480,
        dy = (v) => ((v + 765) % 510) - 255;
    const angle = (v) => Math.atan2(Math.sin(v), Math.cos(v));
    let target = null,
        best = Infinity;
    for (const k of s.rocks) {
        const dist = Math.hypot(dx(k.x - p.x), dy(k.y - p.y));
        if (dist < best && k.warp <= 0) {
            target = k;
            best = dist;
        }
    }
    let a = p.a;
    if (target) {
        const t = best / 430;
        a = Math.atan2(
            dy(target.y - p.y) + (target.vy - p.vy) * t,
            dx(target.x - p.x) + (target.vx - p.vx) * t
        );
    }
    let urgent = false;
    for (const w of s.wells) {
        const x = dx(p.x + p.vx * 0.7 - w.x),
            y = dy(p.y + p.vy * 0.7 - w.y),
            d = Math.hypot(x, y);
        // The pulsar's beam is kept at arm's length like a core.
        if (d < Math.max(w.r + Math.sqrt(w.gm / 270) * 1.5 + 30, w.beam ? w.beam + 45 : 0)) {
            a = Math.atan2(y, x);
            urgent = true;
        }
    }
    let danger = s.wells.some(
        (w) => Math.hypot(dx(p.x - w.x), dy(p.y - w.y)) < w.r + 35
    );
    danger ||= s.rocks.some(
        (k) =>
            k.warp <= 0 &&
            Math.hypot(
                dx(k.x + k.vx * 0.3 - p.x - p.vx * 0.3),
                dy(k.y + k.vy * 0.3 - p.y - p.vy * 0.3)
            ) <
                k.r + 25
    );
    for (const w of s.wells) {
        if (!w.beam) continue;
        const x = dx(p.x - w.x),
            y = dy(p.y - w.y);
        const c = Math.cos(w.ba + w.bw * 0.3),
            n = Math.sin(w.ba + w.bw * 0.3);
        if (
            x * c + y * n > 0 &&
            x * c + y * n < w.beam &&
            Math.abs(x * n - y * c) < 45
        )
            danger = true;
    }
    const err = angle(a - p.a);
    return {
        left: err < -0.045,
        right: err > 0.045,
        up: urgent
            ? Math.abs(err) < 0.5
            : tick % 120 < 55 && Math.abs(err) < 0.5,
        a: true,
        b: danger && p.inv <= 0 && s.hyper <= 0
    };
}
// Drawing changes must not alter seeded layouts or the ordinary pad controls.
for (const level of [1, 2, 3]) {
    const d = game(false, level),
        p = game(true, level);
    assert.equal(JSON.stringify(d.s.rocks), JSON.stringify(p.s.rocks));
    assert.equal(JSON.stringify(d.s.wells), JSON.stringify(p.s.wells));
    for (let i = 0; i < 180; i++) {
        const input = steer(d.s, i);
        d.step(input);
        p.step(input);
    }
    assert.equal(JSON.stringify(d.s.ship), JSON.stringify(p.s.ship));
    assert.equal(JSON.stringify(d.s.rocks), JSON.stringify(p.s.rocks));
    function draw(g) {
        let calls = 0,
            gradients = 0;
        const ctx = new Proxy(
            {},
            {
                get: (o, k) =>
                    o[k] ||
                    (() => {
                        calls++;
                        if (k === 'createRadialGradient') {
                            gradients++;
                            return { addColorStop() {} };
                        }
                    })
            }
        );
        g.def.draw(g.s, ctx);
        return { calls, gradients };
    }
    const desktop = draw(d),
        phone = draw(p);
    assert.equal(phone.gradients, 0);
    assert.ok(
        phone.calls < desktop.calls * 0.8,
        'phone must reduce canvas calls by 20%'
    );
    console.log(
        `ok   cosmos level ${level}: identical physics; desktop ${desktop.calls}, phone ${phone.calls} canvas calls`
    );
    const idle = game(true, level);
    for (let i = 0; i < 36000 && idle.state().screen === 'play'; i++)
        idle.step({});
    assert.equal(idle.state().screen, 'over', `level ${level}: idle loses`);
}
const response = game(true, 1);
response.step({ left: true, up: true, a: true });
assert.ok(response.s.ship.a < -Math.PI / 2);
assert.ok(Math.hypot(response.s.ship.vx, response.s.ship.vy) > 0);
assert.equal(response.s.shots.length, 1, 'holding FIRE shoots immediately');
response.step({ b: true });
assert.ok(response.s.hyper > 0, 'HYPER responds on press');
console.log('ok   cosmos immediate turn/thrust/FIRE/HYPER and idle losses');
// Keep random hyperspace and later waves reproducible for this simple pilot.
// The controller only reads state; all actions use buttons available on the pad.
function playLevel(level, controller) {
    const previous = Math.random;
    const runSeed = level === 3 ? 5 : 1;
    let seed = runSeed, ticks = 0;
    try {
        Math.random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        SnoGame.debug.start(level);
        for (; ticks < 36000 && SnoGame.debug.state().screen === 'play'; ticks++) {
            SnoGame.debug.step(1, (i, s) => controller(s, ticks));
        }
        return { state: SnoGame.debug.state(), ticks, seed: runSeed };
    } finally {
        Math.random = previous;
    }
}

if (process.argv.includes('--browser')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            const name = phone ? phone.name : 'desktop';
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('cosmos')");
            await page.waitFor(
                'SnoGame.debug.state() && SnoGame.debug.state().registered',
                'cosmos registration'
            );
            for (const level of [1, 2, 3]) {
                const result = await page.eval(
                    `(${playLevel.toString()})(${level}, ${steer.toString()})`
                );
                assert.equal(
                    result.state.screen,
                    level === 3 ? 'victory' : 'clear',
                    `${name} level ${level}: ${JSON.stringify(result)}`
                );
                console.log(
                    `ok   cosmos ${name} level ${level}: ${result.ticks} ticks, ${result.state.lives} lives left (seed ${result.seed})`
                );
                await page.eval(
                    `SnoGame.debug.start(${level});SnoGame.debug.step(180,(i,s)=>(${steer.toString()})(s,i));`
                );
                await page.screenshot(`/tmp/cosmos-${name}-${level}.jpg`);
            }
            const idle = await page.eval(
                '(function(){SnoGame.debug.start(1);SnoGame.debug.step(36000,{});return SnoGame.debug.state();})()'
            );
            assert.equal(idle.screen, 'over', `${name}: idle loses`);
            assert.deepEqual(
                await page.eval('SnoGame.debug.errors.slice()'),
                []
            );
            assert.deepEqual(page.problems, []);
            await page.eval('SnoGame.quit()');
        }
    } finally {
        await close();
    }
}
