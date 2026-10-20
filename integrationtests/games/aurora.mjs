#!/usr/bin/env node
// Polar Rush must remain winnable using only its two-thumb touch controls.
// Run: node integrationtests/games/aurora.mjs
import assert from 'node:assert/strict';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

function playCourses() {
    var results = [];
    for (var level of [1, 2, 3]) {
        SnoGame.debug.start(level);
        var ticks = 0, jumping = false;
        for (; ticks < 14000 && SnoGame.debug.state().screen === 'play'; ticks++) {
            SnoGame.debug.step(1, function (i, s) {
                var y = s.sk.y + 90, gates = s.gates, n = Math.floor((y - 700) / s.cfg.gap), target;
                if (n < 0) target = SnoGame.lerp(480, gates[0].x, SnoGame.clamp(y / 700, 0, 1));
                else if (n >= gates.length - 1) target = gates[gates.length - 1].x;
                else target = SnoGame.lerp(gates[n].x, gates[n + 1].x, (y - gates[n].y) / s.cfg.gap);
                var err = target - s.sk.x - s.sk.vx * 0.14;
                var hazard = s.obs.some(function (o) {
                    var gap = o.y - s.sk.y;
                    return (o.k === 'crev' || o.k === 'rock') && gap > 30 && gap < 105 && Math.abs(o.x - s.sk.x) < (o.w ? o.w / 2 + 15 : 24);
                });
                var a = hazard && !jumping && s.sk.z === 0;
                jumping = a;
                return { left: err < -8, right: err > 8, b: !a, a: a };
            });
        }
        results.push({ level: level, ticks: ticks, state: SnoGame.debug.state(), passed: SnoGame.debug.s().passed });
    }
    return results;
}

const { page, base, close } = await startSession();
try {
    for (const phone of [null, ...PHONES]) {
        const name = phone ? phone.name : 'desktop';
        if (phone) await page.emulatePhone(phone.width, phone.height);
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('aurora')");
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'aurora registration');
        const results = await page.eval(`(${playCourses.toString()})()`);
        for (const result of results) {
            assert.equal(result.state.screen, result.level === 3 ? 'victory' : 'clear', `${name}: level ${result.level} must be winnable`);
            assert.ok(result.state.lives > 0, `${name}: finishing must leave a life`);
            assert.ok(result.passed > 0, `${name}: the bot must actually pass gates`);
        }
        const idle = await page.eval(`(function(){
            SnoGame.debug.start(1);
            for(var i=0;i<40000 && SnoGame.debug.state().screen!=='over';i++) SnoGame.debug.step(1,{});
            return SnoGame.debug.state();
        })()`);
        assert.equal(idle.screen, 'over', `${name}: no input must lose`);
        assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), [], `${name}: no engine errors`);
        assert.deepEqual(page.problems, [], `${name}: no browser errors`);
        console.log(`ok   aurora ${name}: levels 1, 2, 3 won through steering and jumping; idle loses`);
        await page.eval('SnoGame.quit()');
    }
} finally {
    await close();
}
