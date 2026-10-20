// Ordinary pad/keyboard inputs win without changing the game state or rules.
// node integrationtests/games/surveillance.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';
const bot = readFileSync(new URL('./surveillance-bot.js', import.meta.url), 'utf8');
const { page, base, close } = await startSession();
try {
    for (const phone of [null, ...PHONES]) {
        const name = phone ? phone.name : 'desktop';
        if (phone) await page.emulatePhone(phone.width, phone.height);
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('surveillance')");
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'surveillance registration');
        for (const level of [1, 2, 3]) {
            const result = await page.eval(`(function () {
                const steer = ${bot}, memory = {}; SnoGame.debug.start(${level});
                let ticks = 0;
                for (; ticks < 18000 && SnoGame.debug.state().screen === 'play'; ticks++)
                    SnoGame.debug.step(1, (i, s) => steer(s, memory));
                return { state: SnoGame.debug.state(), ticks };
            })()`);
            assert.equal(result.state.screen, level === 3 ? 'victory' : 'clear', `${name} level ${level}: ${JSON.stringify(result)}`);
            console.log(`ok surveillance ${name} level ${level}: ${result.ticks} ticks, ${result.state.lives} lives`);
            await page.eval(`(function(){SnoGame.debug.start(${level}); const steer = ${bot}, memory = {}; return SnoGame.debug.step(180, (i,s) => steer(s,memory));})()`);
            await page.screenshot(`/tmp/surveillance-${name}-${level}.jpg`);
            const idle = await page.eval(`SnoGame.debug.start(${level}); SnoGame.debug.step(18000,{}); SnoGame.debug.state()`);
            assert.equal(idle.screen, 'over', `${name} level ${level}: idle loses`);
        }
        assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
        assert.deepEqual(page.problems, []);
        await page.eval('SnoGame.quit()');
    }
} finally { await close(); }
