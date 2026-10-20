// The campaign bot (bots/surveillance.js) wins every level on desktop and
// phones with ordinary inputs, and the run records what it met on the way:
// cones that saw it, EMP pulses, plates switched off, tripwires and
// searchlights. Standing still loses every level.
// node integrationtests/games/surveillance.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';
const BOT = readFileSync(new URL('./bots/surveillance.js', import.meta.url), 'utf8');
const run = `(function (bot) {
    var G = SnoGame, wins = [], idle = [];
    [1, 2, 3].forEach(function (level) {
        var mem = {}, seen = { cam: 0, guard: 0, drone: 0, light: 0 }, pulses = 0, platesOff = 0, beamsLive = 0, got = 0, open = false;
        G.debug.start(level);
        var lives = G.debug.state().lives, i = 0;
        for (; i < 20000 && G.debug.state().screen === 'play'; i++) {
            var s = G.debug.s(), emp = s.emp;
            G.debug.step(1, bot.play(s, G, mem) || {});
            if (G.debug.state().screen !== 'play') break;
            s = G.debug.s();
            if (s.cams.some(function (o) { return o.sees; })) seen.cam++;
            if (s.guards.some(function (o) { return o.sees; })) seen.guard++;
            if (s.drones.some(function (o) { return o.sees; })) seen.drone++;
            if (s.lights.some(function (o) { return o.sees; })) seen.light++;
            if (s.emp < emp && s.empFx > 0) pulses++;
            platesOff = Math.max(platesOff, s.plates.filter(function (p) { return p.off > 0; }).length);
            if (s.lasers.some(function (l) { return l.off <= 0 && (s.clock + l.phase) % s.def.blink < 1.5; })) beamsLive++;
            got = s.got; open = s.open;
        }
        var st = G.debug.state();
        wins.push({ level: level, screen: st.screen, lost: lives - st.lives, secs: +(i / 60).toFixed(1), got: got, drives: G.debug.s().drives.length,
            open: open, seen: seen, pulses: pulses, platesOff: platesOff, beamsLive: beamsLive, lights: G.debug.s().lights.length });
    });
    [1, 2, 3].forEach(function (level) {
        G.debug.start(level);
        G.debug.step(18000, {});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: wins, idle: idle };
})(${BOT})`;
const { page, base, close } = await startSession();
try {
    for (const phone of [null, ...PHONES]) {
        const name = phone ? phone.name : 'desktop';
        if (phone) await page.emulatePhone(phone.width, phone.height);
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('surveillance')");
        await page.waitFor('SnoGame.debug.state() && SnoGame.debug.state().registered', 'surveillance registration');
        const { wins, idle } = await page.eval(run);
        for (const w of wins) {
            assert.equal(w.screen, w.level === 3 ? 'victory' : 'clear', `${name}: ${JSON.stringify(w)}`);
            // the exit only opens with every drive taken, and the run ends on it
            assert.ok(w.open && w.got === w.drives, `${name} level ${w.level}: every drive, then the exit`);
            console.log(`ok surveillance ${name} level ${w.level}: ${w.secs}s, ${w.lost} lives lost, ${w.pulses} EMP, seen ${JSON.stringify(w.seen)}`);
        }
        const [one, two, three] = wins;
        assert.ok(one.seen.cam > 0, 'level 1 cameras watch the floor');
        assert.equal(one.beamsLive + one.platesOff + one.lights, 0, 'level 1 has cameras only');
        assert.ok(two.beamsLive > 0 && three.beamsLive > 0, 'tripwires blink on levels 2 and 3');
        assert.ok(three.pulses > 0 && three.platesOff > 0, 'the exit plate of level 3 needs an EMP');
        assert.ok(three.lights > 0 && two.lights === 0, 'searchlights in the finale only');
        for (const i of idle) assert.equal(i.screen, 'over', `${name} level ${i.level}: idle loses`);
        assert.deepEqual(await page.eval('SnoGame.debug.errors.slice()'), []);
        assert.deepEqual(page.problems, []);
        await page.eval('SnoGame.quit()');
    }
} finally { await close(); }
