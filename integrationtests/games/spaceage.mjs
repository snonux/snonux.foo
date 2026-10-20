import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';
let touch = false,
    labels = [],
    calls = [];
let def, s, screen;
const G = {
    W: 960,
    H: 540,
    HUD: 30,
    key: {},
    hit: {},
    cam: {},
    lives: 4,
    t: 0,
    isTouch: () => touch,
    register: (_, d) => (def = d),
    rng: (seed) => () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    lerp: (a, b, t) => a + (b - a) * t,
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    dist: (x, y, a, b) => Math.hypot(x - a, y - b),
    closestOnSeg: (x, y, a, b, c, d) => {
        let t = G.clamp(((x - a) * (c - a) + (y - b) * (d - b)) / ((c - a) ** 2 + (d - b) ** 2), 0, 1);
        return { x: a + (c - a) * t, y: b + (d - b) * t };
    },
    die: () => {
        screen = 'dead';
    },
    win: () => (screen = 'clear'),
};
for (let n of ['noise', 'tone', 'burst', 'sfx', 'popup', 'addScore', 'shake', 'flash']) G[n] = () => {};
vm.runInNewContext(fs.readFileSync('internal/generator/templates/themes/spaceage/game.js', 'utf8'), {
    window: { SnoGame: G },
});
G.debug = {
    start: (l) => {
        s = def.init(l);
        screen = 'play';
        G.t = 0;
    },
    s: () => s,
    state: () => ({ screen }),
    errors: [],
    step: (n, fn) => {
        for (let i = 0; i < n && screen === 'play'; i++) {
            G.key = typeof fn === 'function' ? fn(i, s, G) : fn;
            def.update(s, 1 / 60);
            G.t += 1 / 60;
        }
    },
};
// The campaign bot (bots/spaceage.js) flies each level; the run records
// what it met on the way: pads reached, cargo aboard, canisters, refills.
const BOT = fs.readFileSync('integrationtests/games/bots/spaceage.js', 'utf8');
const bot = `(function (bot) {
    var G = SnoGame, wins = [], idle = [];
    [1, 2, 3].forEach(function (level) {
        var mem = {}, cargo = false, cans = 0, refills = 0, fuel = 0;
        G.debug.start(level);
        for (var i = 0; i < 20000 && G.debug.state().screen === 'play'; i++) {
            var s = G.debug.s();
            fuel = s.ship.fuel;
            G.debug.step(1, bot.play(s, G, mem));
            s = G.debug.s();
            cargo = cargo || s.ship.cargo;
            cans = Math.max(cans, s.cans.filter(function (c) { return c.taken; }).length);
            if (s.ship.fuel > fuel + 30) refills++;
        }
        wins.push({ level: level, screen: G.debug.state().screen, step: G.debug.s().step, cargo: cargo, cans: cans, refills: refills, time: G.debug.s().t });
    });
    [1, 2, 3].forEach(function (level) {
        G.debug.start(level);
        for (var i = 0; i < 20000 && G.debug.state().screen === 'play'; i++) G.debug.step(1, {});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: wins, idle: idle, errors: G.debug.errors.slice() };
})(${BOT})`;
const checkRun = (result, victory) => {
    for (const w of result.wins) assert.equal(w.screen, w.level === 3 ? victory : 'clear', JSON.stringify(w));
    assert.deepEqual(result.wins.map((w) => w.cargo), [false, true, true], 'cargo is hauled on levels 2 and 3');
    assert.ok(result.wins[0].refills >= 1 && result.wins[1].refills >= 1, 'a beacon and a cargo pad refill the tank');
    assert.ok(result.wins[1].cans >= 1, 'the canister on the haul is collected');
    for (const idle of result.idle) assert.ok(['over', 'dead'].includes(idle.screen), JSON.stringify(idle));
};
for (touch of [false, true]) checkRun(JSON.parse(JSON.stringify(vm.runInNewContext(bot, { SnoGame: G, Math }))), 'clear');
for (let level = 1; level <= 3; level++) {
    touch = false;
    let a = def.init(level);
    touch = true;
    let b = def.init(level);
    const comparable = (q) => JSON.stringify({ ...q, touch: undefined, msg: undefined });
    assert.equal(comparable(a), comparable(b));
    G.key = { a: true };
    for (let i = 0; i < 30; i++) {
        def.update(a, 1 / 60);
        def.update(b, 1 / 60);
    }
    assert.equal(comparable(a), comparable(b), 'thrust and gravity unchanged');
}
// Landing safety is identical on either device: presentation cannot soften a crash.
for (touch of [false, true]) {
    for (const [speed, tilt, expected] of [
        [20, 0, 'play'],
        [70, 0, 'dead'],
        [20, 0.5, 'dead'],
    ]) {
        G.debug.start(1);
        const pad = s.pads[0];
        Object.assign(s.ship, {
            x: pad.cx,
            y: pad.cy - 12,
            vx: 0,
            vy: speed,
            ang: tilt,
        });
        G.debug.step(1, {});
        assert.equal(screen, expected);
        if (expected === 'play') assert.equal(s.step, 1, 'safe touchdown reaches beacon');
    }
}
const turned = (phone, n) => {
    touch = phone;
    G.debug.start(1);
    G.debug.step(n, { right: true });
    return s.ship.ang;
};
assert.ok(turned(true, 6) < turned(false, 6) * 0.65, 'short phone correction finer');
assert.ok(turned(false, 60) - turned(true, 60) < 0.25, 'held turn reaches desktop rate');
touch = true;
G.debug.start(1);
G.debug.step(30, { right: true });
let before = s.ship.ang;
G.debug.step(1, { left: true });
assert.ok(before - s.ship.ang < 0.03, 'reversal starts fine');
G.debug.start(1);
G.debug.step(30, { right: true });
const landingPad = s.pads[0];
Object.assign(s.ship, { x: landingPad.cx, y: landingPad.cy - 12, vx: 0, vy: 20, ang: 0 });
G.debug.step(1, { right: true });
assert.ok(s.ship.landed >= 0, 'the fixture must actually land');
G.debug.step(30, {});
G.debug.step(1, { right: true, a: true });
before = s.ship.ang;
G.debug.step(1, { right: true });
assert.ok(s.ship.ang - before < 0.03, 'same-direction takeoff press starts fine after seated release');
G.text = (text, x, y, options) => labels.push({ text, x, y, ...options });
const ctx = new Proxy(
    {},
    {
        get:
            (_, name) =>
            (...args) => {
                calls.push({ name, args });
                if (name === 'createLinearGradient') return { addColorStop() {} };
            },
        set: () => true,
    },
);
const count = (phone) => {
    touch = phone;
    s = def.init(2);
    s.shells = [{ x: 100, y: 200 }];
    labels = [];
    calls = [];
    def.draw(s, ctx);
    return calls.length;
};
let desktopCalls = count(false),
    phoneCalls = count(true);
assert.ok(phoneCalls < desktopCalls);
console.log(`spaceage phone draw calls ${phoneCalls}, desktop ${desktopCalls} (level 2 with shell)`);
for (let text of ['DESC', 'SIDE', 'TILT']) assert.ok(labels.some((l) => l.text === text && l.size >= 26 && l.y > 30));
assert.ok(
    !calls.some((c) => c.name === 'fillRect' && c.args[1] > 30 && c.args[3] > 15 && c.args[2] > 100),
    'no opaque instrument rectangle',
);
assert.ok(
    calls.some((c) => c.name === 'arc' && c.args[0] === 100 && c.args[2] === 4),
    'lethal shell keeps bright core',
);
s.ship.ang = 1;
labels = [];
def.draw(s, ctx);
assert.ok(labels.some((l) => l.text === 'OFF' && l.x === 854), 'unsafe tilt is OFF, not a speed');
assert.ok(!labels.some((l) => l.text === 'FAST' && l.x === 854));
console.log(
    'ok spaceage local: unchanged geometry/thrust, landing limits, precise short/held/reverse turns, transparent readable instruments, fewer calls, input wins with refills, canister and cargo, idle failures',
);
if (!process.argv.includes('--local')) {
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(base + '/index.html');
            await page.eval("SnoGame.launch('spaceage')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'registered');
            const result = await page.eval(bot);
            checkRun(result, 'victory');
            assert.deepEqual(result.errors, []);
            console.log('ok spaceage browser ' + (phone?.name || 'desktop') + ': input wins 1/2/3, idle failures');
        }
    } finally {
        await close();
    }
}
