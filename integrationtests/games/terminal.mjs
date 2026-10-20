import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startSession, sleep } from './lib.mjs';
import { PHONES } from './touch.mjs';
const bot = `(function () { var BOT = ${readFileSync(new URL('./bots/terminal.js', import.meta.url), 'utf8')};\nreturn (${readFileSync(new URL('./terminal-bot.js', import.meta.url), 'utf8')}); })()`;
for (const phone of [null, ...PHONES]) {
    const { page, base, close } = await startSession();
    const mode = phone ? phone.name : 'desktop';
    try {
        if (phone) await page.emulatePhone(phone.width, phone.height);
        await page.goto(`${base}/index.html`);
        await page.eval(`SnoGame.launch('terminal')`);
        await page.waitFor('SnoGame.debug.state().registered', 'terminal registration');
        const result = await page.eval(bot);
        assert.ok(result.wins.every((v) => v.screen === (v.level === 3 ? 'victory' : 'clear')), `${mode} ordinary input wins: ${JSON.stringify(result)}`);
        assert.ok(result.idle.every((v) => v.screen === 'over'), `${mode} idle must lose`);
        await page.eval(`SnoGame.debug.start(2); SnoGame.debug.step(240, {codes:{KeyD:true,ArrowLeft:true}})`);
        await sleep(80);
        await page.screenshot(`/tmp/terminal-${mode}.jpg`);
        const errors = await page.eval('SnoGame.debug.errors.slice()');
        assert.deepEqual(errors, []);
        assert.deepEqual(page.problems, []);
        console.log(JSON.stringify({ mode, ...result, errors, pageProblems: page.problems }));
    } finally { await close(); }
}
