import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function fixture(touch) {
    let def, s, screen, codes = {};
    const labels = [], strokes = [];
    const G = { W: 960, H: 540, HUD: 30, t: 0, lives: 4, level: 1, hit: {}, mouse: {},
        isTouch: () => touch, register: (_, value) => { def = value; },
        down: (code) => !!codes[code],
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        dist: (x, y, a, b) => Math.hypot(x - a, y - b),
        circ: (x, y, r, a, b, q) => Math.hypot(x - a, y - b) < r + q,
        rng: (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = Math.imul(seed ^ seed >>> 15, seed | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; },
        pick: (a) => a[0], rnd: (a, b) => (a + b) / 2,
        loseLife: () => { if (--G.lives <= 0) screen = 'over'; return G.lives; },
        addLife: (max) => { G.lives = Math.min(max, G.lives + 1); },
        win: () => { screen = G.level === 3 ? 'victory' : 'clear'; },
        text: (value, x, y, opts) => labels.push({ value, x, y, ...opts }),
    };
    for (const name of ['tone','noise','sfx','burst','shake','flash','popup','addScore']) G[name] = () => {};
    const ctx = new Proxy({}, { get: (obj, key) => key === 'stroke' ? () => strokes.push({ width: obj.lineWidth, color: obj.strokeStyle }) : () => {} });
    vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/terminal/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    G.debug = { errors: [], s: () => s, state: () => ({ screen }),
        start: (level) => { G.level = level; G.lives = 4; s = def.init(level); screen = 'play'; },
        step: (n, input) => { for (let i = 0; i < n && screen === 'play'; i++) { const c = typeof input === 'function' ? input(i, s) : input; codes = c.codes || {}; G.hit = { a: !!c.a && !G.key?.a }; G.key = c; G.mouse = c.mouse || {}; def.update(s, 1 / 60); G.t += 1 / 60; } },
    };
    return { G, def, labels, strokes, ctx };
}
const phone = fixture(true), desktop = fixture(false);
for (const level of [1, 2, 3]) {
    phone.G.debug.start(level); desktop.G.debug.start(level);
    const c = { codes: { KeyD: true, ArrowUp: true } };
    for (let i = 0; i < 180; i++) { phone.G.debug.step(1, c); desktop.G.debug.step(1, c); }
    const compare = (s) => JSON.stringify({ ...s, touch: undefined });
    assert.equal(compare(phone.G.debug.s()), compare(desktop.G.debug.s()), 'phone retains gameplay, movement and independent firing');
    assert.ok(!phone.def.hud(phone.G.debug.s()).includes('W0/0'), 'fork-bomb mode must not display nonexistent waves');
}
phone.G.debug.start(2); const s = phone.G.debug.s();
s.queue = []; s.wave = 0;
s.enemies = [
    { kind: '>', x: 100, y: 200, mode: 'aim', mt: 0.1, dx: 1, dy: 0, dash: 0.85, born: 0 },
    { kind: 'd', x: 400, y: 200, cool: 0.1, born: 0 },
    { kind: '#', x: 600, y: 200, hp: 7, born: 0 },
];
s.ebul = [{ x: 500, y: 300 }]; s.shots = [{ x: 510, y: 300, vx: 100, vy: 0 }];
phone.def.draw(s, phone.ctx);
assert.ok(phone.strokes.some((v) => v.width === 3 && v.color === '#ff5a3c'), 'pipe aim remains visible alongside daemon warning');
assert.ok(phone.labels.some((v) => v.value === 'd' && v.color === '#ff5a3c'), 'daemon prefire cue');
assert.ok(phone.labels.some((v) => v.value === '7' && v.size >= 20), 'root health is readable');
assert.ok(phone.labels.some((v) => v.value === 'o' && v.size >= 20), 'enemy shots readable');
assert.ok(!phone.labels.some((v) => v.value.includes('COMMAND')), 'phone skips decorative process table');
phone.G.debug.start(2);
const nests = phone.G.debug.s();
nests.enemies = nests.enemies.filter((e) => e.kind === 'S');
assert.ok(nests.enemies.length > 0 && !nests.cfg.forkBomb);
assert.ok(phone.def.hud(nests).includes('P' + nests.enemies.length), 'normal progress counts nests that still prevent victory');
for (const [ax, ay] of [[-1, 0], [0, -1]]) {
    phone.G.debug.start(2);
    const edge = phone.G.debug.s();
    edge.p = { ...edge.p, x: 19, y: 47, ax, ay, inv: 0 };
    edge.enemies = [{ kind: '#', x: 200, y: 54, hp: 7, born: 0 }];
    phone.labels.length = 0; phone.def.draw(edge, phone.ctx);
    const hp = phone.labels.find((v) => v.value === '7');
    const aim = phone.labels.find((v) => v.value === '.');
    assert.ok(hp.y - hp.size / 2 >= phone.G.HUD && Math.abs(hp.y - 54) >= 30, 'top root health clears HUD and body');
    assert.ok(aim.x - aim.size / 2 >= 0 && aim.x + aim.size / 2 <= phone.G.W);
    assert.ok(aim.y - aim.size / 2 >= phone.G.HUD && aim.y + aim.size / 2 <= phone.G.H, 'edge aim cue stays visible');
}
for (const f of [phone, desktop]) {
    f.G.debug.start(1);
    const state = f.G.debug.s(); state.time = 0; state.p.inv = 0;
    state.ebul = [{ x: state.p.x + 12, y: state.p.y, vx: 0, vy: 0 }];
    f.G.debug.step(1, {});
    assert.equal(f.G.lives, 4, 'a nearby bullet miss preserves the collision boundary');
    state.ebul = [{ x: state.p.x, y: state.p.y, vx: 0, vy: 0 }];
    f.G.debug.step(1, {});
    assert.equal(f.G.lives, 3, 'a bullet hit still costs a life');
    assert.equal(state.msg, 'Segmentation fault (core dumped)', 'damage cue persists');
    assert.ok(state.p.inv > 2, 'damage keeps the existing recovery interval');
    state.ebul = [{ x: state.p.x + 12, y: state.p.y, vx: 0, vy: 0 }];
    f.G.debug.step(1, { a: true, codes: { KeyD: true, ArrowUp: true } });
    assert.equal(state.p.bombs, 0, 'bomb remains accessible while both sticks are held');
    assert.equal(state.ebul.length, 0, 'bomb clears enemy shots');
    assert.ok(state.shots.some((b) => b.vy < 0), 'firing stick works alongside bomb and movement');
}
const BOT = vm.runInNewContext(readFileSync(new URL('./bots/terminal.js', import.meta.url), 'utf8'));
const driver = readFileSync(new URL('./terminal-bot.js', import.meta.url), 'utf8');
for (const f of [phone, desktop]) {
    const result = vm.runInNewContext(driver, { SnoGame: f.G, BOT });
    console.log(JSON.stringify({ touch: f === phone, ...result }));
    assert.ok(result.wins.every((v) => v.screen === (v.level === 3 ? 'victory' : 'clear')), 'the campaign bot wins levels 1/2/3 with ordinary controls');
    assert.ok(result.wins.every((v) => v.ticks < 180 * 60), 'every level takes under three minutes');
    const [one, two, three] = result.wins;
    assert.equal(one.kinds, '&Zd', 'level 1 brings zombies, forks and daemons');
    assert.ok(['#', '>', 'S'].every((k) => two.kinds.includes(k)), 'level 2 brings root shells, pipes and [fork] nests');
    assert.ok(three.kinds.includes('I') && three.kinds.includes('&'), 'level 3 is the fork bomb and init');
    assert.ok(result.wins.some((v) => v.bombs > 0) && result.wins.some((v) => v.picks > 0), 'bombs and pickups come into play');
    assert.ok(result.idle.every((v) => v.screen === 'over'), 'idle fails');
}
console.log('ok terminal: independent sticks, combined threat cues, campaign bot wins 1/2/3 meeting every process type, idle failures');
