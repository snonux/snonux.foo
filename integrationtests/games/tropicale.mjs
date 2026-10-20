#!/usr/bin/env node
// Phone presentation regressions using the engine's actual tile physics.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let def, touch = false, over = false;
const G = { W: 960, H: 540, HUD: 30, t: 0, cam: { x: 0, y: 0 }, lives: 4,
    key: {}, hit: {}, isTouch: () => touch, register: (_, game) => { def = game; },
    loseLife() { if (--this.lives <= 0) over = true; return this.lives; },
    gameOver() { over = true; }, addLife() { this.lives = Math.min(5, this.lives + 1); }
};
for (const method of ['sfx', 'burst', 'popup', 'noise', 'tone', 'addScore', 'win']) G[method] = () => {};
const shared = readFileSync(new URL('../../internal/generator/templates/shared/games.js', import.meta.url), 'utf8');
vm.runInNewContext(shared.slice(shared.indexOf('    G.clamp ='), shared.indexOf('    // Saved progress:')), { G, Math });
vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/tropicale/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
function render(s) {
    const calls = [], texts = [];
    G.text = (text, x, y, opts) => texts.push({ text, x, y, ...opts });
    const ctx = new Proxy({}, { get: (_, key) => key === 'createLinearGradient'
        ? () => ({ addColorStop() {} }) : (...args) => calls.push({ key, args }), set: () => true });
    def.draw(s, ctx); return { calls, texts };
}
for (let level = 1; level <= 3; level++) {
    touch = false; const desktop = def.init(level);
    touch = true; const phone = def.init(level);
    assert.equal(JSON.stringify({ ...phone, touch: undefined }), JSON.stringify({ ...desktop, touch: undefined }), `level ${level}: phone preserves world and rules`);
}
assert.deepEqual(Array.from(def.touch.hide), ['up', 'down', 'b']);
assert.equal(def.touch.a, 'JUMP');
let s = def.init(3);
assert.equal(def.hud(s), 'PINE 0/100 75s');
s.cam = 1500; s.p.x = 1600; s.p.inv = 0; s.tideT = 6.5;
s.foes = [
    { kind: 'gull', x: 1700, y: 150, vx: 0, home: 1700, state: 1, tx: 1600, ty: 360 },
    { kind: 'monkey', x: 1800, y: 160, t: 0.2 },
    { kind: 'drip', x: 1900, y: 96, w: 16, h: 26, state: 1 }
];
s.shots = [{ x: 1750, y: 250 }]; s.pines = [{ x: 1650, y: 350 }];
G.t = 0.2;
const both = render(s);
assert.equal(both.texts.filter(t => t.text === '!' && t.size >= 28).length, 3, 'gull, monkey and falling-rock warnings coexist');
assert.ok(both.texts.some(t => t.text.startsWith('SURGE!') && t.size >= 28), 'surge warning remains readable with enemy warnings');
assert.ok(both.calls.some(c => c.key === 'ellipse' && c.args[0] === 1750 && c.args[2] === 9), 'coconut gets a contrasting rim');
assert.ok(both.calls.some(c => c.key === 'ellipse' && c.args[0] === 1650 && c.args[2] === 10), 'fruit route has a contrasting rim');
assert.ok(both.calls.some(c => c.key === 'moveTo' && c.args[0] === 1599), 'runner keeps a contrasting outline');
// More visible route fruit adds geometry while retaining four colour fills.
s.pines.push({ x: 1682, y: 350 });
const extraFruit = render(s);
assert.equal(extraFruit.calls.filter(c => c.key === 'fill').length, both.calls.filter(c => c.key === 'fill').length, 'fruit raster fills are batched');
assert.equal(extraFruit.calls.filter(c => c.key === 'ellipse').length, both.calls.filter(c => c.key === 'ellipse').length + 3, 'batch preserves each fruit body and contrast ring');
const cost = extraFruit.calls.length;
s.springs.push({ x: 30000, y: 300 }); s.flags.push({ x: 30000, y: 300 }); s.shots.push({ x: 30000, y: 200 });
assert.equal(render(s).calls.length, cost, 'distant objects add no canvas work');
// Release cuts a jump; a miss past coyote time does not create an air jump.
s = def.init(1); G.key = { a: true }; G.hit = { a: true };
def.update(s, 1 / 60); assert.ok(s.p.vy < -500);
G.key = {}; G.hit = {}; def.update(s, 1 / 60); assert.ok(s.p.vy >= -240);
s.p.ground = false; s.p.coyote = -1; s.p.vy = 50; G.hit = { a: true }; G.key = { a: true };
def.update(s, 1 / 60); assert.ok(s.p.vy > 0, 'late jump miss preserves falling');
// A jump tapped just before landing remains buffered after the finger lifts.
s = def.init(1); s.p.y -= 2; s.p.vy = 160; s.p.ground = false; s.p.coyote = -1;
G.key = { a: true }; G.hit = { a: true }; def.update(s, 1 / 60);
assert.ok(s.p.ground, 'buffer fixture lands this tick');
G.key = {}; G.hit = {}; def.update(s, 1 / 60);
assert.ok(s.p.vy < 0, 'early tap is remembered on landing');
// Collect and enemy collision rules still work on the phone.
s = def.init(1); G.key = {}; G.hit = {}; G.lives = 4;
s.pines = [{ x: s.p.x + 10, y: s.p.y + 14 }]; def.update(s, 0); assert.equal(s.got, 1);
s.foes = [{ kind: 'urchin', x: s.p.x, y: s.p.y, w: 24, h: 22 }]; def.update(s, 0); assert.equal(G.lives, 3);
for (const level of [1, 2, 3]) {
    s = def.init(level); G.lives = 4; over = false; G.key = {}; G.hit = {};
    for (let i = 0; i < 6000 && !over; i++) { G.t += 1 / 60; def.update(s, 1 / 60); }
    assert.ok(over, `level ${level}: idle loses to rising flood`);
}
let world, screen, held;
G.win = () => { screen = G.level === 3 ? 'victory' : 'clear'; };
G.gameOver = () => { screen = 'over'; };
G.loseLife = () => { if (--G.lives <= 0) screen = 'over'; return G.lives; };
G.debug = {
    start(level) { G.level = level; G.lives = 4; G.t = 0; G.key = {}; G.hit = {}; held = {}; world = def.init(level); screen = 'play'; },
    state: () => ({ screen, lives: G.lives }), s: () => world,
    step(n, input) {
        for (let i = 0; i < n && screen === 'play'; i++) {
            const pressed = typeof input === 'function' ? input(i, world, G) : input;
            G.key = pressed; G.hit = {};
            for (const key of Object.keys(pressed)) G.hit[key] = pressed[key] && !held[key];
            held = pressed; G.t += 1 / 60; def.update(world, 1 / 60);
        }
        return G.debug.state();
    }
};
// The campaign bot plays every level with ordinary pad input (see
// tropicale-bot.js), and each level must have used what it is about.
const botFile = readFileSync(new URL('./bots/tropicale.js', import.meta.url), 'utf8');
const driver = readFileSync(new URL('./tropicale-bot.js', import.meta.url), 'utf8');
function checkRuns(runs, where) {
    assert.deepEqual(Array.from(runs, (r) => r.level), [1, 2, 3], `${where}: the campaign covers all three levels`);
    for (const r of runs) {
        assert.equal(r.screen, r.level === 3 ? 'victory' : 'clear', `${where} level ${r.level}: ordinary pad controls reach the totem`);
        assert.equal(r.idle, 'over', `${where} level ${r.level}: idle cannot win`);
        assert.ok(r.fruit > 0 && r.flags >= 3, `${where} level ${r.level}: the route collects fruit and raises the flags`);
        assert.ok(r.seconds < 180, `${where} level ${r.level}: under three minutes`);
    }
    const [one, two, three] = runs;
    assert.ok(one.rode.includes('raft') && one.springs > 0, `${where}: level 1 crosses its lagoon on a raft and uses a spring`);
    assert.ok(two.rode.includes('mover') && two.rode.includes('fall'), `${where}: level 2 rides planks and crumbling slabs`);
    assert.ok(three.rode.includes('lift') && three.surges > 0, `${where}: level 3 rides the lift and lives through a surge`);
}
const proof = vm.runInNewContext(driver, { SnoGame: G, BOT: vm.runInNewContext(botFile) });
console.log(JSON.stringify(proof));
checkRuns(proof, 'node');
console.log('ok tropicale: unchanged world, combined warnings, input misses, fruit/collision cues, viewport drawing, campaign bot wins 1/2/3 and idle failure');

// node integrationtests/games/tropicale.mjs --browser [--touch] [--shots=/tmp/tropicale]
if (process.argv.includes('--browser')) {
    const { startSession, sleep } = await import('./lib.mjs');
    const { mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const shotDir = process.argv.find(arg => arg.startsWith('--shots='))?.slice(8);
    if (shotDir) mkdirSync(shotDir, { recursive: true });
    const layouts = process.argv.includes('--touch')
        ? [{ name: 'landscape', width: 844, height: 390 }, { name: 'portrait', width: 390, height: 844 }]
        : [{ name: 'desktop' }];
    const inPage = `(function () { var BOT = ${botFile};\nreturn (${driver}); })()`;
    const { page, base, close } = await startSession();
    try {
        for (const layout of layouts) {
            if (layout.width) await page.emulatePhone(layout.width, layout.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('tropicale')");
            await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'tropicale registration');
            const runs = await page.eval(inPage);
            checkRuns(runs, layout.name);
            console.log(layout.name, JSON.stringify(runs));
            for (const level of [1, 2, 3]) {
                await page.eval(`(function () { var BOT = ${botFile}, mem = {}; SnoGame.debug.start(${level});
                    SnoGame.debug.step(600, function (i, s) { return BOT.play(s, SnoGame, mem); }); return 1; })()`);
                await sleep(80);
                if (shotDir) await page.screenshot(join(shotDir, `tropicale-${layout.name}-L${level}.jpg`));
            }
            assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
            assert.deepEqual(page.problems, []);
            console.log(`ok tropicale ${layout.name} rendered levels 1/2/3`);
        }
    } finally { await close(); }
}
