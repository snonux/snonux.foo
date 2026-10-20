#!/usr/bin/env node
// CPU survey of the theme games: plays levels 1 and 3 of each game in real
// time for a few seconds (random held keys stand in for a player) and prints
// the frame rate reached, the JS time spent in update() and draw() per
// frame, and the CPU used by all of Chrome's processes (100 = one core).
//
//   GAMES_GPU=1 node integrationtests/games/cpu.mjs            # all games
//   GAMES_GPU=1 node integrationtests/games/cpu.mjs synthwave
//
// Run it with GAMES_GPU=1 on a quiet machine, and never two at once: without
// the GPU Chrome rasterises in software and every page costs three to four
// cores, whatever the game does. A game in good shape holds 60 fps at well
// under one core. Most of a game's cost is not its JS but the canvas calls
// the GPU process has to rasterise, so read the last column, not just the
// milliseconds.
import { readdirSync, readFileSync } from 'node:fs';
import { sleep, startSession, themesWithGames } from './lib.mjs';
const THEMES = process.argv.length > 2 ? process.argv.slice(2) : themesWithGames();
const SECS = 5, HZ = 100;
function chromeCpu() { // seconds of CPU used by every process of the test Chrome
    let t = 0;
    for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
        try {
            if (!readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('snonux-games-')) continue;
            const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
            t += (Number(f[11]) + Number(f[12])) / HZ;
        } catch (_) {}
    }
    return t;
}
const WRAP = `(function(){window.__m={u:0,d:0,f:0,maxd:0,maxu:0};var R=SnoGame.register;
 SnoGame.register=function(th,d){var u=d.update,dr=d.draw;
 d.update=function(){var t=performance.now();var r=u.apply(this,arguments);t=performance.now()-t;__m.u+=t;if(t>__m.maxu)__m.maxu=t;return r;};
 d.draw=function(){var t=performance.now();var r=dr.apply(this,arguments);t=performance.now()-t;__m.d+=t;__m.f++;if(t>__m.maxd)__m.maxd=t;return r;};
 return R.call(SnoGame,th,d);};return 1;})()`;
// A lively stand-in for a player: random held keys, changed a few times a second.
const BOT = `(function(){clearInterval(window.__b);var codes=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyX'];var held={};
 window.__b=setInterval(function(){codes.forEach(function(c){var want=Math.random()<0.4;if(want!==!!held[c]){held[c]=want;
 window.dispatchEvent(new KeyboardEvent(want?'keydown':'keyup',{code:c,key:c,bubbles:true}));}});},200);return 1;})()`;
const { page, base, close } = await startSession();
try {
    await page.goto(`${base}/index.html`);
    await page.eval(WRAP);
    console.log('theme level fps updMs/frame drawMs/frame maxDraw chromeCPU% screen');
    for (const t of THEMES) {
        for (const level of [1, 3]) {
            await page.eval(`SnoGame.quit(); SnoGame.launch('${t}')`);
            await page.waitFor(`SnoGame.debug.state() && SnoGame.debug.state().registered`, 'register');
            await page.eval(`SnoGame.debug.start(${level})`);
            await page.eval(BOT);
            await sleep(500);
            await page.eval('__m.u=__m.d=__m.f=__m.maxd=__m.maxu=0');
            const c0 = chromeCpu(), t0 = Date.now();
            await sleep(SECS * 1000);
            const m = await page.eval('__m'), dt = (Date.now() - t0) / 1000, cpu = (chromeCpu() - c0) / dt * 100;
            const st = await page.eval('SnoGame.debug.state()');
            console.log(t, level, (m.f / dt).toFixed(0), (m.u / m.f).toFixed(2), (m.d / m.f).toFixed(2), m.maxd.toFixed(1), cpu.toFixed(0), st.screen);
            await page.eval('clearInterval(window.__b)');
        }
    }
    await page.eval('SnoGame.quit()');
} finally { await close(); }
