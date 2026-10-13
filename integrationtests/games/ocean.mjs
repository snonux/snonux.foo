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
    const G = { W: 960, H: 540, HUD: 30, level: 10, lives: 3, key: {}, cam: {},
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
    for (let level = 1; level <= 10; level++) {
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
    const s = def.init(10);
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
            const results = await page.eval(`(function(){
                var G=SnoGame,out=[];
                function sample(arr,x){var f=G.clamp(x/16,0,arr.length-1.001),i=Math.floor(f);return G.lerp(arr[i],arr[i+1],f-i);}
                for(var level of [1,5,10]){
                    G.debug.start(level);var ticks=0;
                    while(ticks<24000&&G.debug.state().screen==='play'){
                        var s=G.debug.s(),b=s.sub,tx=220,ty=(sample(s.top,b.x+35)+sample(s.bot,b.x+35))/2;
                        var col=s.cols.find(function(c){return c.x>b.x-45;});
                        if(s.o2<65&&col)tx=G.clamp(col.x-s.cam,80,550);
                        if(s.boss&&s.boss.awake){ty=s.boss.y-3;tx=s.o2<65?505:330;}
                        var dx=tx-(b.x-s.cam),dy=ty-b.y;
                        G.debug.step(1,{left:dx-b.vx*.35<-8,right:dx-b.vx*.35>8,
                            up:dy-b.vy*.35<10,down:dy-b.vy*.35>22,a:true,b:true});ticks++;
                    }
                    out.push({level:level,screen:G.debug.state().screen,ticks:ticks,lives:G.lives});
                }
                G.debug.start(1);G.debug.step(24000,{});
                return {wins:out,idle:G.debug.state().screen,phone:G.debug.s().phone,errors:G.debug.errors.slice()};
            })()`);
            for (const win of results.wins) assert.equal(win.screen, win.level === 10 ? 'victory' : 'clear', `${mode?.name || 'desktop'} level ${win.level}: ${JSON.stringify(win)}`);
            assert.equal(results.phone, !!mode, 'each run must initialize the intended desktop or phone variant');
            assert.equal(results.idle, 'over', 'idle play must lose');
            assert.deepEqual(results.errors, []);
            console.log(`ok   ocean ${mode?.name || 'desktop'}: ordinary-input wins at 1/5/10 and idle loss`);
        }
    } finally { await close(); }
}
