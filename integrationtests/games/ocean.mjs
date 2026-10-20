#!/usr/bin/env node
// Phone cues must preserve Deep Channel's physics and hazard rules.
// --local checks drawing and rules without reserving a browser lane.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

function localChecks() {
    let def, phone = false, labels = [], operations = [], rectangles = [];
    const G = { W: 960, H: 540, HUD: 30, level: 3, lives: 3, key: {}, cam: {},
        isTouch: () => phone, register: (_, d) => { def = d; },
        clamp: (n, a, b) => Math.min(b, Math.max(a, n)), lerp: (a, b, t) => a + (b - a) * t,
        rng: (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; },
        dist: (x, y, a, b) => Math.hypot(x - a, y - b),
        circ: (x, y, r, a, b, q) => Math.hypot(x - a, y - b) < r + q,
        text: (text, x, y, options) => { labels.push({ text, x, y, ...options }); operations.push(text); }
    };
    for (const name of ['tone', 'noise', 'sfx', 'popup', 'burst', 'shake', 'flash', 'addScore', 'win']) G[name] = () => {};
    G.loseLife = () => --G.lives;
    vm.runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/ocean/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => gradient : (...args) => {
        if (name === 'fillRect') rectangles.push(args);
        operations.push(name === 'fill' && args[0] === 'evenodd' ? 'darkness' : name);
    }, set: () => true });
    for (let level = 1; level <= 3; level++) {
        phone = false; const desktop = def.init(level);
        phone = true; const mobile = def.init(level);
        assert.equal(desktop.cfg, mobile.cfg, 'phone must retain level rules');
        const rules = (s) => JSON.stringify({ ...s, phone: undefined });
        assert.equal(rules(desktop), rules(mobile), 'phone must retain layout and state');
        for (let tick = 0; tick < 120; tick++) {
            G.key = { up: tick % 30 < 10, a: true, b: true };
            def.update(desktop, 1 / 60); def.update(mobile, 1 / 60);
        }
        assert.equal(rules(desktop), rules(mobile), 'phone must retain physics, damage and weapon rules');
    }
    const s = def.init(3);
    s.dark = 1; s.o2 = 12; s.hull = 22; s.damage = .8; s.damageText = '-25 HULL';
    s.ents = [{ kind: 'angler', x: 980, y: 64, state: 'warn', t: 0 },
        { kind: 'vent', x: 500, y: 490, warn: true, on: false, h: 200, t: 0 },
        { kind: 'stal', x: -30, y: 80, state: 'shake', t: 0 }];
    labels = []; operations = []; def.draw(s, ctx);
    const warnings = labels.filter((l) => l.text === '!');
    assert.equal(warnings.length, 3, 'combined attack warnings must survive darkness and offscreen sources');
    for (const warning of warnings) {
        assert.ok(warning.x >= 18 && warning.x <= 942 && warning.y >= 104 && warning.y <= 470);
        assert.ok(warning.size >= 30);
    }
    assert.ok(operations.indexOf('!') > operations.indexOf('darkness'), 'darkness must not dim attack tells');
    for (const label of ['AIR LOW', '-25 HULL', 'HULL LOW']) {
        const cue = labels.find((l) => l.text === label);
        assert.ok(cue && cue.size >= 30 && cue.y > 496 && cue.glow, 'damage warnings remain legible without opaque backplates');
    }
    assert.deepEqual(labels.filter((l) => ['AIR LOW', '-25 HULL', 'HULL LOW'].includes(l.text)).map((l) => l.x), [16, 480, 944]);
    assert.ok(labels.filter((l) => ['AIR', 'HULL', 'KRAKEN', 'TRIP'].includes(l.text)).every((l) => l.size >= 30));
    for (const y of [60, 514]) {
        s.sub.y = y; rectangles = []; def.draw(s, ctx);
        assert.ok(!rectangles.some((r) => r[0] === 0 && r[2] === G.W &&
            ((r[1] === G.HUD && r[3] === 38) || (r[1] === 496 && r[3] === 44))),
        'phone HUD must not mask the playable ceiling or floor');
    }
    s.ents[0].state = 'lurk'; s.ents[1].warn = false; s.ents[2].state = 'hang';
    labels = []; def.draw(s, ctx);
    assert.equal(labels.filter((l) => l.text === '!').length, 0, 'inactive hazards must not show attack warnings');
    // Shooting into empty water consumes a normal reload without causing a
    // phantom hit, repair or damage. Both weapons must work while steering.
    const miss = def.init(1); miss.pending = []; miss.ents = [];
    G.key = { up: true, left: true, a: true, b: true };
    def.update(miss, 1 / 60);
    assert.equal(miss.hull, 100); assert.equal(miss.damage, 0);
    assert.equal(miss.torps.length, 1); assert.equal(miss.charges.length, 1);
    assert.ok(miss.reload > 0 && miss.chargeReload > 0);
    assert.ok(miss.sub.vy < 0 && miss.sub.vx < 0, 'diagonal steering and firing must remain simultaneous');
    console.log('ok   ocean local: same rules, physics and weapons; combined dark/offscreen/damage cues');
}

localChecks();
if (!process.argv.includes('--local')) {
    const botSrc = readFileSync(new URL('./bots/ocean.js', import.meta.url), 'utf8');
    const { page, base, close } = await startSession();
    try {
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('ocean')");
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'ocean definition');
        for (const mode of [null, ...PHONES]) {
            if (mode) {
                await page.emulatePhone(mode.width, mode.height);
                await page.eval("SnoGame.quit();SnoGame.launch('ocean')");
                await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'ocean phone definition');
            }
            // The campaign bot (bots/ocean.js) flies each level by input only;
            // the run records what it had to use: air columns, currents,
            // depth charges and, on level 3, the kraken's arms.
            const results = await page.eval(`(function(){
                var G=SnoGame,out=[],bot=(0,eval)(${JSON.stringify(botSrc)});
                for(var level of [1,2,3]){
                    G.debug.start(level);var ticks=0,mem={},o2=100,breaths=0,currents=0,charges=0,stuns=0;
                    while(ticks<24000&&G.debug.state().screen==='play'){
                        G.debug.step(1,function(i,s){return bot.play(s,G,mem);});ticks++;
                        var s=G.debug.s();
                        if(s.o2>o2+0.2)breaths++;
                        o2=s.o2;
                        if(s.flow)currents++;
                        charges=Math.max(charges,s.charges.length);
                        if(s.boss)stuns=Math.max(stuns,s.boss.arms.filter(function(a){return a.stun>0;}).length);
                    }
                    out.push({level:level,screen:G.debug.state().screen,ticks:ticks,lives:G.lives,breaths:breaths,currents:currents,charges:charges,stuns:stuns});
                }
                G.debug.start(1);G.debug.step(24000,{});
                return {wins:out,idle:G.debug.state().screen,phone:G.debug.s().phone,errors:G.debug.errors.slice()};
            })()`);
            for (const win of results.wins) {
                assert.ok(win.breaths > 0, `level ${win.level}: the bot had to breathe in a column`);
                if (win.level > 1) assert.ok(win.currents > 0, `level ${win.level}: the route crosses a current`);
                if (win.level === 3) assert.ok(win.stuns > 0, 'level 3: an arm was made to recoil');
            }
            assert.ok(results.wins.some((w) => w.charges > 0), 'depth charges are used');
            for (const win of results.wins) assert.equal(win.screen, win.level === 3 ? 'victory' : 'clear', `${mode?.name || 'desktop'} level ${win.level}: ${JSON.stringify(win)}`);
            assert.equal(results.phone, !!mode, 'each run must initialize the intended desktop or phone variant');
            assert.equal(results.idle, 'over', 'idle play must lose');
            assert.deepEqual(results.errors, []);
            console.log(`ok   ocean ${mode?.name || 'desktop'}: bot wins 1/2/3 (${results.wins.map((w) => (w.ticks / 60).toFixed(0) + 's').join(' ')}) and idle loss`);
        }
    } finally { await close(); }
}
