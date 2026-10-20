#!/usr/bin/env node
// Opens one theme's game in headless Chrome and runs a snippet against it —
// the tool for developing a game: script a bot, read the state, take a shot.
//
//   node integrationtests/games/play.mjs breakout
//   node integrationtests/games/play.mjs breakout --level=3 --shot=/tmp/l3.jpg
//   node integrationtests/games/play.mjs breakout --level=1 --eval=/tmp/bot.js
//   node integrationtests/games/play.mjs breakout --serve      # play it yourself
//   node integrationtests/games/play.mjs breakout --touch --shot=/tmp/phone.jpg
//   node integrationtests/games/play.mjs breakout --touch=portrait
//
// The game is launched and --level (default 1) is started via
// SnoGame.debug.start(). The --eval file is evaluated in the page as one
// expression (wrap statements in an IIFE); its value is printed as JSON
// together with the engine state and any errors. Without --eval a random
// bot plays ten seconds. --shot saves a screenshot afterwards. --touch runs
// it all on an emulated phone (landscape, or --touch=portrait), so the touch
// pad is built and the screenshot shows the phone layout.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sleep, startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

const RANDOM_BOT = `SnoGame.debug.step(600, (function(){var r=SnoGame.rng(7),c={},u=0;return function(i){
  if(i>=u){u=i+5+Math.floor(r()*40);c={left:r()<.35,right:r()<.35,up:r()<.3,down:r()<.2,a:r()<.6,b:r()<.2,mouse:{x:r()*960,y:r()*540,down:r()<.5}};}
  return c;};})())`;

function phoneNamed(name) {
    const phone = PHONES.find((p) => p.name === name);
    if (!phone) throw new Error(`--touch must be one of ${PHONES.map((p) => p.name).join(', ')}`);
    return phone;
}

function parseArgs(argv) {
    const opts = { theme: '', level: 1, shot: '', evalFile: '', serve: false, phone: null };
    for (const a of argv) {
        if (a.startsWith('--level=')) opts.level = Number(a.slice(8));
        else if (a.startsWith('--shot=')) opts.shot = resolve(a.slice(7));
        else if (a.startsWith('--eval=')) opts.evalFile = resolve(a.slice(7));
        else if (a === '--serve') opts.serve = true;
        else if (a === '--touch' || a.startsWith('--touch=')) opts.phone = phoneNamed(a.slice(8) || 'landscape');
        else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        else opts.theme = a;
    }
    if (!opts.theme) throw new Error('usage: play.mjs <theme> [--level=N] [--eval=file.js] [--shot=file.jpg] [--touch[=portrait]] [--serve]');
    if (!(opts.level >= 1 && opts.level <= 3)) throw new Error('--level must be 1..3');
    return opts;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const { page, base, close } = await startSession();
    try {
        if (opts.serve) {
            console.log(`serving ${base}/index.html — pick the theme, press 'a' to play; Ctrl-C to stop`);
            await new Promise(() => {});
        }
        if (opts.phone) await page.emulatePhone(opts.phone.width, opts.phone.height);
        await page.goto(`${base}/index.html`);
        await page.eval(`SnoGame.launch(${JSON.stringify(opts.theme)})`);
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'the game script to register');
        await page.eval(`SnoGame.debug.start(${opts.level})`);
        const expr = opts.evalFile ? readFileSync(opts.evalFile, 'utf8') : RANDOM_BOT;
        const result = await page.eval(expr);
        await sleep(80); // let a frame render so draw() runs on the final state
        const state = await page.eval('SnoGame.debug.state()');
        const errors = await page.eval('SnoGame.debug.errors.slice()');
        if (opts.shot) await page.screenshot(opts.shot);
        console.log(JSON.stringify({ result, state, errors, pageProblems: page.problems }, null, 2));
        process.exitCode = errors.length ? 1 : 0;
    } finally {
        await close();
    }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
