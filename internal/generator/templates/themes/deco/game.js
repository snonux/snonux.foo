/*
 * Last Call — the deco theme's game: a Tapper-style rush behind the four
 * bars of a 1920s speakeasy.
 *
 * The bartender works the tap end of four bars (↑ ↓ jump between taps,
 * ← → walk along a bar). A cocktail poured at the tap slides down the bar
 * under friction; the first walking guest it reaches catches it, is shoved
 * back towards the door and drinks, then sends the empty sliding back,
 * which the bartender has to catch. A cocktail nobody catches, an empty
 * that reaches the tap end unattended, or a guest who walks the whole bar
 * costs a life. Guests shoved out of the door are served; serve the
 * level's quota to clear it.
 *
 * Level 2 adds a dance floor that moves guests between bars, tips and a
 * champagne tower that drains and must be topped up on the band's beat.
 * Level 3 is the raid: Prohibition agents want seltzer (B), not gin; the
 * gin must go behind the swing door before every inspection, and the
 * sergeant takes several seltzers before he storms out.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var BARS = [178, 268, 358, 448];                // y of each counter top
    var DOOR_X = 112, BAR_END = 836, TAP_X = 868, OUT_X = DOOR_X - 26, MIN_X = DOOR_X + 46;
    var FRIC = 110, GLASS_V = 560, RUN = 430, DRAG = 520, CATCH = 40, HOP = 0.12;
    var BEAT = 0.9, TOWER_DRAIN = 0.045, DRIFT_T = 0.8, RAID_WARN = 2.8, RAID_ON = 3.6;
    var C = {
        lacquer: '#0b0a08', ink: '#17130c', panel: '#1b1710', gold: '#d4af37', pale: '#f1d78a', deep: '#8a6d1f',
        emerald: '#1f7a5a', jade: '#3fb488', forest: '#0f3d2e', ivory: '#f4ecd8', ruby: '#a3263a',
        champagne: '#f7e3a1', water: '#a9dcef', dim: '#a39a82', red: '#e0453a'
    };
    var LOOKS = [
        { coat: '#1f7a5a', shirt: '#f4ecd8', skin: '#e8c39e', hair: '#1a1410', hat: 'band' },
        { coat: '#2b2b35', shirt: '#f4ecd8', skin: '#c99a6e', hair: '#2a1d14', hat: 'bowler' },
        { coat: '#a3263a', shirt: '#f1d78a', skin: '#f0d2b0', hair: '#5a3218', hat: 'cloche' },
        { coat: '#3d3324', shirt: '#f4ecd8', skin: '#8d5a3b', hair: '#120c08', hat: 'boater' }
    ];
    var AGENT = { coat: '#776b57', shirt: '#d8cfba', skin: '#e2b48c', hair: '#2a1d14', hat: 'fedora', badge: true };
    var SARGE = { coat: '#24325a', shirt: '#d8cfba', skin: '#e0937a', hair: '#2a1d14', hat: 'cap', badge: true };

    // Each level adds its own trouble; the walking pace rises only a little.
    var LEVELS = [
        { quota: 14, walk: 30, spawn: 3.1, max: 6, perBar: 2, push: 170, drink: 1.6, agents: 0, tips: 0, drift: 0 },
        { quota: 18, walk: 34, spawn: 2.6, max: 8, perBar: 3, push: 170, drink: 1.5, agents: 0, tips: 0.45, drift: 6, tower: true },
        { quota: 14, walk: 36, spawn: 2.7, max: 7, perBar: 3, push: 170, drink: 1.5, agents: 0.45, tips: 0.3, drift: 0, raid: true }
    ];

    function init(level) {
        var cfg = LEVELS[level - 1];
        return {
            level: level, cfg: cfg, touch: G.isTouch(), rnd: G.rng(1920 + level * 7919), t: 0,
            bt: { bar: 1, from: 1, x: TAP_X, vx: 0, hop: 0, pour: 0, cool: 0, ret: null, catchT: 0 },
            guests: [], glasses: [], tips: [], served: 0, spawnT: 1.2, calm: 0, nextId: 1,
            driftT: cfg.drift || 0, msg: '', msgT: 0, pic: null,
            tower: cfg.tower ? { fill: 0.7, dry: false, glow: 0, bank: 0 } : null,
            raid: cfg.raid ? { next: 9, warn: 0, on: 0, hidden: false, door: 0, siren: 0 } : null,
            sarge: null, sargeDone: false
        };
    }

    function say(s, text) { s.msg = text; s.msgT = 2.2; }

    // A thrown glass slows under friction; returns the new position.
    function slide(o, dt, fric) {
        var sp = Math.max(0, Math.abs(o.vx) - fric * dt);
        o.vx = o.vx < 0 ? -sp : sp;
        o.x += o.vx * dt;
    }

    // ------------------------------------------------------------------
    // Guests
    // ------------------------------------------------------------------

    function regulars(s) {
        return s.guests.filter(function (g) { return g.kind !== 'sarge'; }).length;
    }

    function onBar(s, bar) {
        return s.guests.filter(function (g) { return g.bar === bar && g.st !== 'drift'; });
    }

    // New guests come in through the door of the emptiest bar whose doorway
    // is clear, so two never stand on each other.
    function spawn(s, dt) {
        s.spawnT -= dt;
        if (s.spawnT > 0 || s.calm > 0) return;
        var active = regulars(s), cfg = s.cfg, cap = s.sarge ? 3 : cfg.max;
        if (active >= cap || (!s.sarge && s.served + active >= cfg.quota)) { s.spawnT = 0.4; return; }
        var best = -1, bestN = 99, start = Math.floor(s.rnd() * 4);
        for (var k = 0; k < 4; k++) {
            var b = (start + k) % 4, here = onBar(s, b);
            var clear = here.every(function (g) { return g.x > DOOR_X + 80; });
            if (clear && here.length < cfg.perBar && here.length < bestN) { best = b; bestN = here.length; }
        }
        if (best < 0) { s.spawnT = 0.4; return; }
        var agent = s.rnd() < cfg.agents;
        s.guests.push({ id: s.nextId++, kind: agent ? 'agent' : 'guest', bar: best, x: DOOR_X - 8, vx: 0, st: 'walk',
            ph: s.rnd() * 2, look: Math.floor(s.rnd() * LOOKS.length), drink: 0, rush: 0, stun: 0, hp: 1 });
        s.spawnT = cfg.spawn * (0.8 + 0.4 * s.rnd());
        G.tone(agent ? 196 : 330, 0.07, { type: 'triangle', vol: 0.08 });
    }

    // Guests walk in hops with pauses (the sergeant marches without them);
    // a dry champagne tower or a watered drink makes them hurry.
    function pace(s, g) {
        if (s.calm > 0) return 0;
        var v = s.cfg.walk;
        if (g.kind === 'sarge') v = 62;
        else if ((g.ph + s.t) % 1.4 > 0.95) return 0;
        if (g.kind === 'agent') v *= 1.1;
        if (s.tower && s.tower.dry) v *= 1.5;
        if (g.rush > 0) v *= 1.8;
        return v;
    }

    function moveGuest(s, g, dt) {
        if (g.st === 'drift') { g.p += dt / DRIFT_T; if (g.p >= 1) { g.bar = g.to; g.st = 'walk'; } return; }
        if (g.st === 'leave') { g.x -= 300 * dt; if (g.x < OUT_X) guestOut(s, g); return; }
        if (g.vx) slide(g, dt, DRAG);
        if (g.x < OUT_X && g.kind !== 'sarge') { guestOut(s, g); return; }
        if (g.kind === 'sarge') g.x = Math.max(g.x, DOOR_X);
        if (g.rush > 0) g.rush -= dt;
        if (g.st === 'drink') { g.drink -= dt; if (g.drink <= 0 && !g.vx) finishDrink(s, g); return; }
        if (g.stun > 0) { g.stun -= dt; return; }
        g.x += pace(s, g) * dt;
        if (g.x >= BAR_END - 26) reachedEnd(s, g);
    }

    function guestOut(s, g) {
        g.st = 'out';
        if (g.kind === 'sarge') { s.sargeDone = true; return; }
        s.served++;
        G.addScore(g.kind === 'agent' ? 150 : 100);
        G.popup(DOOR_X + 20, BARS[g.bar] - 70, g.kind === 'agent' ? 'DRY AGENT!' : 'CHEERS!', C.pale);
        G.tone(784, 0.08, { type: 'triangle', vol: 0.12 });
        G.tone(1175, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 });
    }

    // The empty goes back down the bar thrown just hard enough (plus a
    // little) to reach the tap end against the friction.
    function finishDrink(s, g) {
        var need = Math.sqrt(2 * FRIC * (BAR_END + 24 - g.x));
        s.glasses.push({ bar: g.bar, x: g.x + 20, vx: need * (1.05 + s.rnd() * 0.2), kind: 'empty', spin: 0 });
        g.st = 'walk';
        G.tone(1046, 0.05, { type: 'sine', vol: 0.08 });
        if (s.rnd() < s.cfg.tips) {
            s.tips.push({ bar: g.bar, x: Math.min(BAR_END - 40, g.x + 36), t: 7 });
            G.tone(1568, 0.06, { type: 'sine', vol: 0.06 });
        }
    }

    function reachedEnd(s, g) {
        var text = g.kind === 'sarge' ? 'THE SERGEANT REACHED THE TAP!' : g.kind === 'agent' ? 'AN AGENT REACHED THE TAP!' : 'YOU KEPT A GUEST WAITING!';
        G.burst(BAR_END - 10, BARS[g.bar] - 30, { n: 14, color: C.ruby, speed: 160 });
        if (g.kind === 'sarge') g.x = DOOR_X + 20;
        else g.st = 'out';
        loseRound(s, text);
    }

    // A lost life: the band strikes up, glasses are cleared and every guest
    // takes a step back, so the bar is never lost twice in one breath.
    function loseRound(s, text) {
        say(s, text);
        G.shake(6, 0.3);
        G.noise(0.35, { filter: 'highpass', freq: 2500, vol: 0.25 });
        if (G.loseLife() <= 0) return;
        s.glasses = [];
        s.calm = 1.6;
        s.guests.forEach(function (g) {
            if (g.st === 'walk' || g.st === 'drink') { g.x = Math.max(DOOR_X + 8, g.x - 240); g.vx = 0; }
        });
    }

    // Level 2: the dance floor sweeps a walking guest to a neighbouring bar.
    // Only a guest with no cocktail coming down its bar is taken, so a
    // drink already poured never slides off because of a dance.
    function drift(s, dt) {
        if (!s.cfg.drift) return;
        s.driftT -= dt;
        if (s.driftT > 0) return;
        s.driftT = s.cfg.drift * (0.8 + 0.4 * s.rnd());
        var pick = s.guests.filter(function (g) {
            return g.st === 'walk' && g.kind === 'guest' && g.x > DOOR_X + 60 && g.x < BAR_END - 160 && !fullOn(s, g.bar);
        });
        if (!pick.length) return;
        var g = pick[Math.floor(s.rnd() * pick.length)], to = g.bar === 0 ? 1 : g.bar === 3 ? 2 : g.bar + (s.rnd() < 0.5 ? -1 : 1);
        g.st = 'drift'; g.from = g.bar; g.to = to; g.p = 0;
        G.tone(523, 0.1, { type: 'triangle', vol: 0.07, slide: 659 });
    }

    function fullOn(s, bar) {
        return s.glasses.some(function (gl) { return gl.bar === bar && gl.kind !== 'empty'; });
    }

    // ------------------------------------------------------------------
    // Glasses
    // ------------------------------------------------------------------

    // The rightmost walking guest within reach of a cocktail catches it.
    function catcher(s, gl) {
        var best = null;
        s.guests.forEach(function (g) {
            if (g.bar !== gl.bar || (g.st !== 'walk')) return;
            if (gl.x <= g.x + 18 && gl.x >= g.x - 24 && (!best || g.x > best.x)) best = g;
        });
        return best;
    }

    function serve(s, g, gl) {
        gl.dead = true;
        var want = g.kind === 'guest' ? 'gin' : 'water';
        if (gl.kind !== want) { wrongDrink(s, g, gl); return; }
        if (g.kind === 'sarge') { hitSarge(s, g); return; }
        g.st = 'drink'; g.vx = -Math.sqrt(2 * DRAG * s.cfg.push); g.drink = s.cfg.drink;
        G.addScore(50);
        G.tone(1568, 0.07, { type: 'sine', vol: 0.12 });
        G.tone(2093, 0.09, { type: 'sine', vol: 0.09, delay: 0.04 });
        G.burst(g.x + 14, BARS[g.bar] - 18, { n: 6, color: gl.kind === 'gin' ? C.champagne : C.water, speed: 90, life: 0.4 });
    }

    function wrongDrink(s, g, gl) {
        if (gl.kind === 'gin') {
            G.sfx('alarm');
            loseRound(s, g.kind === 'sarge' ? 'GIN FOR THE SERGEANT? BUSTED!' : 'GIN FOR AN AGENT? BUSTED!');
            return;
        }
        // A guest handed seltzer refuses it and hurries up the bar.
        g.rush = 2.5;
        G.popup(g.x, BARS[g.bar] - 70, 'WATERED DOWN!', C.water);
        G.noise(0.18, { filter: 'bandpass', freq: 1200, vol: 0.18 });
        G.burst(g.x + 14, BARS[g.bar] - 18, { n: 10, color: C.water, speed: 140, life: 0.5 });
    }

    function hitSarge(s, g) {
        g.hp--;
        g.vx = -Math.sqrt(2 * DRAG * 150); g.stun = 0.5;
        G.addScore(200);
        G.shake(4, 0.2);
        G.sfx('hit');
        G.burst(g.x + 16, BARS[g.bar] - 30, { n: 14, color: C.water, speed: 180 });
        if (g.hp > 0) { G.popup(g.x, BARS[g.bar] - 90, 'SELTZER! ' + g.hp + ' MORE', C.water); return; }
        g.st = 'leave'; g.vx = 0;
        say(s, 'THE SERGEANT STORMS OUT!');
        G.addScore(1000);
        G.sfx('power');
    }

    function catchEmpty(s, gl) {
        var b = s.bt;
        if (b.bar !== gl.bar || gl.x < b.x - CATCH || gl.x > b.x + 12) return false;
        gl.dead = true; b.catchT = 0.2;
        G.addScore(30);
        G.tone(1318, 0.05, { type: 'triangle', vol: 0.12 });
        return true;
    }

    function updateGlasses(s, dt) {
        s.glasses.forEach(function (gl) {
            slide(gl, dt, FRIC);
            gl.spin += dt * Math.abs(gl.vx) * 0.02;
            if (gl.kind === 'empty') {
                if (catchEmpty(s, gl)) return;
                if (gl.x > BAR_END + 6) { gl.dead = true; crash(s, gl, 'AN EMPTY HIT THE FLOOR!'); }
                return;
            }
            var g = catcher(s, gl);
            if (g) serve(s, g, gl);
            else if (gl.x < DOOR_X - 6) { gl.dead = true; crash(s, gl, 'A COCKTAIL SLID OFF THE BAR!'); }
        });
        s.glasses = s.glasses.filter(function (gl) { return !gl.dead; });
    }

    function crash(s, gl, text) {
        G.burst(G.clamp(gl.x, DOOR_X, BAR_END), BARS[gl.bar] + 20, { n: 16, color: C.ivory, speed: 200, gravity: 600, life: 0.6 });
        loseRound(s, text);
    }

    // ------------------------------------------------------------------
    // The bartender
    // ------------------------------------------------------------------

    function switchBar(s, d) {
        var b = s.bt;
        b.from = b.bar; b.bar = (b.bar + d + 4) % 4; b.hop = HOP;
        b.x = TAP_X; b.vx = 0; b.ret = null;
        G.tone(d < 0 ? 440 : 349, 0.04, { type: 'square', vol: 0.05 });
    }

    // Pouring needs the tap: away from it, the order sends the bartender
    // running back and the drink is poured on arrival.
    function order(s, kind) {
        if (s.bt.x < TAP_X - 3) { s.bt.ret = kind; return; }
        pour(s, kind);
    }

    function pour(s, kind) {
        var b = s.bt;
        if (b.cool > 0) return;
        if (kind === 'gin' && s.raid && s.raid.hidden) {
            G.popup(TAP_X - 60, BARS[b.bar] - 70, 'THE GIN IS HIDDEN', C.ruby);
            G.tone(110, 0.12, { type: 'square', vol: 0.08 });
            return;
        }
        s.glasses.push({ bar: b.bar, x: BAR_END - 8, vx: -GLASS_V, kind: kind, spin: 0 });
        b.cool = 0.26; b.pour = 0.18;
        G.noise(0.1, { filter: 'bandpass', freq: kind === 'gin' ? 900 : 2200, vol: 0.14 });
        G.tone(kind === 'gin' ? 523 : 784, 0.08, { type: 'triangle', vol: 0.08, slide: kind === 'gin' ? 880 : 1175 });
    }

    function updateBartender(s, dt) {
        var b = s.bt;
        b.hop = Math.max(0, b.hop - dt); b.cool -= dt; b.pour -= dt; b.catchT -= dt;
        if (G.hit.up) switchBar(s, -1);
        else if (G.hit.down) switchBar(s, 1);
        var want = b.ret ? 1.8 : (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        b.vx += (want * RUN - b.vx) * Math.min(1, dt * 14);
        b.x = G.clamp(b.x + b.vx * dt, MIN_X, TAP_X);
        if (b.x >= TAP_X && b.ret) { pour(s, b.ret); b.ret = null; }
        if (G.hit.a) order(s, 'gin');
        else if (G.hit.b && !s.tower) order(s, 'water');
        if (s.raid && G.hit.right && b.x >= TAP_X - 2) hideGin(s);
        collectTips(s);
    }

    function collectTips(s) {
        var b = s.bt;
        s.tips = s.tips.filter(function (tp) {
            if (tp.bar !== b.bar || Math.abs(tp.x - b.x) > 26) return true;
            G.addScore(150);
            G.popup(tp.x, BARS[tp.bar] - 60, 'TIP +150', C.pale);
            G.sfx('coin');
            return false;
        });
    }

    // ------------------------------------------------------------------
    // Level 2: the champagne tower
    // ------------------------------------------------------------------

    function beatPhase(s) { return (s.t % BEAT) / BEAT; }
    function onBeat(s) { var p = beatPhase(s); return p < 0.16 || p > 0.9; }

    function updateTower(s, dt) {
        var tw = s.tower;
        if (!tw) return;
        tw.fill = Math.max(0, tw.fill - TOWER_DRAIN * dt);
        tw.glow = Math.max(0, tw.glow - dt);
        if (!tw.dry && tw.fill <= 0) { tw.dry = true; say(s, 'THE TOWER RAN DRY! THE CROWD RUSHES'); G.sfx('alarm'); }
        if (tw.dry && tw.fill >= 0.3) { tw.dry = false; say(s, 'THE BUBBLY FLOWS AGAIN'); }
        // A full tower keeps the gala sweet: a trickle of points.
        if (tw.fill > 0.75) { tw.bank += dt; if (tw.bank >= 1) { tw.bank -= 1; G.addScore(10); } }
        if (G.hit.b) refill(s, tw);
    }

    function refill(s, tw) {
        if (onBeat(s)) {
            tw.fill = Math.min(1, tw.fill + 0.24); tw.glow = 0.45;
            G.addScore(40);
            G.popup(480, 118, 'ON THE BEAT!', C.pale);
            G.tone(1046, 0.08, { type: 'triangle', vol: 0.1 });
            G.tone(1318, 0.08, { type: 'triangle', vol: 0.1, delay: 0.06 });
            G.tone(1568, 0.14, { type: 'triangle', vol: 0.1, delay: 0.12 });
            G.burst(480, 60, { n: 12, color: C.champagne, speed: 120, gravity: 200, life: 0.6 });
            return;
        }
        tw.fill = Math.min(1, tw.fill + 0.04);
        G.popup(480, 118, 'OFF THE BEAT', C.dim);
        G.noise(0.2, { filter: 'bandpass', freq: 3000, vol: 0.12 });
    }

    // ------------------------------------------------------------------
    // Level 3: the raid
    // ------------------------------------------------------------------

    function updateRaid(s, dt) {
        var r = s.raid;
        if (!r) return;
        r.door = Math.max(0, r.door - dt);
        if (r.on > 0) {
            r.on -= dt;
            if (r.on <= 0) { r.hidden = false; r.next = 12 + s.rnd() * 4; say(s, 'ALL CLEAR: THE GIN IS BACK'); G.tone(659, 0.15, { type: 'triangle', vol: 0.1 }); }
            return;
        }
        if (r.warn > 0) {
            r.warn -= dt; r.siren -= dt;
            if (r.siren <= 0) { r.siren = 0.5; G.tone(880, 0.22, { type: 'sine', vol: 0.07, slide: 1320 }); }
            if (r.warn <= 0) inspect(s, r);
            return;
        }
        r.next -= dt;
        if (r.next <= 0) { r.warn = RAID_WARN; r.siren = 0; say(s, 'RAID! HIDE THE GIN: → AT THE TAP'); G.sfx('alarm'); }
    }

    function inspect(s, r) {
        r.on = RAID_ON;
        if (r.hidden) { G.addScore(150); say(s, 'NOTHING TO SEE HERE, OFFICER'); return; }
        r.hidden = true;
        loseRound(s, 'EVIDENCE! THE AGENTS SAW THE GIN');
    }

    function hideGin(s) {
        var r = s.raid;
        if (r.hidden) return;
        if (r.warn <= 0) { G.popup(TAP_X - 40, BARS[s.bt.bar] - 70, 'NO RAID YET', C.dim); return; }
        r.hidden = true; r.door = 0.7;
        G.addScore(100);
        G.tone(180, 0.22, { type: 'sawtooth', vol: 0.06, slide: 110 });
        G.noise(0.12, { filter: 'lowpass', freq: 600, vol: 0.15, delay: 0.15 });
    }

    // The sergeant comes in once the quota is served; he changes bars every
    // few seconds, but never while a drink is coming down his bar.
    function updateSarge(s, dt) {
        if (!s.raid) return;
        if (!s.sarge && s.served >= s.cfg.quota) {
            s.sarge = { id: s.nextId++, kind: 'sarge', bar: Math.floor(s.rnd() * 4), x: DOOR_X - 8, vx: 0, st: 'walk',
                ph: 0, look: 0, drink: 0, rush: 0, stun: 0, hp: 5, hop: 4.5 };
            s.guests.push(s.sarge);
            say(s, 'THE SERGEANT! FIVE SELTZERS TO SEND HIM PACKING');
            G.sfx('alarm');
        }
        var g = s.sarge;
        if (!g || g.st !== 'walk') return;
        g.hop -= dt;
        if (g.hop > 0 || fullOn(s, g.bar)) return;
        g.hop = 4.5;
        g.st = 'drift'; g.from = g.bar; g.to = (g.bar + (s.rnd() < 0.5 ? 1 : 3)) % 4; g.p = 0;
        G.tone(147, 0.12, { type: 'square', vol: 0.08 });
    }

    function update(s, dt) {
        s.t += dt;
        if (s.msgT > 0) s.msgT -= dt;
        if (s.calm > 0) s.calm -= dt;
        updateBartender(s, dt);
        updateTower(s, dt);
        updateRaid(s, dt);
        spawn(s, dt);
        drift(s, dt);
        updateSarge(s, dt);
        s.guests.slice().forEach(function (g) { if (g.st !== 'out') moveGuest(s, g, dt); });
        s.guests = s.guests.filter(function (g) { return g.st !== 'out'; });
        updateGlasses(s, dt);
        s.tips = s.tips.filter(function (tp) { tp.t -= dt; return tp.t > 0; });
        if (s.raid ? s.sargeDone : s.served >= s.cfg.quota) G.win(500 + G.lives * 250);
    }

    // ------------------------------------------------------------------
    // Drawing: the room (cached), people, glasses, panels
    // ------------------------------------------------------------------

    // A sunburst fan: n rays from (x, y) between angles a0 and a1.
    function fan(ctx, x, y, r, a0, a1, n, color, rot) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (var i = 0; i < n; i += 2) {
            var a = a0 + (a1 - a0) * i / n + (rot || 0), b = a0 + (a1 - a0) * (i + 1) / n + (rot || 0);
            ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
        }
        ctx.fill();
    }

    // Thin gold double rule around a rectangle, with stepped corners.
    function frame(ctx, x, y, w, h, color) {
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
        ctx.fillStyle = color;
        [[x, y], [x + w - 10, y], [x, y + h - 10], [x + w - 10, y + h - 10]].forEach(function (p) {
            ctx.fillRect(p[0], p[1], 10, 3); ctx.fillRect(p[0] + (p[0] > x ? 7 : 0), p[1], 3, 10);
        });
    }

    function paintTopBand(s, g) {
        if (s.level === 2) {
            g.fillStyle = '#0d1a22'; g.fillRect(0, 30, G.W, 85);
            g.fillStyle = '#060a0d';
            for (var i = 0; i < 16; i++) {
                var bw = 30 + (i * 37) % 40, bh = 30 + (i * 53) % 50, bx = i * 62 - 10;
                g.fillRect(bx, 115 - bh, bw, bh); g.fillRect(bx + bw / 2 - 3, 115 - bh - 14, 6, 14);
            }
            g.fillStyle = 'rgba(241,215,138,0.7)';
            for (i = 0; i < 40; i++) g.fillRect((i * 97) % G.W, 36 + (i * 41) % 40, 2, 2);
            return;
        }
        g.fillStyle = '#120f0a'; g.fillRect(0, 30, G.W, 85);
        fan(g, 480, 118, 200, Math.PI, Math.PI * 2, 24, 'rgba(212,175,55,0.13)');
        if (s.level === 3) {
            for (i = 0; i < 3; i++) { g.fillStyle = '#1d2a33'; g.fillRect(250 + i * 180, 44, 100, 46); frame(g, 246 + i * 180, 40, 108, 54, C.deep); }
        } else {
            frame(g, 330, 40, 300, 66, C.gold);
        }
    }

    // The back wall of one bar: mirror panel, a shelf of bottles, the
    // swinging door on the left where guests come in.
    function paintBarRow(s, g, i) {
        var y = BARS[i], top = y - 62;
        g.fillStyle = i % 2 ? '#13110c' : '#100e0a'; g.fillRect(0, top, G.W, 62);
        g.strokeStyle = 'rgba(212,175,55,0.22)'; g.lineWidth = 1;
        g.beginPath();
        for (var x = DOOR_X + 40; x < BAR_END; x += 70) { g.moveTo(x, top + 4); g.lineTo(x + 35, top + 18); g.lineTo(x + 70, top + 4); }
        g.stroke();
        paintShelf(g, top + 44, i);
        g.fillStyle = s.level === 2 ? (i % 2 ? '#1c3a2f' : '#2a1f10') : '#1a1a1a';
        g.fillRect(52, top - 2, DOOR_X - 56, 64);
        g.fillStyle = C.forest; g.fillRect(60, top + 6, 22, 52); g.fillRect(86, top + 6, 22, 52);
        g.fillStyle = C.gold; g.fillRect(58, top + 4, 52, 2); g.fillRect(83, top + 6, 2, 52);
        g.beginPath(); g.arc(71, top + 22, 5, 0, Math.PI * 2); g.arc(97, top + 22, 5, 0, Math.PI * 2); g.fill();
        // The taps at the bartender's end.
        g.fillStyle = C.deep; g.fillRect(BAR_END - 4, y - 30, 14, 30);
        g.fillStyle = C.gold; g.fillRect(BAR_END - 8, y - 34, 22, 6); g.fillRect(BAR_END + 4, y - 48, 4, 16);
        if (s.level === 3) paintSwingDoor(g, y);
    }

    // A dim back-bar shelf of bottles behind the guests.
    var BOTTLES = ['rgba(31,122,90,0.55)', 'rgba(163,38,58,0.5)', 'rgba(212,175,55,0.45)', 'rgba(169,220,239,0.3)'];
    function paintShelf(g, y, row) {
        g.fillStyle = 'rgba(138,109,31,0.6)'; g.fillRect(DOOR_X + 30, y, BAR_END - DOOR_X - 60, 2);
        for (var x = DOOR_X + 44, n = row; x < BAR_END - 40; x += 26, n++) {
            var h = 14 + (n * 7) % 10;
            g.fillStyle = BOTTLES[n % 4];
            g.fillRect(x, y - h, 9, h); g.fillRect(x + 3, y - h - 6, 3, 6);
        }
    }

    function paintSwingDoor(g, y) {
        g.fillStyle = '#2a1a10'; g.fillRect(902, y - 60, 50, 60);
        g.strokeStyle = C.gold; g.lineWidth = 1; g.strokeRect(902.5, y - 59.5, 49, 59);
        g.beginPath(); g.moveTo(927, y - 58); g.lineTo(927, y); g.stroke();
    }

    // The counter: gold edge, emerald lacquer front with chevrons.
    function paintCounter(g, y) {
        g.fillStyle = C.gold; g.fillRect(DOOR_X - 4, y, BAR_END - DOOR_X + 14, 4);
        g.fillStyle = C.pale; g.fillRect(DOOR_X - 4, y, BAR_END - DOOR_X + 14, 1);
        g.fillStyle = C.forest; g.fillRect(DOOR_X - 4, y + 4, BAR_END - DOOR_X + 14, 24);
        g.fillStyle = C.emerald;
        g.beginPath();
        for (var x = DOOR_X; x < BAR_END; x += 28) { g.moveTo(x, y + 26); g.lineTo(x + 14, y + 8); g.lineTo(x + 28, y + 26); g.lineTo(x + 22, y + 26); g.lineTo(x + 14, y + 16); g.lineTo(x + 6, y + 26); }
        g.fill();
        g.fillStyle = C.deep; g.fillRect(DOOR_X - 4, y + 27, BAR_END - DOOR_X + 14, 2);
    }

    function paintRoom(s, g) {
        g.fillStyle = C.lacquer; g.fillRect(0, 0, G.W, G.H);
        paintTopBand(s, g);
        for (var i = 0; i < 4; i++) paintBarRow(s, g, i);
        for (i = 0; i < 4; i++) paintCounter(g, BARS[i]);
        if (s.level === 2) {
            for (i = 0; i < 18; i++) {
                g.fillStyle = (i + Math.floor(i / 2)) % 2 ? 'rgba(212,175,55,0.16)' : 'rgba(31,122,90,0.2)';
                g.fillRect(4 + (i % 2) * 22, 120 + Math.floor(i / 2) * 40, 22, 40);
            }
        }
        g.fillStyle = '#080706'; g.fillRect(0, 484, G.W, 56);
        g.fillStyle = C.gold; g.fillRect(0, 484, G.W, 1); g.fillRect(0, 487, G.W, 1);
        frame(g, 0, 30, G.W, G.H - 30, C.deep);
    }

    // Static scenery is painted once into a picture the size of the canvas
    // and copied every frame; without a real canvas (tests) it is painted
    // directly.
    function drawRoom(s, ctx) {
        var c = ctx.canvas;
        if (!c || typeof document === 'undefined') { paintRoom(s, ctx); return; }
        var p = s.pic;
        if (!p || p.w !== c.width || p.h !== c.height) {
            p = s.pic = { w: c.width, h: c.height, img: p ? p.img : document.createElement('canvas') };
            p.img.width = c.width; p.img.height = c.height;
            var g = p.img.getContext('2d');
            g.setTransform(c.width / G.W, 0, 0, c.height / G.H, 0, 0);
            paintRoom(s, g);
        }
        ctx.drawImage(p.img, 0, 0, G.W, G.H);
    }

    function drawHat(ctx, x, top, k, look) {
        ctx.fillStyle = look.hair;
        if (look.hat === 'band') {
            ctx.beginPath(); ctx.arc(x, top + 9 * k, 10 * k, Math.PI, 0); ctx.fill();
            ctx.fillStyle = C.gold; ctx.fillRect(x - 10 * k, top + 6 * k, 20 * k, 3 * k);
            ctx.fillStyle = C.ivory; ctx.fillRect(x - 8 * k, top - 8 * k, 2 * k, 14 * k);
            return;
        }
        var colour = { bowler: '#111', cloche: '#6a1e2c', boater: '#d9c48a', fedora: '#4a3d2c', cap: '#1a2444' }[look.hat];
        ctx.fillStyle = colour;
        if (look.hat === 'cloche') { ctx.beginPath(); ctx.arc(x, top + 9 * k, 11 * k, Math.PI, 0); ctx.fill(); return; }
        if (look.hat === 'bowler') { ctx.beginPath(); ctx.arc(x, top + 4 * k, 8 * k, Math.PI, 0); ctx.fill(); }
        else ctx.fillRect(x - 8 * k, top - 6 * k, 16 * k, 10 * k);
        ctx.fillRect(x - 13 * k, top + 3 * k, 26 * k, 3 * k);
        if (look.hat === 'boater' || look.hat === 'cap') { ctx.fillStyle = look.hat === 'cap' ? C.gold : C.ruby; ctx.fillRect(x - 8 * k, top, 16 * k, 2 * k); }
    }

    // A guest stands behind the counter (y), facing the bartender.
    function drawPerson(ctx, x, y, look, k, drinking) {
        ctx.fillStyle = look.coat;
        ctx.beginPath(); ctx.moveTo(x - 13 * k, y); ctx.lineTo(x - 10 * k, y - 34 * k); ctx.lineTo(x + 10 * k, y - 34 * k); ctx.lineTo(x + 13 * k, y); ctx.fill();
        ctx.fillStyle = look.shirt;
        ctx.beginPath(); ctx.moveTo(x - 4 * k, y - 34 * k); ctx.lineTo(x + 4 * k, y - 34 * k); ctx.lineTo(x, y - 24 * k); ctx.fill();
        if (look.badge) { ctx.fillStyle = C.gold; ctx.fillRect(x + 4 * k, y - 26 * k, 4 * k, 4 * k); }
        ctx.fillStyle = look.skin;
        ctx.beginPath(); ctx.arc(x, y - 44 * k, 9 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(x + 4 * k, y - 46 * k, 2 * k, 2 * k);
        drawHat(ctx, x, y - 55 * k, k, look);
        ctx.fillStyle = look.coat;
        if (drinking) {
            ctx.fillRect(x + 6 * k, y - 40 * k, 5 * k, 14 * k);
            ctx.fillStyle = C.champagne; ctx.fillRect(x + 9 * k, y - 46 * k, 6 * k, 6 * k);
        } else ctx.fillRect(x + 8 * k, y - 10 * k, 10 * k, 5 * k);
    }

    function guestY(g) {
        if (g.st !== 'drift') return BARS[g.bar];
        var e = g.p * g.p * (3 - 2 * g.p);
        return G.lerp(BARS[g.from], BARS[g.to], e) - Math.sin(g.p * Math.PI) * 18;
    }

    function drawGuest(s, ctx, g) {
        var look = g.kind === 'agent' ? AGENT : g.kind === 'sarge' ? SARGE : LOOKS[g.look];
        var k = g.kind === 'sarge' ? 1.22 : 1, walking = g.st === 'walk' && pace(s, g) > 0;
        var bob = walking ? Math.abs(Math.sin(s.t * 9 + g.ph * 3)) * 3 : 0, y = guestY(g) - bob;
        if (g.st === 'drift') { ctx.globalAlpha = 0.85; }
        drawPerson(ctx, g.x, y, look, k, g.st === 'drink');
        ctx.globalAlpha = 1;
        if (g.rush > 0) G.text('!', g.x - 16, y - 58, { size: 22, color: C.red, bold: true });
        if (g.kind === 'sarge') {
            for (var i = 0; i < g.hp; i++) { ctx.fillStyle = C.water; ctx.fillRect(g.x - 25 + i * 11, y - 92, 8, 8); }
        }
    }

    function drawBartender(s, ctx) {
        var b = s.bt, e = b.hop / HOP, y = G.lerp(BARS[b.bar], BARS[b.from], e * e), x = b.x;
        ctx.fillStyle = C.ivory; ctx.fillRect(x - 12, y - 34, 24, 34);
        ctx.fillStyle = C.emerald; ctx.fillRect(x - 12, y - 30, 7, 30); ctx.fillRect(x + 5, y - 30, 7, 30);
        ctx.fillStyle = '#111'; ctx.fillRect(x - 5, y - 35, 10, 4);
        ctx.fillStyle = '#e6b892'; ctx.beginPath(); ctx.arc(x, y - 44, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#16100a'; ctx.beginPath(); ctx.arc(x, y - 47, 9, Math.PI, 0); ctx.fill();
        ctx.fillRect(x - 7, y - 40, 7, 2);
        ctx.fillStyle = C.ivory;
        var reach = b.pour > 0 || b.catchT > 0 ? 22 : 12;
        ctx.fillRect(x - reach - 4, y - 12, reach, 5);
        if (s.raid && s.raid.door > 0) G.text('GIN!', x + 30, y - 66, { size: 20, color: C.pale, bold: true });
    }

    function drawGlass(s, ctx, gl) {
        var x = gl.x, y = BARS[gl.bar], k = s.touch ? 1.3 : 1;
        var wob = gl.kind === 'empty' ? Math.sin(gl.spin) * 2 : 0;
        ctx.strokeStyle = C.ivory; ctx.lineWidth = 1.5;
        if (gl.kind === 'water') {
            ctx.fillStyle = 'rgba(169,220,239,0.75)'; ctx.fillRect(x - 6 * k, y - 20 * k, 12 * k, 20 * k);
            ctx.strokeRect(x - 6 * k, y - 20 * k, 12 * k, 20 * k);
            ctx.fillStyle = C.ivory; ctx.fillRect(x - 2, y - 14 * k + Math.sin(s.t * 12) * 3, 2, 2);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(x - 6 * k, y - 1); ctx.lineTo(x + 6 * k, y - 1); ctx.moveTo(x, y - 1); ctx.lineTo(x + wob, y - 10 * k);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 11 * k + wob, y - 20 * k); ctx.quadraticCurveTo(x + wob, y - 4 * k, x + 11 * k + wob, y - 20 * k); ctx.closePath();
        if (gl.kind === 'gin') { ctx.fillStyle = C.champagne; ctx.fill(); }
        ctx.stroke();
        if (gl.kind === 'gin') { ctx.fillStyle = C.ruby; ctx.beginPath(); ctx.arc(x + 3, y - 17 * k, 2.5 * k, 0, Math.PI * 2); ctx.fill(); }
    }

    function drawTips(s, ctx) {
        s.tips.forEach(function (tp) {
            var y = BARS[tp.bar], blink = tp.t < 2 && Math.floor(tp.t * 8) % 2;
            if (blink) return;
            ctx.fillStyle = C.gold; ctx.fillRect(tp.x - 8, y - 6, 16, 6); ctx.fillRect(tp.x - 6, y - 11, 12, 5);
            ctx.fillStyle = C.pale; ctx.fillRect(tp.x - 6, y - 11, 12, 1);
        });
    }

    // The tower: a pyramid of coupes that fills from the top down, with a
    // gold ring that swells on every beat of the band.
    function drawTower(s, ctx) {
        var tw = s.tower, p = beatPhase(s), cx = 480, base = 104, lit = Math.round(tw.fill * 10);
        ctx.strokeStyle = 'rgba(241,215,138,' + (0.6 * (1 - p)).toFixed(2) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, 72, 30 + p * 34, 0, Math.PI * 2); ctx.stroke();
        var n = 0;
        for (var row = 0; row < 4; row++) {
            for (var c = 0; c <= row; c++, n++) {
                var x = cx + (c - row / 2) * 24, y = base - (3 - row) * 18 - 0;
                ctx.fillStyle = n < lit ? C.champagne : 'rgba(244,236,216,0.15)';
                ctx.beginPath(); ctx.moveTo(x - 10, y - 12); ctx.quadraticCurveTo(x, y, x + 10, y - 12); ctx.fill();
            }
        }
        if (tw.glow > 0) G.text('✦', cx, 40, { size: 22, color: C.pale, align: 'center' });
        if (tw.dry) G.text('DRY!', cx + 70, 70, { size: 22, color: C.red, bold: true });
    }

    function drawRaidBand(s, ctx) {
        var r = s.raid, alarm = r.warn > 0 && Math.floor(s.t * 6) % 2;
        for (var i = 0; i < 3; i++) {
            ctx.fillStyle = alarm ? 'rgba(224,69,58,0.55)' : 'rgba(31,122,90,0.18)';
            ctx.fillRect(250 + i * 180, 44, 100, 46);
            if (r.warn > 0 || r.on > 0) { ctx.fillStyle = '#050505'; ctx.fillRect(285 + i * 180, 56, 22, 34); ctx.beginPath(); ctx.arc(296 + i * 180, 54, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(282 + i * 180, 46, 28, 4); }
        }
        if (r.on > 0) {
            var sx = 480 + Math.sin(s.t * 2.2) * 380;
            ctx.fillStyle = 'rgba(247,227,161,0.1)';
            ctx.beginPath(); ctx.moveTo(480, 30); ctx.lineTo(sx - 70, 484); ctx.lineTo(sx + 70, 484); ctx.fill();
        }
        if (r.door > 0) {
            var y = BARS[s.bt.bar], open = Math.sin(r.door / 0.7 * Math.PI) * 22;
            ctx.fillStyle = C.lacquer; ctx.fillRect(904, y - 58, open, 58);
        }
    }

    // Marquee bulbs along the top band chase round all the time, so the
    // room is never still.
    function drawBulbs(s, ctx) {
        var step = Math.floor(s.t * 6);
        for (var pass = 0; pass < 2; pass++) {
            ctx.fillStyle = pass ? C.pale : 'rgba(138,109,31,0.6)';
            for (var i = 0; i < 24; i++) {
                if (((i + step) % 3 === 0) === !!pass) ctx.fillRect(26 + i * 39, 110, 5, 5);
            }
        }
    }

    function drawStrip(s, ctx) {
        var y = 520, sz = s.touch ? 22 : 18;
        var left = 'SERVED ' + s.served + ' / ' + s.cfg.quota;
        G.text(left, 22, y, { size: sz, color: C.pale });
        if (s.tower) {
            ctx.fillStyle = 'rgba(244,236,216,0.12)'; ctx.fillRect(330, 503, 300, 18);
            ctx.fillStyle = s.tower.dry ? C.red : C.champagne; ctx.fillRect(330, 503, 300 * s.tower.fill, 18);
            ctx.strokeStyle = C.gold; ctx.strokeRect(330.5, 503.5, 299, 17);
            var on = onBeat(s);
            ctx.fillStyle = on ? C.pale : C.deep; ctx.beginPath(); ctx.arc(660, 512, on ? 11 : 7, 0, Math.PI * 2); ctx.fill();
            G.text((s.touch ? 'FIZZ' : 'X') + ' on the beat', 684, y, { size: sz, color: C.dim });
        } else if (s.raid) {
            var r = s.raid, txt = r.hidden ? 'GIN: BEHIND THE DOOR' : r.warn > 0 ? 'RAID! → AT THE TAP HIDES THE GIN' : 'GIN ON THE SHELF';
            G.text(txt, 330, y, { size: sz, color: r.warn > 0 && !r.hidden ? C.red : C.pale });
            G.text('agents: ' + (s.touch ? 'FIZZ' : 'X') + ' seltzer', 940, y, { size: sz, color: C.water, align: 'right' });
        } else {
            G.text('catch every empty before it hits the floor', 940, y, { size: sz, color: C.dim, align: 'right' });
        }
    }

    function draw(s, ctx) {
        drawRoom(s, ctx);
        drawBulbs(s, ctx);
        if (s.tower) drawTower(s, ctx);
        if (s.raid) drawRaidBand(s, ctx);
        else if (s.level === 1) G.text('THE SPEAKEASY', 480, 82, { size: 30, color: C.gold, align: 'center' });
        for (var i = 0; i < 4; i++) {
            s.guests.forEach(function (g) { if (g.bar === i && g.st !== 'drift') drawGuest(s, ctx, g); });
            if (s.bt.bar === i) drawBartender(s, ctx);
        }
        s.guests.forEach(function (g) { if (g.st === 'drift') drawGuest(s, ctx, g); });
        s.glasses.forEach(function (gl) { drawGlass(s, ctx, gl); });
        drawTips(s, ctx);
        drawStrip(s, ctx);
        if (s.msgT > 0) {
            ctx.globalAlpha = Math.min(1, s.msgT * 2);
            ctx.fillStyle = 'rgba(11,10,8,0.82)'; ctx.fillRect(220, 236, 520, 44);
            ctx.strokeStyle = C.gold; ctx.strokeRect(220.5, 236.5, 519, 43);
            G.text(s.msg, 480, 266, { size: s.touch ? 22 : 20, color: C.pale, align: 'center', max: 500 });
            ctx.globalAlpha = 1;
        }
    }

    function hud(s) {
        if (s.sarge && !s.sargeDone) return 'SERGEANT ' + Math.max(0, s.sarge.hp);
        if (s.tower) return 'TOWER ' + Math.round(s.tower.fill * 100) + '%';
        if (s.raid) return s.raid.hidden ? 'GIN HIDDEN' : 'GIN OUT';
        return 'GUESTS ' + s.guests.length;
    }

    // ------------------------------------------------------------------
    // The ending: a gold sunburst turns behind a champagne fountain while
    // confetti and pearls rain. Driven by e.t alone.
    // ------------------------------------------------------------------

    function drawEnding(e, ctx) {
        var t = e.t;
        fan(ctx, 480, 560, 900, Math.PI, Math.PI * 3, 40, 'rgba(212,175,55,0.1)', t * 0.25);
        fan(ctx, 480, 560, 520, Math.PI, Math.PI * 3, 28, 'rgba(31,122,90,0.12)', -t * 0.4);
        fountain(ctx, 82, t);
        fountain(ctx, 878, t + 0.4);
        endingRain(t, ctx);
    }

    // A champagne fountain: a pyramid of coupes with bubbly spilling over
    // the rims, at the side of the scene so the text stays clear.
    function fountain(ctx, cx, t) {
        for (var row = 0; row < 4; row++) {
            for (var c = 0; c <= row; c++) {
                var x = cx + (c - row / 2) * 40, y = 300 + row * 40;
                ctx.fillStyle = C.champagne;
                ctx.beginPath(); ctx.moveTo(x - 17, y); ctx.quadraticCurveTo(x, y + 20, x + 17, y); ctx.fill();
                ctx.fillStyle = C.gold; ctx.fillRect(x - 1, y + 9, 2, 20); ctx.fillRect(x - 8, y + 28, 16, 2);
            }
        }
        ctx.strokeStyle = 'rgba(247,227,161,0.65)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
            var side = i % 2 ? 1 : -1, r = Math.floor(i / 2), sx = cx + side * (17 + r * 20), sy = 300 + r * 40;
            ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + side * 8, sy + 4, sx + side * 10, sy + 34 + (t * 40 + i * 9) % 6);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(244,236,216,0.75)';
        for (i = 0; i < 12; i++) ctx.fillRect(cx + Math.sin(i * 2.3 + t * 2) * 40, 296 - ((t * 50 + i * 23) % 180), 3, 3);
    }

    function endingRain(t, ctx) {
        var cols = [C.gold, C.emerald, C.ivory, C.ruby, C.pale];
        for (var i = 0; i < 70; i++) {
            var x = (i * 137.5) % G.W + Math.sin(t * 1.5 + i) * 18, y = (i * 53 + t * (50 + (i % 5) * 18)) % 580 - 20;
            ctx.fillStyle = cols[i % cols.length];
            if (i % 7 === 0) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
            else ctx.fillRect(x, y, 7, 3 + 3 * Math.abs(Math.sin(t * 4 + i)));
        }
    }

    G.register('deco', {
        title: 'LAST CALL',
        blurb: 'Slide the cocktails down the bars, catch the empties, never keep a guest waiting.',
        controls: [
            '↑ ↓ jump between the four taps · ← → walk along a bar (catch empties, grab tips)',
            'SPACE / POUR: slide a cocktail down the bar',
            'X / FIZZ: top up the champagne tower on the beat (Gala), slide seltzer (Raid)',
            'Raid: → at the tap hides the gin behind the swing door; agents only take seltzer'
        ],
        levelNames: ['The Speakeasy', 'Rooftop Gala', 'The Raid'],
        colors: { bg: '#0b0a08', fg: '#f4ecd8', accent: '#d4af37', dim: '#a39a82' },
        lives: 4,
        music: {
            bpm: 132, root: 48, scale: 'major', prog: [0, 5, 1, 4],
            bass: 'x...5...o...5...',
            lead: ['4..54..20---...4', '7..57..42---...5', '3..13..5-6-5..3.', '4..61..3--2-1...',
                '4..54..2077-...9', '9..77..5-4-2...0', '1..31..56-5-3..4', '2---4---0---....'],
            arp: '.0.1.2.1', drums: { k: 'x.......x.......', s: '....x..x....x..x', h: 'x..xx..xx..xx..x' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOct: 1
        },
        touch: { a: 'POUR', b: 'FIZZ' },
        ending: {
            title: 'LAST CALL',
            text: 'The gala roars till dawn.',
            colors: ['#d4af37', '#f1d78a', '#1f7a5a', '#3fb488', '#f4ecd8'],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
