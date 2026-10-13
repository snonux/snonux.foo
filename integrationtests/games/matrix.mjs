#!/usr/bin/env node
// Bullet Time: phone readability and touch target/miss regressions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export function game(touch, level = 1) {
    let def, screen = 'play';
    const labels = [], calls = [];
    const G = { W: 960, H: 540, HUD: 30, level, key: {}, hit: {}, mouse: { x: 0, y: 0 },
        isTouch: () => touch, rng: n => () => { n |= 0; n = n + 0x6D2B79F5 | 0; let t = Math.imul(n ^ n >>> 15, 1 | n); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }, rnd: (a, b) => (a + b) / 2,
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t,
        dist: (a, b, c, d) => Math.hypot(a - c, b - d), font: n => `${n}px monospace`,
        tileMove() {}, closestOnSeg: (x, y, ax, ay, bx, by) => {
            const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
            return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
        },
        register: (_, d) => { def = d; }, text: (text, x, y, opts) => labels.push({ text, x, y, opts }),
        sfx() {}, tone() {}, noise() {}, burst() {}, popup() {}, shake() {}, flash() {}, addScore() {}, die() { screen = 'over'; }, win() { screen = 'clear'; } };
    const engine = readFileSync(new URL('../../internal/generator/templates/shared/games.js', import.meta.url), 'utf8');
    runInNewContext(engine.slice(engine.indexOf('    function hitsTiles('), engine.indexOf('    // Saved progress:')), { G });
    runInNewContext(readFileSync(new URL('../../internal/generator/templates/themes/matrix/game.js', import.meta.url), 'utf8'), { window: { SnoGame: G } });
    const s = def.init(level);
    const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...args) => {
        calls.push({ kind: k, args, color: o.strokeStyle, width: o.lineWidth, alpha: o.globalAlpha });
        if (k === 'createRadialGradient') return { addColorStop() {} };
    } });
    return { s, G, def, labels, calls, screen: () => screen, draw() { labels.length = calls.length = 0; def.draw(s, ctx); }, step() { def.update(s, 1 / 60); } };
}

const desktop = game(false), phone = game(true);
desktop.draw(); phone.draw();
const countRain = g => g.calls.filter(c => c.kind === 'fillText').length;
assert(countRain(phone) < countRain(desktop) / 2);
assert(phone.labels.some(l => l.text === 'TIME' && l.opts.size === 30));
assert(desktop.labels.some(l => l.text === 'TIME' && l.opts.size === 20));
assert.equal(phone.def.hud(phone.s), 'P:8  FOES 11');
const ten = game(true, 10); ten.s.ammo.shotgun = 6;
assert.equal(ten.def.hud(ten.s), 'P:10 S:6  FOES 24');

// A tap on empty floor remains a deliberate shot there, without snapping to
// the nearest distant enemy. FIRE locks a target and a tap snaps to it.
const tap = game(true);
tap.G.mouse = { x: 150, y: 360, hit: true };
tap.step();
assert.equal(tap.s.lock, null);
assert.equal(tap.s.ammo.pistol, 7);
assert(Math.abs(tap.s.aim - Math.atan2(360 - 285, 150 - 105)) < .001);
const automatic = game(true); automatic.step();
assert(automatic.s.lock);
const e = automatic.s.lock;
automatic.G.mouse = { x: e.x + 5, y: e.y + 5, hit: true };
automatic.step();
assert.equal(automatic.s.lock, e);
assert.equal(automatic.s.ammo.pistol, 7);

// Layer several lethal warnings with target brackets and an ammo message.
// The mobile treatment must retain red intent lasers and the hostile round.
const danger = game(true, 10);
danger.s.agents[0].wind = .3;
danger.s.bullets.push({ x: 160, y: 270, vx: -270, vy: 0, own: danger.s.agents[0] });
danger.s.lock = danger.s.agents[0]; danger.s.msg = 'AMMO AT DROP MARKER'; danger.s.msgT = 2;
danger.draw();
assert(danger.calls.some(c => c.kind === 'lineTo' && c.color === '#ff3b4e' && c.width >= 3));
assert(danger.calls.some(c => c.kind === 'arc' && c.args[2] === 6));
assert(danger.calls.some(c => c.kind === 'arc' && c.color === '#d8ffe0' && c.width === 2.5));
assert(danger.labels.some(l => l.text === danger.s.msg && l.opts.size === 30 && l.opts.max === 900));
assert.equal(danger.s.p.r, 8); assert.equal(danger.s.agents[0].r, 11);
console.log('matrix touch targeting, misses, combined warnings, collision footprints and rain budget pass');

export function steer(i, s, G) {
    const p = s.p, foes = s.agents.concat(s.drones), ammo = s.ammo.pistol + s.ammo.shotgun;
    function visible(e) {
        const n = Math.ceil(G.dist(p.x,p.y,e.x,e.y)/8);
        for (let j=1;j<n;j++) if(s.grid[Math.floor((p.y+(e.y-p.y)*j/n)/30)*32+Math.floor((p.x+(e.x-p.x)*j/n)/30)]===1) return false;
        return true;
    }
    let target=null, best=Infinity;
    for(const e of foes) if(visible(e) && G.dist(p.x,p.y,e.x,e.y)<best){target=e;best=G.dist(p.x,p.y,e.x,e.y);}
    let goal=null, nearest=Infinity;
    if(ammo<3 || !target) for(const e of (ammo<3?s.pickups:foes)) {
        const tile=Math.floor(e.y/30)*32+Math.floor(e.x/30), d=s.flow[tile];
        if(d<nearest){nearest=d;goal=e;}
    }
    if(!goal && !ammo) goal={x:s.lv.cache[0]*30+15,y:s.lv.cache[1]*30+15};
    let gx=p.x,gy=p.y;
    if(goal){
        const start=Math.floor(p.y/30)*32+Math.floor(p.x/30), end=Math.floor(goal.y/30)*32+Math.floor(goal.x/30);
        const queue=[end], flow=Array(576).fill(9999); flow[end]=0;
        for(let k=0;k<queue.length;k++)for(const d of [1,-1,32,-32]) {const t=queue[k]+d;if(s.grid[t]===0&&flow[t]===9999){flow[t]=flow[queue[k]]+1;queue.push(t);}}
        let tile=start;
        for(const d of [1,-1,32,-32])if(flow[start+d]<flow[tile])tile=start+d;
        gx=tile===start?goal.x:(tile%32)*30+15;gy=tile===start?goal.y:Math.floor(tile/32)*30+15;
    }
    let chosen={},minCost=Infinity;
    for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const length=Math.hypot(dx,dy)||1, vx=dx/length*220,vy=dy/length*220;
        const body={x:p.x-8,y:p.y-8,w:16,h:16,vx,vy};
        G.tileMove(body,.22,30,s.solid);
        const x=body.x+8,y=body.y+8;
        let cost=goal?G.dist(x,y,gx,gy):Math.hypot(dx,dy)*8;
        for(const b of s.bullets)if(b.own!==p){
            const rx=b.x-p.x,ry=b.y-p.y,bvx=b.vx*(dx||dy?1:Math.max(s.ts,.25))-vx,bvy=b.vy*(dx||dy?1:Math.max(s.ts,.25))-vy;
            const t=Math.max(0,Math.min(.45,-(rx*bvx+ry*bvy)/(bvx*bvx+bvy*bvy||1)));
            const d=Math.hypot(rx+bvx*t,ry+bvy*t);
            if(d<50)cost+=(50-d)*200;
        }
        for(const d of s.drones)if(d.wake<=0){const dist=G.dist(x,y,d.x,d.y);if(dist<90)cost+=(90-dist)*30;}
        for(const a of s.agents)if(a.wind>0){const along=(x-a.x)*Math.cos(a.face)+(y-a.y)*Math.sin(a.face),cross=Math.abs((x-a.x)*Math.sin(a.face)-(y-a.y)*Math.cos(a.face));if(along>0&&cross<(a.kind==='s'?70:25))cost+=((a.kind==='s'?70:25)-cross)*12;}
        if(cost<minCost){minCost=cost;chosen={left:dx<0,right:dx>0,up:dy<0,down:dy>0};}
    }
    chosen.a=!!(target&&ammo&&s.fireT<=0&&(s.gun!=='shotgun'||best<300));
    if(s.gun==='shotgun'&&best>=300&&s.ammo.pistol)chosen.b=true;
    if (!s.touch && target) { chosen.mouse = { x: target.x, y: target.y, down: chosen.a }; chosen.a = false; }
    return chosen;
}

if (process.argv.includes('--browser')) {
    const { startSession, sleep } = await import('./lib.mjs');
    const { PHONES } = await import('./touch.mjs');
    const { page, base, close } = await startSession();
    try {
        for (const phone of [null, ...PHONES]) {
            if (phone) await page.emulatePhone(phone.width, phone.height);
            await page.goto(`${base}/index.html`);
            await page.eval("SnoGame.launch('matrix')");
            await page.waitFor('SnoGame.debug.state()?.registered', 'matrix register');
            for (const level of [1, 5, 10]) {
                const run = await page.eval(`(function(){
                    var bot=${steer.toString()},attempts=[],success=false;
                    for(var attempt=0;attempt<12&&!success;attempt++){
                        SnoGame.debug.start(${level});var ticks=0;
                        while(SnoGame.debug.state().screen==='play'&&ticks<24000){
                            SnoGame.debug.step(1,bot);ticks++;
                        }
                        var screen=SnoGame.debug.state().screen;success=screen==='clear'||screen==='victory';attempts.push({screen,ticks});
                    }
                    return {success,attempts,errors:SnoGame.debug.errors.slice()};
                })()`);
                console.log(phone?.name || 'desktop', level, run);
                assert(run.success, JSON.stringify(run)); assert.equal(run.errors.length, 0);
                const idle = await page.eval(`SnoGame.debug.start(${level});SnoGame.debug.step(24000,{});SnoGame.debug.state().screen`);
                assert.equal(idle, 'over');
                if (phone) {
                    await page.eval(`SnoGame.debug.start(${level});SnoGame.debug.step(360,${steer.toString()})`);
                    await sleep(80); await page.screenshot(`/tmp/matrix-${phone.name}-${level}.jpg`);
                }
            }
        }
    } finally { await close(); }
}
