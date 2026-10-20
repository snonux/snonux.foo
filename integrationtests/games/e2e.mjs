#!/usr/bin/env node
// End-to-end test for the theme games, driven through real Chrome.
//
//   node integrationtests/games/e2e.mjs                 # every theme
//   node integrationtests/games/e2e.mjs breakout neon   # just these
//   node integrationtests/games/e2e.mjs --shots=/tmp/shots breakout
//   node integrationtests/games/e2e.mjs --touch [themes…]   # the phone checks
//
// It builds the site into a temp dir, serves it over HTTP (cookies do not
// work on file://), starts headless Chrome and talks to it over the DevTools
// protocol (see lib.mjs). To poke at a single game by hand, use play.mjs.
//
// For every theme it checks that the game launches from the splash button,
// the header button, the fx-row button and the 'a' key; that Esc quits; that
// real key presses reach the game and not the blog; that the canvas draws and
// keeps animating with no input; that P pauses (and silences) the game; that
// music plays and the game makes sound effects of its own; that all three
// levels survive a random-input bot without errors; that winning unlocks the
// next level in the cookie, that clearing level 3 opens the animated ending
// scene (and nothing beyond it), that the level select follows the cookie,
// and that the cookie survives a reload.
//
// These are smoke tests of the engine flow: where the random bot does not
// win a level, the win is forced with debug.win(). That proves nothing about
// whether a level can be won. campaign.mjs is the playability test: it plays
// each game's three levels through with that theme's own bot, by input only.
//
// With --touch it runs the phone checks of touch.mjs instead: an emulated
// phone in both orientations, driven by real touch events.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sleep, startSession, themesWithGames } from './lib.mjs';
import { testArcadeMenu } from './arcade.mjs';
import { testFinePointerPhone, testNoFullscreen, testPadConfigs, testRotation, testThemeTouch } from './touch.mjs';

const LEVELS = 3;
const BOT_TICKS = 900; // 15 seconds of game time per level

function parseArgs(argv) {
    const opts = { themes: [], shots: '', touch: false };
    for (const a of argv) {
        if (a.startsWith('--shots=')) opts.shots = resolve(a.slice(8));
        else if (a === '--touch') opts.touch = true;
        else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        else opts.themes.push(a);
    }
    return opts;
}

// --- expressions evaluated inside the page -------------------------------

const STATE = 'SnoGame.debug.state()';

// Summarises the canvas: how many distinct colours a coarse grid of samples
// holds, plus a hash that changes whenever the picture does.
const CANVAS_STATS = `(function(){var c=document.querySelector('#sno-game canvas');if(!c)return null;
  var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,seen={},n=0,h=0;
  for(var y=8;y<c.height;y+=16)for(var x=8;x<c.width;x+=16){var i=(y*c.width+x)*4,k=(d[i]>>3)+','+(d[i+1]>>3)+','+(d[i+2]>>3);
    if(!seen[k]){seen[k]=1;n++;}h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)>>>0;}
  return {colors:n,hash:h};})()`;

// A seeded bot that holds random buttons for random stretches. It is not
// trying to win; it is trying to reach as much game code as possible.
const botSource = (seed) => `(function(){var r=SnoGame.rng(${seed}),cur={},until=0;return function(i){
  if(i>=until){until=i+4+Math.floor(r()*40);
    cur={left:r()<.35,right:r()<.35,up:r()<.3,down:r()<.2,a:r()<.6,b:r()<.2,mouse:{x:r()*960,y:r()*540,down:r()<.5}};
    var c={};if(cur.left)c.ArrowLeft=c.KeyA=true;if(cur.right)c.ArrowRight=c.KeyD=true;
    if(cur.up)c.ArrowUp=c.KeyW=true;if(cur.down)c.ArrowDown=c.KeyS=true;if(cur.a)c.Space=true;if(cur.b)c.KeyX=true;
    cur.codes=c;}
  return cur;};})()`;

function check(cond, message) { if (!cond) throw new Error(message); }

async function cookieSave(page, theme) {
    const raw = await page.eval('document.cookie');
    const m = raw.match(new RegExp(`(?:^|; )snog_${theme}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
}

// --- per-theme checks ----------------------------------------------------

// Switches the page to the theme and opens its game from the splash button.
async function launchFromSplash(page, base, theme) {
    await page.goto(`${base}/index.html`);
    await page.eval(`snonuxSwitchTheme(${JSON.stringify(theme)})`);
    const title = await page.eval(`SnoGame.titles[${JSON.stringify(theme)}]`);
    check(title, `no title for ${theme} in the games.js manifest`);
    await page.waitFor(`(document.querySelector('#splash-overlay .splash-game-btn')||{}).textContent && document.querySelector('#splash-overlay .splash-game-btn').textContent.indexOf(${JSON.stringify(title)})>=0 && document.querySelector('header .header-game-btn')`,
        'splash "Play" button for this theme');
    await page.click('#splash-overlay .splash-game-btn');
    await page.waitFor(`SnoGame.active && ${STATE} && ${STATE}.screen==='title'`, 'title screen after splash launch');
    const st = await page.eval(STATE);
    check(st.theme === theme, `launched ${st.theme}, wanted ${theme}`);
    check(await page.eval(`!document.getElementById('splash-overlay').classList.contains('splash--dismissed')`), 'launching from the splash must not dismiss it');
}

async function checkDefinition(page) {
    const d = await page.eval('SnoGame.debug.def()');
    check(d.title && d.blurb, 'game needs a title and a blurb');
    check(d.controls >= 1, 'game needs at least one controls line');
    check(d.levelNames === LEVELS, `game needs ${LEVELS} level names, has ${d.levelNames}`);
    check(d.music, 'game needs a music definition');
}

// Plays level 1 with real key events: this is the only part that exercises
// the browser's actual keyboard path and the requestAnimationFrame loop.
async function playForReal(page, theme, shots) {
    if (shots) await page.screenshot(join(shots, `${theme}-title.jpg`));
    await page.press('Enter');
    await page.waitFor(`${STATE}.screen==='play'`, 'play screen after Enter');
    // Pause first: a harsh level may kill an idle player quickly, and P only
    // works on the play screen.
    await checkPause(page);
    // Rule 7 of docs/games.md: the picture keeps changing with no input.
    const idleA = await page.eval(CANVAS_STATS);
    await sleep(600);
    const idleB = await page.eval(CANVAS_STATS);
    check(idleA.hash !== idleB.hash, 'canvas did not change over 0.6s with no input');
    await page.key('keyDown', 'ArrowRight');
    await page.key('keyDown', 'Space');
    await sleep(120);
    check(await page.eval('SnoGame.key.right && SnoGame.key.a'), 'held keys did not reach SnoGame.key');
    const before = await page.eval(CANVAS_STATS);
    await page.press('KeyW'); // 'w' toggles wild mode on the blog; it must not leak through
    await sleep(500);
    const after = await page.eval(CANVAS_STATS);
    await page.key('keyUp', 'ArrowRight');
    await page.key('keyUp', 'Space');
    check(after.colors >= 4, `canvas looks blank (${after.colors} colours)`);
    check(before.hash !== after.hash, 'canvas did not change over half a second of play');
    check(!(await page.eval('!!window._snoWildActive')), 'a key press leaked through to the blog');
    const audio = await page.eval('SnoGame.debug.audio()');
    check(audio.state === 'running', `audio context is ${audio.state}`);
    check(audio.musicSteps > 0, 'no music steps were scheduled');
}

// P must freeze the game and silence it, and P again must bring both back.
async function checkPause(page) {
    await page.press('KeyP');
    await page.waitFor(`${STATE}.screen==='paused'`, 'pause on P');
    const t0 = (await page.eval(STATE)).t;
    await sleep(350);
    check((await page.eval(STATE)).t === t0, 'game time advanced while paused');
    check((await page.eval('SnoGame.debug.audio()')).state === 'suspended', 'audio kept running while paused');
    await page.press('KeyP');
    await page.waitFor(`${STATE}.screen==='play' && SnoGame.debug.audio().state==='running'`, 'resume on P');
}

// Runs the bot on one level, then forces a win and checks the save.
async function runLevel(page, theme, level, shots) {
    await page.eval(`SnoGame.debug.start(${level})`);
    let st = await page.eval(STATE);
    check(st.screen === 'play' && st.level === level, `level ${level} did not start (screen ${st.screen})`);
    for (let chunk = 0; chunk < 3 && st.screen === 'play'; chunk++) {
        st = await page.eval(`SnoGame.debug.step(${BOT_TICKS / 3}, ${botSource(level * 100 + chunk)})`);
        await sleep(40); // let a real frame render so draw() runs on this state
        const errs = await page.eval('SnoGame.debug.errors.slice()');
        check(!errs.length, `level ${level}: ${errs[0]}`);
    }
    check(['play', 'over', 'clear', 'victory', 'dead', 'intro'].includes(st.screen), `level ${level}: unexpected screen ${st.screen}`);
    if (shots) await page.screenshot(join(shots, `${theme}-L${level}.jpg`));
    // Engine-flow smoke only: a forced win (see the header comment).
    if (st.screen !== 'clear' && st.screen !== 'victory') {
        await page.eval(`SnoGame.debug.start(${level}); SnoGame.debug.win()`);
        st = await page.eval(STATE);
    }
    check(st.screen === (level === LEVELS ? 'victory' : 'clear'), `level ${level}: win led to ${st.screen}`);
    const save = (await cookieSave(page, theme)) || '';
    const want = Math.min(LEVELS, level + 1);
    check(Number(save.split('.')[0]) >= want, `level ${level}: cookie "${save}" did not unlock level ${want}`);
}

// Clearing the last level opens the ending: it animates on its own while the
// game stands still, and LEVELS on it leads back to the title screen.
async function checkEnding(page, theme, shots) {
    let st = await page.eval(`SnoGame.debug.step(150, {})`);
    check(st.screen === 'victory', `the ending closed by itself (screen ${st.screen})`);
    const e = await page.eval('SnoGame.debug.ending()');
    check(e && e.t > 2, 'no ending scene after the last level');
    check(!e.fireworks || e.sparks + e.shells > 0, 'the ending launched no fireworks');
    const t0 = st.t;
    const a = await page.eval(CANVAS_STATS);
    await sleep(500);
    const b = await page.eval(CANVAS_STATS);
    check(a.hash !== b.hash, 'the ending scene does not animate');
    check((await page.eval(STATE)).t === t0, 'the game kept playing behind the ending');
    if (shots) await page.screenshot(join(shots, `${theme}-ending.jpg`));
    const errs = await page.eval('SnoGame.debug.errors.slice()');
    check(!errs.length, `ending: ${errs[0]}`);
    await page.press('ArrowRight');
    await page.press('Enter');
    await page.waitFor(`${STATE}.screen==='title'`, 'LEVELS on the ending to open the title screen');
    st = await page.eval(STATE);
    check(st.won === 1 && st.unlocked === LEVELS, `after the ending: won ${st.won}, unlocked ${st.unlocked}`);
}

async function checkGameOver(page) {
    await page.eval('SnoGame.debug.start(1); SnoGame.debug.lose()');
    check((await page.eval(STATE)).screen === 'over', 'losing every life must lead to game over');
    // The game-over screen ignores Enter for its first half second of game
    // time; wait on that clock, not the wall clock, so a slow machine passes.
    await page.waitFor(`${STATE}.age > 0.6`, 'game-over screen to accept input');
    await page.press('Enter');
    await page.waitFor(`${STATE}.screen==='intro' || ${STATE}.screen==='play'`, 'retry after game over');
}

async function quitWithEsc(page, what) {
    await page.press('Escape');
    await page.waitFor(`!SnoGame.active && !document.getElementById('sno-game')`, `Esc to quit (${what})`);
}

// After a reload the cookie must still unlock everything, and the game must
// also open from the header button and the 'a' key.
async function checkPersistenceAndLaunchers(page, base, theme) {
    await page.goto(`${base}/index.html`);
    await page.eval(`snonuxSwitchTheme(${JSON.stringify(theme)})`);
    await page.waitFor(`document.querySelector('header .header-game-btn') && document.title.length`, 'header button');
    await page.press('Enter'); // dismiss the splash
    await page.waitFor(`document.getElementById('splash-overlay').classList.contains('splash--dismissed')`, 'splash dismissal');
    await sleep(700); // the splash fades out before it stops covering the header
    await page.click('header .header-game-btn');
    await page.waitFor(`SnoGame.active && ${STATE}.screen==='title'`, 'title screen after header launch');
    const st = await page.eval(STATE);
    check(st.unlocked === LEVELS && st.won === 1, `progress lost on reload: unlocked ${st.unlocked}, won ${st.won}`);
    check(st.sel === LEVELS, `title should offer the last level played (${LEVELS}), offers ${st.sel}`);
    await page.press('ArrowLeft');
    check((await page.eval(STATE)).sel === LEVELS - 1, 'level select did not move left');
    await quitWithEsc(page, 'header launch');
    await page.click('.nav-fx-button[data-sno-fx="game"]');
    await page.waitFor(`SnoGame.active && ${STATE}`, 'launch from the fx-row button');
    await quitWithEsc(page, 'fx-row launch');
    await page.press('KeyA');
    await page.waitFor(`SnoGame.active && ${STATE} && ${STATE}.theme===${JSON.stringify(theme)}`, "launch with the 'a' key");
    await quitWithEsc(page, "'a' launch");
}

async function testTheme(page, base, theme, shots) {
    page.problems.length = 0;
    await page.send('Network.clearBrowserCookies');
    await launchFromSplash(page, base, theme);
    await checkDefinition(page);
    await playForReal(page, theme, shots);
    await checkGameOver(page);
    // `sfx` counts only sounds the game asked for; the engine's own jingles
    // (hurt, win, game over) are counted apart and do not satisfy this.
    const sfxBefore = (await page.eval('SnoGame.debug.audio()')).sfx;
    for (let level = 1; level <= LEVELS; level++) await runLevel(page, theme, level, shots);
    await checkEnding(page, theme, shots);
    const audio = await page.eval('SnoGame.debug.audio()');
    check(audio.sfx > sfxBefore, 'the game played no sound effects of its own during three levels of bot play');
    await quitWithEsc(page, 'splash launch');
    await checkPersistenceAndLaunchers(page, base, theme);
    check(!page.problems.length, `page errors: ${page.problems.slice(0, 3).join(' | ')}`);
}

// Engine-level negative tests: bad saves must never be trusted.
async function testSaveParsing(page, base) {
    await page.goto(`${base}/index.html`);
    // Saves from the ten-level campaigns migrate: levels cap at 3, the high
    // score and the completed star stay. Anything else malformed is fresh.
    const cases = [['', [1, 0, 1, 0]], ['garbage', [1, 0, 1, 0]], ['99.-5.42.7', [1, 0, 1, 0]],
        ['2.300.2.0', [2, 300, 2, 0]], ['3.900.1.0', [3, 900, 1, 0]], ['4.1200.9.1', [3, 1200, 3, 1]],
        ['10.50.10.1', [3, 50, 3, 1]], ['11.50.11.1', [1, 50, 1, 1]], ['2.5.3.0', [2, 5, 2, 0]], ['1.x.1.2', [1, 0, 1, 0]]];
    for (const [raw, want] of cases) {
        const s = await page.eval(`SnoGame.debug.parseSave(${JSON.stringify(raw)})`);
        const got = [s.unlocked, s.hi, s.last, s.won];
        check(JSON.stringify(got) === JSON.stringify(want), `parseSave(${JSON.stringify(raw)}) = ${got}, want ${want}`);
    }
    check((await page.eval(`SnoGame.launch('no-such-theme')`)) === false, 'launching an unknown theme must be refused');
    check(!(await page.eval('SnoGame.active')), 'unknown theme must not open the overlay');
}

// A stand-in game that only counts the input edges it is shown.
const EDGE_COUNTER = `SnoGame.register('breakout', {
  init: function () { return { a: 0, raw: 0, click: 0 }; },
  update: function (s) { if (SnoGame.hit.a) s.a++; if (SnoGame.pressed('KeyW')) s.raw++; if (SnoGame.mouse.hit) s.click++; },
  draw: function () {} })`;

// debug.step() must remember what was held between calls: a bot stepping one
// tick at a time while holding a button gets one edge, not one per call.
async function testStepMemory(page, base) {
    await page.goto(`${base}/index.html`);
    await page.eval(`${EDGE_COUNTER}; SnoGame.launch('breakout'); SnoGame.debug.start(1)`);
    const held = '{a:true,codes:{KeyW:true},mouse:{x:5,y:5,down:true}}';
    const count = async (expr) => JSON.stringify(await page.eval(`(function(){${expr};var s=SnoGame.debug.s();return [s.a,s.raw,s.click];})()`));
    const stepHeld = `SnoGame.debug.step(1,${held})`;
    check(await count(`${stepHeld};${stepHeld};${stepHeld}`) === '[1,1,1]', 'a button held across three step() calls must give exactly one edge');
    check(await count(`SnoGame.debug.step(1,{});${stepHeld}`) === '[2,2,2]', 'releasing and pressing again must give a new edge');
    check(await page.eval('!SnoGame.key.a && !SnoGame.down("KeyW") && !SnoGame.mouse.down'), 'step() must leave the live input state clean');
    check(await count(`SnoGame.debug.start(1);${stepHeld}`) === '[1,1,1]', 'debug.start() must forget what was held');
    // Nor may it leak into the next game: quit, relaunch and start by key.
    await page.eval(`SnoGame.quit(); SnoGame.launch('breakout')`);
    await page.press('Enter');
    await page.press('Enter'); // skips the intro banner
    await page.waitFor(`${STATE}.screen==='play'`, 'play after relaunch');
    check(await count(stepHeld) === '[1,1,1]', 'a relaunched game must not remember buttons held in the last one');
    await page.eval('SnoGame.quit()');
}

// A stand-in game with a custom ending whose draw hook counts its calls and
// whose update counts ticks, so the test can see what runs during the scene.
const ENDING_GAME = `SnoGame.register('breakout', {
  levelNames: ['A', 'B', 'C'],
  ending: { title: 'TEST END', text: 'custom', colors: ['#f00'],
    draw: function (e) { e.data.n = (e.data.n || 0) + 1; window.__endDraws = e.data.n; } },
  init: function (level) { return { level: level, ticks: 0 }; },
  update: function (s) { s.ticks++; },
  draw: function () {} })`;

// The three-level contract: no level 4 by any route, level 2 clear leads to
// level 3 by Enter, and clearing level 3 opens a persistent ending that
// stops the game, ignores input for a moment, offers PLAY AGAIN and LEVELS,
// and is gone after quit and relaunch.
async function testThreeLevels(page, base) {
    await page.goto(`${base}/index.html`);
    await page.eval(`${ENDING_GAME}; SnoGame.launch('breakout')`);
    check(await page.eval('SnoGame.LEVELS') === 3, 'SnoGame.LEVELS must be 3');
    await page.eval('SnoGame.debug.start(4)');
    check((await page.eval(STATE)).level === 3, 'debug.start(4) must not start a fourth level');
    await page.eval('SnoGame.debug.start(2); SnoGame.debug.win()');
    let st = await page.eval(STATE);
    check(st.screen === 'clear' && st.unlocked === 3, `level 2 win: screen ${st.screen}, unlocked ${st.unlocked}`);
    await page.waitFor(`${STATE}.age > 0.6`, 'the clear screen to accept input');
    await page.press('Enter');
    await page.waitFor(`${STATE}.level===3 && (${STATE}.screen==='intro' || ${STATE}.screen==='play')`, 'Enter on level 2 clear to open level 3');
    await page.eval('SnoGame.debug.start(3); SnoGame.debug.win()');
    st = await page.eval(STATE);
    check(st.screen === 'victory' && st.won === 1, `level 3 win: screen ${st.screen}, won ${st.won}`);
    const ticks = await page.eval('SnoGame.debug.s().ticks');
    await page.press('Enter');
    check((await page.eval(STATE)).screen === 'victory', 'the ending must ignore Enter in its first moment');
    await page.eval('SnoGame.debug.step(120, {a: true})');
    const e = await page.eval('SnoGame.debug.ending()');
    check(e.title === 'TEST END' && e.choice === 0, `ending config not used: ${JSON.stringify(e)}`);
    check(await page.eval('SnoGame.debug.s().ticks') === ticks, 'update() ran during the ending');
    await sleep(200);
    check((await page.eval('window.__endDraws || 0')) > 0, "the theme's ending draw hook never ran");
    await page.press('ArrowRight');
    check((await page.eval('SnoGame.debug.ending()')).choice === 1, '→ must select LEVELS');
    await page.press('ArrowLeft');
    await page.press('Enter');
    await page.waitFor(`${STATE}.screen==='intro' && ${STATE}.level===1`, 'PLAY AGAIN to start level 1');
    check((await page.eval(STATE)).score === 0 && !(await page.eval('SnoGame.debug.ending()')), 'PLAY AGAIN must start a fresh run');
    await page.eval('SnoGame.debug.start(3); SnoGame.debug.win(); SnoGame.quit(); SnoGame.launch("breakout")');
    st = await page.eval(STATE);
    check(st.screen === 'title' && st.unlocked === 3 && st.won === 1 && st.sel === 3, `relaunch after the ending: ${JSON.stringify(st)}`);
    check(!(await page.eval('SnoGame.debug.ending()')), 'the ending survived quit and relaunch');
    await page.press('ArrowRight');
    check((await page.eval(STATE)).sel === 3, 'the level select must stop at level 3');
    await page.eval('SnoGame.quit()');
    check(!(await page.eval('SnoGame.debug.errors.length')), 'the stand-in game raised errors');
}

// While a game is open the page's own animation frames are parked (the
// theme backdrop would otherwise render behind the overlay and eat the
// game's frame rate) and handed back when it closes. A frame cancelled in
// between, during the game or after it by its parked id, must never run.
async function testBackdropHeld(page, base) {
    await page.goto(`${base}/index.html`);
    await page.eval(`SnoGame.launch('breakout')`);
    await page.waitFor(`${STATE} && ${STATE}.screen==='title'`, 'the title screen');
    await page.eval(`window.__raf={ran:0,dropped:0,late:0};
        requestAnimationFrame(function(){__raf.ran++;});
        cancelAnimationFrame(requestAnimationFrame(function(){__raf.dropped++;}));
        __raf.lateId=requestAnimationFrame(function(){__raf.late++;});`);
    const age = (await page.eval(STATE)).age;
    await sleep(300);
    check((await page.eval('__raf.ran')) === 0, 'a page animation frame ran while the game was open');
    check((await page.eval(STATE)).age > age, 'the game itself stopped while page frames were parked');
    // Quit and cancel in the same task: the frame is already rescheduled.
    await page.eval('SnoGame.quit(); cancelAnimationFrame(__raf.lateId)');
    await page.waitFor('__raf.ran===1', 'the parked animation frame to run after the game closed');
    await sleep(100);
    const r = await page.eval('__raf');
    check(r.dropped === 0, 'a frame cancelled during the game ran anyway');
    check(r.late === 0, 'a frame cancelled by its parked id after the game ran anyway');
    check(await page.eval('new Promise(function(ok){requestAnimationFrame(function(){ok(true);});})'), 'animation frames must work again after the game');
}

// The checks that do not belong to one game: the engine, the overview menu
// and, in touch mode, the pad layouts.
async function testEngine(page, base, opts) {
    await testSaveParsing(page, base);
    console.log('ok   save parsing and unknown-theme guard');
    await testStepMemory(page, base);
    console.log('ok   debug.step keeps held buttons across calls');
    await testThreeLevels(page, base);
    console.log('ok   three levels, no level 4, and the ending scene');
    await testBackdropHeld(page, base);
    console.log('ok   page animation frames are parked while a game is open');
    await testArcadeMenu(page, base, opts.shots, opts.touch);
    console.log('ok   game overview menu: every game listed, play one and come back');
    if (opts.touch) {
        await testFinePointerPhone(page, base, opts.shots);
        console.log('ok   a tap launch on a phone that reports a fine pointer still gets the pad');
        await testPadConfigs(page, base, opts.shots);
        console.log('ok   def.touch variants (twin, 4-way, hidden buttons, labels) in both orientations');
        await testNoFullscreen(page, base, opts.shots);
        console.log('ok   launch without fullscreen on a page wider than the phone (terminal, 360x800 and 800x360)');
        await testRotation(page, base, opts.shots);
        console.log('ok   turning the phone in game');
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const themes = opts.themes.length ? opts.themes : themesWithGames();
    if (opts.shots) mkdirSync(opts.shots, { recursive: true });
    const { page, base, close } = await startSession();
    let failed = 0;
    try {
        await testEngine(page, base, opts);
        const run = opts.touch ? testThemeTouch : testTheme;
        for (const theme of themes) {
            const t0 = Date.now();
            try {
                await run(page, base, theme, opts.shots);
                console.log(`ok   ${theme} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
            } catch (err) {
                failed++;
                console.log(`FAIL ${theme}: ${err.message}`);
                // What the engine itself recorded, so a crash can be told
                // apart from a slow machine.
                const engineErrors = await page.eval('window.SnoGame ? SnoGame.debug.errors.slice() : []').catch(() => []);
                for (const e of engineErrors) console.log(`     engine error: ${String(e).split('\n')[0]}`);
                if (opts.shots) await page.screenshot(join(opts.shots, `${theme}-FAIL.jpg`)).catch(() => {});
                // A failed touch check may leave fingers down; lift them so
                // they do not leak into the next theme.
                await page.touch('touchCancel', []).catch(() => {});
                await page.eval('window.SnoGame && SnoGame.quit()').catch(() => {});
            }
        }
    } finally {
        await close();
    }
    const what = opts.touch ? 'games (touch)' : 'games';
    console.log(failed ? `${failed} of ${themes.length} ${what} failed` : `all ${themes.length} ${what} passed`);
    process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
