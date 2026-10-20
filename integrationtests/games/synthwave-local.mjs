// Race and mobile feedback checks without Chrome, while browser checks queue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(touch) {
    let def, deaths = 0;
    const text = [], effects = [];
    const G = {
        W: 960, H: 540, HUD: 30, key: {}, level: 1,
        isTouch: () => touch, register: (_, value) => { def = value; },
        clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
        lerp: (a, b, p) => a + (b - a) * p,
        rng: (seed) => () => {
            seed = (seed + 0x6D2B79F5) >>> 0;
            let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        },
        rnd: (a, b) => (a + b) / 2,
        text: (value, x, y, opts) => text.push({ value, x, y, ...opts }),
        die: () => { deaths++; },
    };
    for (const name of ['tone', 'noise', 'sfx', 'shake', 'burst', 'flash', 'popup', 'addScore', 'win']) {
        G[name] = (...args) => effects.push({ name, args });
    }
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, { get: (_, name) => name === 'canvas' ? { width: 960 } : name.startsWith('create') ? () => gradient : () => {} });
    const document = { createElement: () => ({ getContext: () => ctx }) };
    vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/synthwave/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G }, document });
    return { G, def, text, effects, ctx, deaths: () => deaths };
}

const phone = fixture(true), desktop = fixture(false);
for (const level of [1, 2, 3]) {
    phone.G.level = desktop.G.level = level;
    const a = phone.def.init(level), b = desktop.def.init(level);
    assert.equal(JSON.stringify(a.segs), JSON.stringify(b.segs), 'phone preserves track and hazards');
    assert.equal(JSON.stringify(a.cars), JSON.stringify(b.cars), 'phone preserves traffic');
    for (let i = 0; i < 1800; i++) {
        const input = { up: i % 200 < 180, down: i % 200 >= 180, right: i % 360 < 90, left: i % 360 > 270, a: i % 600 < 80 };
        phone.G.key = desktop.G.key = input;
        phone.def.update(a, 1 / 60); desktop.def.update(b, 1 / 60);
        for (const key of ['pos', 'x', 'vx', 'speed', 'nitro', 'slip', 'time', 'cp', 'wind']) assert.equal(a[key], b[key], `level ${level}: preserves ${key}`);
    }
}
let s = phone.def.init(3);
s.gateMsg = 'CHECKPOINT +20s'; s.gateT = 1; s.msg = s.gateMsg; s.msgT = 1;
s.hazardMsg = 'HEAD-ON!'; s.hazardT = 1;
s.slip = 1; s.gust = 1; s.nearT = 1;
phone.def.draw(s, phone.ctx);
for (const message of ['CHECKPOINT +20s', 'OIL! · HEAD-ON!', 'CROSSWIND  > > >', 'NEAR MISS', 'TIME', 'NITRO', 'COURSE']) {
    const item = phone.text.find((t) => t.value === message);
    assert.ok(item, `combined feedback includes ${message}`);
    assert.ok(item.size >= 24, `${message} remains legible on a phone`);
}
const warnings = phone.text.filter((t) => ['CHECKPOINT +20s', 'OIL! · HEAD-ON!', 'CROSSWIND  > > >'].includes(t.value));
assert.equal(new Set(warnings.map((t) => t.y)).size, 3);
assert.ok(warnings.every((t) => t.y < 270), 'warnings remain above approaching road traffic');
s = phone.def.init(3); phone.G.level = 3; phone.G.key = { up: true };
const oncoming = s.cars.find((car) => car.dir < 0);
oncoming.z = s.pos + 1050 - 1; oncoming.off = s.x; oncoming.speed = 0;
phone.def.update(s, 1 / 60);
assert.equal(s.hazardMsg, 'HEAD-ON!', 'a real collision raises the mobile hazard notice');
s.pos = 5 * 200; s.speed = 12000;
s.segs[10].gate = 'checkpoint';
phone.def.update(s, 1 / 60);
assert.ok(s.gateT > 0, 'crossing a checkpoint raises its own notice');
assert.equal(s.hazardMsg, 'HEAD-ON!', 'the checkpoint preserves a recent collision warning');
assert.ok(s.hazardT > 0);
s = phone.def.init(1); phone.G.level = 1; phone.G.key = {};
const passing = s.cars.find((car) => car.kind === 'car');
passing.z = 1049; passing.off = passing.goal = s.x + 0.35;
passing.speed = passing.v = 0; s.nitro = 0.3;
phone.def.update(s, 1 / 60);
assert.ok(s.nearT > 0, 'passing close to traffic raises the larger mobile near-miss notice');
assert.ok(s.nitro >= 0.4, 'near misses still refill nitro');
s = phone.def.init(1); phone.G.key = {};
const idleTicks = Math.ceil((s.time + 1) * 60);
for (let i = 0; i < idleTicks; i++) phone.def.update(s, 1 / 60);
assert.equal(s.pos, 0, 'idle cannot make progress');
assert.ok(phone.deaths() > 0, 'idle runs still fail the clock');
// The campaign bot (bots/synthwave.js) drives each level with ordinary
// buttons. Besides the win, the run must have used what the level is about:
// bends taken, traffic met, nitro burnt, every checkpoint crossed with a
// clock that is fair (time left over) but not idle (it still runs low).
const racer = fixture(true);
const bot = vm.runInNewContext(readFileSync(new URL('./bots/synthwave.js', import.meta.url), 'utf8'));
function race(level, strategy) {
    let screen = 'play', ticks = 0, boost = 0, bends = 0, low = Infinity;
    racer.G.level = level;
    racer.G.win = () => { screen = 'won'; };
    racer.G.die = () => { screen = 'over'; };
    const s = racer.def.init(level), mem = {};
    for (; ticks < 30000 && screen === 'play'; ticks++) {
        racer.G.key = strategy(s, racer.G, mem);
        racer.def.update(s, 1 / 60);
        if (s.boost) boost++;
        if (Math.abs(s.segs[Math.floor((s.pos + 1050) / 200)].curve) > 1.5 && s.speed > 6000) bends++;
        low = Math.min(low, s.time);
    }
    const passed = s.cars.filter((c) => c.passed).length;
    return { level, screen, seconds: ticks / 60, cp: s.cp, cps: s.L.cps, left: s.time, low, boost, bends, passed };
}
for (const level of [1, 2, 3]) {
    const r = race(level, bot.play);
    assert.equal(r.screen, 'won', `level ${level}: ordinary controls reach the finish (${JSON.stringify(r)})`);
    assert.equal(r.cp, r.cps, `level ${level}: every checkpoint is crossed on the way`);
    assert.ok(r.left > 5 && r.left < 60, `level ${level}: the clock is fair but tight (${r.left.toFixed(1)}s left)`);
    assert.ok(r.seconds > 30 && r.seconds < 180, `level ${level}: a race of about one to three minutes (${r.seconds.toFixed(0)}s)`);
    assert.ok(r.boost > 60 && r.bends > 60 && r.passed > 5, `level ${level}: nitro, bends and traffic all come up (${JSON.stringify(r)})`);
}
assert.equal(race(3, () => ({})).screen, 'over', 'idling on the finale still loses to the clock');
console.log('ok synthwave: matching physics and hazards, legible combined warnings, campaign bot wins 1/2/3 with fair clocks, idle failure');
