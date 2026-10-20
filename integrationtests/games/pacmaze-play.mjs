#!/usr/bin/env node
// Ordinary-input wins by the campaign bot and cache scaling for Neon Maze.
// No state or rule edits.
// Run: node integrationtests/games/pacmaze-play.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startSession } from './lib.mjs';
const shots = process.argv[2] ? resolve(process.argv[2]) : '';
if (shots) mkdirSync(shots, { recursive: true });
// The campaign bot (bots/pacmaze.js) reads the grid and ghost positions and
// sends only the four directions of the keyboard/pad. Each run records what
// the bot met on the way: tunnels and warps (a jump across the maze), ghosts
// eaten after a power pellet, and shutters that were shut at some point.
const botSrc = readFileSync(new URL('./bots/pacmaze.js', import.meta.url), 'utf8');
const BOT = `(function () {
    var G = SnoGame, bot = (0, eval)(${JSON.stringify(botSrc)}), mem = {}, wraps = 0, eaten = 0, shut = 0, ticks = 0, result;
    for (; ticks < 60 * 300; ticks++) {
        var before = G.debug.s(), x = before.pl.x, y = before.pl.y, roam = before.ghosts.filter(function (g) { return g.state !== 'eyes'; }).length;
        result = G.debug.step(1, function (i, s) { return bot.play(s, G, mem); });
        if (result.screen !== 'play') break;
        var s = G.debug.s();
        if (Math.abs(s.pl.x - x) > 5 || Math.abs(s.pl.y - y) > 5) wraps++;
        if (s.ghosts.length === before.ghosts.length) eaten += Math.max(0, roam - s.ghosts.filter(function (g) { return g.state !== 'eyes'; }).length);
        if (s.gates.some(function (g) { return !g.open; })) shut++;
    }
    var state = G.debug.s();
    return {screen: result.screen, level: result.level, lives: result.lives, left: state.left, seconds: Math.round(ticks / 60), wraps: wraps, eaten: eaten, shut: shut};
})()`;
const { page, base, close } = await startSession();
try {
    await page.goto(`${base}/index.html`);
    await page.eval(`window.__pacmazeDef=null;var register=SnoGame.register;
        SnoGame.register=function(t,d){if(t==='pacmaze')window.__pacmazeDef=d;return register.call(SnoGame,t,d);};
        SnoGame.launch('pacmaze')`);
    await page.waitFor('__pacmazeDef', 'pacmaze definition');
    const scaled = await page.eval(`(function(){
        var def=__pacmazeDef,pic=document.createElement('canvas'),ctx=pic.getContext('2d');
        function pixels(s,scale){
            pic.width=Math.round(960*scale);pic.height=Math.round(540*scale);
            ctx.setTransform(scale,0,0,scale,0,0);def.draw(s,ctx);
            return ctx.getImageData(0,0,pic.width,pic.height).data;
        }
        for(var level of [1,2,3]){
            var s=def.init(level);
            for(var scale of [1,.40625,1.37,2,1]){
                var cached=pixels(s,scale),fresh=pixels(def.init(level),scale);
                if(!cached.every(function(v,i){return v===fresh[i];}))return false;
            }
        }
        return true;
    })()`);
    assert.equal(scaled, true, 'resized wall caches match a fresh render at phone and desktop scales');
    // Whether a route crosses a tunnel or meets a blue ghost depends on
    // where the ghosts push it, so those are counted over all nine runs;
    // the core's eight power pellets make ghost hunting certain there.
    let trips = 0, eaten = 0;
    async function win(level, orientation) {
        await page.eval(`SnoGame.debug.start(${level})`);
        const result = await page.eval(BOT);
        assert.equal(result.screen, level === 3 ? 'victory' : 'clear', `${orientation} level ${level} is winnable`);
        assert.equal(result.level, level);
        assert.equal(result.left, 0);
        if (level === 3) assert.ok(result.eaten > 0, `${orientation} level 3: power pellets used to eat ghosts`);
        if (level > 1) assert.ok(result.shut > 0, `${orientation} level ${level}: shutters in play`);
        trips += result.wraps; eaten += result.eaten;
        console.log('ok  ', orientation, level, `${result.seconds}s, ${result.lives} lives left, ${result.eaten} ghosts eaten, ${result.wraps} tunnel trips`);
    }
    for (const level of [1,2,3]) await win(level, 'desktop');
    await page.eval('SnoGame.debug.start(1)');
    const idle = await page.eval('SnoGame.debug.step(60*150,{})');
    assert.equal(idle.screen, 'over', 'idle player loses');
    for (const [name,width,height] of [['landscape',844,390],['portrait',390,844]]) {
        await page.emulatePhone(width,height);
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('pacmaze')");
        await page.waitFor('SnoGame.debug.state().registered', 'phone registration');
        for (const level of [1,2,3]) {
            if (shots) {
                await page.eval(`SnoGame.debug.start(${level});SnoGame.debug.step(180,{left:true})`);
                await page.screenshot(join(shots, `${name}-${level}.jpg`));
            }
            await win(level, name);
        }
        assert.deepEqual(await page.eval('SnoGame.debug.errors'), []);
    }
    assert.deepEqual(page.problems, []);
    assert.ok(trips > 0 && eaten > 3, 'the bot uses tunnels and eats ghosts');
    console.log('ok   pacmaze cache scaling and idle loss');
} finally {
    await close();
}
