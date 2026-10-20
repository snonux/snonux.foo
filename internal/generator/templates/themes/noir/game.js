/*
 * Midnight Alley — the noir theme's game: a crosshair gallery shooter.
 *
 * A rainy alley front with windows, doors, a stack of crates and a parked
 * car. Gangsters (black silhouettes, red tie, a red ring that fills while
 * they draw) pop out and must be shot before the ring closes. Civilians and
 * the informant are drawn pale: shooting one costs a life, exactly like being
 * shot. The revolver holds six rounds and has to be reloaded by hand; pulling
 * the trigger on an empty cylinder reloads too, only slower.
 *
 * On a phone a tap on the alley aims and fires in one go, the pad's stick
 * moves the crosshair for those who prefer it (A fires) and B reloads.
 *
 * Three levels: First Watch (windows and doors, gangsters and civilians),
 * Drive-By (runners crossing the street, the informant, cover pop-ups,
 * hostage shields and drive-by cars) and The Kingpin (a stormy night with
 * power cuts and two-hit heavies while the Kingpin leans out of his
 * barricade). Clearing him closes the case: the ending is the rainy alley
 * with the file stamped CLOSED in red.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var W = G.W, H = G.H, TAU = Math.PI * 2;
    // The theme's palette: black, off-white, silver, and one red accent.
    var FOG = '#0b0b0b', STREET = '#161616', INK = '#d8d1c4', SILVER = '#a4a09a', LAMP = '#f0ead6', BLOOD = '#a9372b';
    var HOT = '#d8432f';            // the same red, lit: the last moments of a draw
    var WINDOW_LIT = '#6b675d';     // mid grey, so black and pale figures both read against it
    var GROUND = 400;               // where the facade meets the pavement
    var STREET_Y = 510;             // the line runners' and wheels' feet touch
    var CHAMBERS = 6, RELOAD_TIME = 0.95, SHOT_COOLDOWN = 0.16;
    var DRY_RELOAD = 1.4;           // a reload forced by an empty click takes this much longer
    var AIM_ACCEL = 5200, AIM_SPEED = 820, AIM_DRAG = 26;
    var SNAP = 50;                  // keyboard aim: releasing the keys this close to a head locks on
    var LIFE_STREAK = 12;           // this many busts in a row without a miss earn a life...
    var LIFE_CAP = 5;               // ...up to one more than the level starts with
    var TAP_SLOP = 22;              // a fingertip is blunt: a tap this close to a gangster still hits him
    var HEAD = 22;                  // radius of a head shot: the face and the hat above it
    var GRACE = 2;                  // seconds every draw timer pauses after the player is hit
    var DARK_PERIOD = 11, DARK_FROM = 6.5;

    // Places a figure can appear. x is the centre; `from` is the edge the
    // figure emerges from; type w = window, d = door, c = street cover.
    var SLOTS = [
        { x: 110, y: 58, w: 84, h: 96, type: 'w', from: 'bottom' }, { x: 300, y: 58, w: 84, h: 96, type: 'w', from: 'bottom' },
        { x: 490, y: 58, w: 84, h: 96, type: 'w', from: 'bottom' }, { x: 680, y: 58, w: 84, h: 96, type: 'w', from: 'bottom' },
        { x: 870, y: 58, w: 84, h: 96, type: 'w', from: 'bottom' }, { x: 110, y: 236, w: 84, h: 96, type: 'w', from: 'bottom' },
        { x: 490, y: 236, w: 84, h: 96, type: 'w', from: 'bottom' }, { x: 870, y: 236, w: 84, h: 96, type: 'w', from: 'bottom' },
        { x: 300, y: 244, w: 78, h: 156, type: 'd', from: 'left' }, { x: 680, y: 244, w: 78, h: 156, type: 'd', from: 'right' },
        { x: 198, y: 356, w: 84, h: 80, type: 'c', from: 'bottom' }, { x: 818, y: 338, w: 84, h: 80, type: 'c', from: 'bottom' }
    ];
    // The three places the Kingpin leans out of his barricade (level 3).
    var BOSS_SLOTS = [
        { x: 480, y: 338, w: 110, h: 66, type: 'b', from: 'bottom' },
        { x: 335, y: 392, w: 90, h: 112, type: 'b', from: 'right' },
        { x: 625, y: 392, w: 90, h: 112, type: 'b', from: 'left' }
    ];
    var BARRICADE = { x: 380, y: 404, w: 200, h: 102 };

    // draw: multiplier on the level's draw time; wide: half shoulder width.
    var KINDS = {
        thug: { hostile: true, score: 100 },
        heavy: { hostile: true, score: 200, hp: 2, draw: 1.45, wide: 37 },
        hostage: { hostile: true, score: 250, draw: 1.3 },
        runner: { hostile: true, score: 150, draw: 1.15, mover: true },
        car: { hostile: true, score: 300, draw: 1.6, mover: true },
        boss: { hostile: true, score: 500, draw: 0.9, sc: 1.25 },
        civ: { hostile: false },
        informant: { hostile: false, tip: 200 },
        paperboy: { hostile: false, mover: true, sc: 0.85 }
    };

    // quota: gangsters to bust; max: targets at once; draw: seconds before a
    // gangster fires; gap: seconds between spawns; mix: spawn weights.
    //
    // Aiming and firing takes a player close to a second per target, so a
    // gap near one second is already a queue that barely drains: measured
    // with a bot of 0.3 s reaction, a gap of 0.7-0.9 s cost a quick player
    // nothing and a slightly slower one every life in twenty seconds. So the
    // gaps stay well above a casual player's second per target (1.35 s and
    // more) and the draws near three seconds. The levels get harder through
    // shorter draws, more targets at once and nastier kinds, not a faster
    // queue; the Kingpin's level gets the longest gap because heavies and
    // the Kingpin himself take extra shots. Quotas are sized for about a
    // minute of play each.
    var LEVELS = [
        { quota: 34, max: 2, draw: 3.4, gap: 1.5, slots: 'wd', mix: { thug: 8, civ: 3 } },
        { quota: 40, max: 3, draw: 3.0, gap: 1.4, slots: 'wdc', mix: { thug: 5, civ: 2, runner: 3, informant: 2, hostage: 3, car: 2, paperboy: 1 } },
        { quota: 0, max: 3, draw: 2.9, gap: 1.6, slots: 'wdc', dark: true, boss: 22, mix: { thug: 5, civ: 2, runner: 2, hostage: 2, heavy: 3 } }
    ];

    // ------------------------------------------------------------------
    // Sounds
    // ------------------------------------------------------------------

    function sndShot() {
        G.noise(0.22, { freq: 2600, slide: 180, vol: 0.42 });
        G.tone(170, 0.16, { type: 'sine', slide: 45, vol: 0.35 });
    }

    function sndEmpty() {
        G.tone(1500, 0.025, { vol: 0.09 });
        G.tone(700, 0.03, { vol: 0.07, delay: 0.04 });
    }

    // Six rounds ticking in, then the cylinder snapping shut as the reload ends.
    function sndReload(time) {
        for (var i = 0; i < CHAMBERS; i++) {
            G.tone(1050 + i * 45, 0.03, { type: 'triangle', vol: 0.1, delay: i * time / 7 });
        }
        G.noise(0.06, { filter: 'highpass', freq: 3000, vol: 0.16, delay: time * 0.93 });
    }

    function sndEnemyShot(burst) {
        for (var i = 0; i < (burst ? 5 : 1); i++) G.noise(burst ? 0.08 : 0.4, { freq: 1500, slide: 90, vol: 0.45, delay: i * 0.07 });
        G.tone(110, 0.3, { type: 'sawtooth', slide: 40, vol: 0.28 });
    }

    function sndRicochet() { G.tone(G.rnd(2200, 3000), 0.18, { type: 'sine', slide: 700, vol: 0.1 }); }
    function sndMetal() { G.tone(1300, 0.09, { type: 'triangle', slide: 900, vol: 0.16 }); }
    function sndThud() { G.noise(0.14, { freq: 500, slide: 90, vol: 0.3 }); G.tone(140, 0.16, { type: 'triangle', slide: 60, vol: 0.2 }); }
    function sndScream() { G.tone(900, 0.35, { type: 'sawtooth', slide: 1500, vol: 0.14 }); }
    function sndThunder() { G.noise(1.6, { freq: 260, slide: 50, vol: 0.4, delay: 0.25 }); }
    function sndPowerCut(off) { G.tone(off ? 320 : 90, 0.4, { type: 'sawtooth', slide: off ? 50 : 300, vol: 0.12 }); }
    function sndScreech() { G.noise(0.45, { filter: 'bandpass', freq: 2400, slide: 1200, q: 6, vol: 0.2 }); }

    // Innocents and gangsters announce themselves differently, so the ear
    // helps the eye: a soft high note against a low thump.
    function sndAppear(hostile) {
        if (hostile) G.tone(165, 0.1, { type: 'triangle', vol: 0.2 });
        else G.tone(784, 0.09, { type: 'sine', vol: 0.09 });
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    function makeRain(level, mobile) {
        var drops = [];
        // At phone scale dense rain hides the gun and newspaper silhouettes.
        // The rain thickens towards the Kingpin's storm.
        var count = mobile ? 44 + level * 8 : 60 + level * 36;
        for (var i = 0; i < count; i++) {
            drops.push({ x: G.rnd(0, W), y: G.rnd(G.HUD, H), v: G.rnd(620, 900), land: G.rnd(GROUND + 4, H) });
        }
        return drops;
    }

    function makeSplashes() {
        var list = [];
        for (var i = 0; i < 30; i++) list.push({ x: 0, y: 0, t: 1 });
        return list;
    }

    function init(level) {
        var cfg = LEVELS[level - 1], mobile = G.isTouch();
        return {
            cfg: cfg, mobile: mobile, rnd: G.rng(level * 7919 + 13), targets: [], busts: 0, streak: 0,
            spawnT: 0.8, grace: 0,
            boss: cfg.boss ? { hp: cfg.boss, max: cfg.boss, wait: 2.2, last: -1 } : null,
            cx: W / 2, cy: 250, vx: 0, vy: 0, steering: false, lock: null, lastMx: G.mouse.x, lastMy: G.mouse.y, hovered: false,
            ammo: CHAMBERS, reload: 0, cool: 0, kick: 0, muzzle: 0, spin: 0, reloadFull: RELOAD_TIME,
            holes: [], rain: makeRain(level, mobile), splashes: makeSplashes(), splashI: 0, wind: -30 - level * 30,
            boltIn: G.rnd(4, 9), bolt: 0, dim: 0, wasDark: false, stepT: 0
        };
    }

    // Popups float upwards; started too high they would drift into the HUD
    // bar, so the ones from the top row of windows begin a little lower.
    function say(x, y, text, color) { G.popup(G.clamp(x, 70, W - 70), Math.max(y, G.HUD + 62), text, color); }

    function isActive(tg) { return tg.phase !== 'dead' && tg.phase !== 'out'; }

    function countWhere(s, test) {
        var n = 0;
        s.targets.forEach(function (tg) { if (test(tg)) n++; });
        return n;
    }

    function isDark(s) { return !!s.cfg.dark && (G.t % DARK_PERIOD) > DARK_FROM; }

    // ------------------------------------------------------------------
    // Spawning
    // ------------------------------------------------------------------

    function newTarget(s, kind, slot) {
        var def = KINDS[kind];
        return {
            kind: kind, def: def, slot: slot, clip: slot, sc: def.sc || 1, phase: 'in', pop: 0, t: 0, age: 0,
            hp: def.hp || 1, draw: s.cfg.draw * (def.draw || 1) * (0.9 + s.rnd() * 0.3), hold: 1.7 + s.rnd() * 1.3,
            x: slot ? slot.x : 0, y: 0, bottom: slot ? slot.y + slot.h : STREET_Y, hx: 0, hy: 0,
            vx: 0, vy: 0, drop: 0, dir: 1, gone: false, warned: false, down: false
        };
    }

    // Runners and cars cross the whole street. Their speed is derived from
    // the draw time so that they fire while still on screen, near the far
    // side; one that is delayed past the edge leaves without firing (see
    // phaseAim).
    function addMover(s, kind) {
        var tg = newTarget(s, kind, null), car = kind === 'car', margin = car ? 130 : 30;
        tg.dir = s.rnd() < 0.5 ? 1 : -1;
        tg.x = tg.dir > 0 ? -margin : W + margin;
        tg.vx = tg.dir * (W * (car ? 0.7 : 0.85) + margin) / tg.draw;
        tg.y = car ? 432 : STREET_Y - 92 * tg.sc;
        tg.bottom = car ? 506 : STREET_Y;
        tg.phase = tg.def.hostile ? 'aim' : 'stay';
        tg.hold = 99;   // an innocent mover simply runs off screen
        place(tg, 0);
        s.targets.push(tg);
        if (car) G.noise(0.5, { freq: 220, slide: 420, vol: 0.2 });
    }

    function freeSlot(s) {
        var open = SLOTS.filter(function (sl) {
            return s.cfg.slots.indexOf(sl.type) >= 0 && !s.targets.some(function (tg) { return tg.slot === sl; });
        });
        return open.length ? open[Math.floor(s.rnd() * open.length)] : null;
    }

    function pickKind(s) {
        var mix = s.cfg.mix, total = 0, k;
        for (k in mix) total += mix[k];
        var r = s.rnd() * total;
        for (k in mix) { r -= mix[k]; if (r < 0) break; }
        var movers = countWhere(s, function (tg) { return tg.def.mover; });
        var hostiles = countWhere(s, function (tg) { return tg.def.hostile && isActive(tg); });
        // The street holds two movers at most, and an empty alley gets a
        // gangster more often than not so the player is never left waiting.
        if (KINDS[k].mover && movers >= (k === 'car' ? 1 : 2)) return 'thug';
        if (!KINDS[k].hostile && !hostiles && s.rnd() < 0.5) return 'thug';
        return k;
    }

    function spawn(s) {
        var kind = pickKind(s);
        if (KINDS[kind].mover) { addMover(s, kind); return; }
        var slot = freeSlot(s);
        if (!slot) return;
        var tg = newTarget(s, kind, slot);
        place(tg, 0);
        s.targets.push(tg);
        sndAppear(tg.def.hostile);
    }

    function spawnTargets(s, dt) {
        var active = countWhere(s, function (tg) { return isActive(tg) && tg.kind !== 'boss'; });
        s.spawnT -= dt * (active ? 1 : 2.5);
        if (s.spawnT > 0 || active >= s.cfg.max) return;
        s.spawnT = s.cfg.gap * (0.7 + s.rnd() * 0.6);
        spawn(s);
    }

    // The Kingpin leans out of a different side each time, a little faster
    // once he is badly hurt.
    function updateBoss(s, dt) {
        var b = s.boss;
        if (!b || s.targets.some(function (tg) { return tg.kind === 'boss'; })) return;
        b.wait -= dt;
        if (b.wait > 0) return;
        var side = (b.last + 1 + Math.floor(s.rnd() * 2)) % 3;
        var tg = newTarget(s, 'boss', BOSS_SLOTS[side]);
        if (b.hp <= 4) tg.draw *= 0.8;
        b.last = side;
        b.wait = 0.8 + s.rnd() * 0.9;
        place(tg, 0);
        s.targets.push(tg);
        G.tone(98, 0.25, { type: 'sawtooth', slide: 70, vol: 0.2 });
    }

    // ------------------------------------------------------------------
    // Targets: phases and movement
    // ------------------------------------------------------------------

    function gunPoint(tg) {
        if (tg.kind === 'car') return { x: tg.hx + tg.dir * 16, y: tg.hy + 8 };
        return { x: tg.x + 22 * tg.sc, y: tg.y + 56 * tg.sc };
    }

    function enemyFires(s, tg) {
        var p = gunPoint(tg), burst = tg.kind === 'car' || tg.kind === 'heavy' || tg.kind === 'boss';
        tg.phase = 'fired'; tg.t = 0;
        s.grace = GRACE; s.streak = 0;
        sndEnemyShot(burst);
        G.burst(p.x, p.y, { n: burst ? 22 : 12, color: LAMP, speed: 260, life: 0.25 });
        G.flash(BLOOD, 0.22);
        say(tg.hx, tg.hy - 34, 'TOO SLOW', HOT);
        G.loseLife();
    }

    function phaseIn(s, tg, dt) {
        tg.pop = Math.min(1, tg.pop + dt / 0.22);
        if (tg.pop >= 1) { tg.phase = tg.def.hostile ? 'aim' : 'stay'; tg.t = 0; }
    }

    // The timer stands still during the grace period after a hit, so several
    // gangsters cannot empty all the lives in one instant, and a player who
    // has fallen behind gets a moment to catch up with the queue.
    function phaseAim(s, tg, dt) {
        // A mover keeps moving while the timers are frozen. Once his head has
        // passed the far edge the crosshair cannot reach him, so he must not
        // be allowed to fire from out there: he simply gets away.
        if (tg.def.mover && (tg.hx - W / 2) * tg.dir > W / 2) { tg.phase = 'out'; return; }
        if (s.grace <= 0) tg.t += dt;
        if (!tg.warned && tg.t > tg.draw * 0.7) { tg.warned = true; G.tone(1250, 0.05, { vol: 0.09 }); }
        if (tg.t >= tg.draw) enemyFires(s, tg);
    }

    function phaseStay(s, tg, dt) {
        tg.t += dt;
        if (tg.t < tg.hold) return;
        tg.phase = 'out';
        if (!tg.def.tip) return;
        // The informant got away alive: he pays for it.
        G.addScore(tg.def.tip);
        say(tg.hx, tg.hy - 30, 'TIP +' + tg.def.tip, LAMP);
        G.sfx('coin');
    }

    function phaseFired(s, tg, dt) {
        tg.t += dt;
        if (tg.t > 0.45) tg.phase = 'out';
    }

    function phaseOut(s, tg, dt) {
        if (tg.def.mover) return;   // movers leave by driving or running off screen
        tg.pop -= dt / 0.2;
        if (tg.pop <= 0) tg.gone = true;
    }

    // A shot figure drops out of its frame under gravity; one on the street
    // topples over (see drawFigure) and fades.
    function phaseDead(s, tg, dt) {
        tg.t += dt;
        if (tg.def.mover) { tg.vx -= tg.vx * 5 * dt; tg.gone = tg.t > 0.8; return; }
        tg.vy += 2600 * dt;
        tg.drop += tg.vy * dt;
        if (tg.drop > tg.slot.h + 30) tg.gone = true;
    }

    var PHASES = { 'in': phaseIn, aim: phaseAim, stay: phaseStay, fired: phaseFired, out: phaseOut, dead: phaseDead };

    function moveMover(tg, dt) {
        // A getaway is faster than the approach.
        var hurry = tg.kind === 'car' && (tg.phase === 'out' || tg.phase === 'fired') ? 1.9 : 1;
        tg.x += tg.vx * hurry * dt;
        if (tg.x < -180 || tg.x > W + 180) tg.gone = true;
    }

    // Works out where the figure is this tick, and (hx, hy): the centre of
    // the part that has to be hit — the gangster's head.
    function place(tg, dt) {
        var sl = tg.slot, k = tg.sc;
        if (tg.def.mover) {
            moveMover(tg, dt);
        } else {
            var hide = 1 - tg.pop;
            tg.x = sl.x + (sl.from === 'left' ? -hide * sl.w : (sl.from === 'right' ? hide * sl.w : 0));
            tg.y = sl.y + (sl.type === 'd' ? 16 : 4) + (sl.from === 'bottom' ? hide * sl.h : 0) + tg.drop;
        }
        if (tg.kind === 'car') { tg.hx = tg.x - tg.dir * 30; tg.hy = tg.y + 16; return; }
        tg.hx = tg.x + (tg.kind === 'hostage' ? 24 * k : 0);
        tg.hy = tg.y + 24 * k;
    }

    function footsteps(s, dt) {
        s.stepT -= dt;
        if (s.stepT > 0 || !s.targets.some(function (tg) { return tg.def.mover && tg.kind !== 'car' && isActive(tg); })) return;
        s.stepT = 0.17;
        G.noise(0.03, { filter: 'bandpass', freq: 900, vol: 0.08 });
    }

    function updateTargets(s, dt) {
        s.targets.forEach(function (tg) {
            tg.age += dt;
            PHASES[tg.phase](s, tg, dt);
            place(tg, dt);
        });
        s.targets = s.targets.filter(function (tg) { return !tg.gone; });
        footsteps(s, dt);
    }

    // ------------------------------------------------------------------
    // Shooting
    // ------------------------------------------------------------------

    function inSlot(sl, x, y) { return Math.abs(x - sl.x) < sl.w / 2 && y > sl.y && y < sl.y + sl.h; }

    // The whole lit cabin (both windows and the pillar between them) and the
    // gunner's hat above the roof count as the gunner, and only while he is
    // still taking aim: a moving head alone is too small a mark for arrow
    // keys, and at phone size for a fingertip. The bodywork stops bullets at
    // any time.
    function carHit(tg, x, y) {
        var cabin = Math.abs(x - tg.x + tg.dir * 8) < 46 && y > tg.y && y < tg.y + 32;
        if (tg.phase === 'aim' && (cabin || G.dist(x, y, tg.hx, tg.hy) < HEAD)) return 'head';
        var dx = Math.abs(x - tg.x), dy = y - tg.y;
        return (dy > 0 && dy < 74 && dx < (dy < 30 ? 62 : 110)) ? 'metal' : '';
    }

    // The gangster's head shows over the hostage's shoulder; the hostage
    // covers almost everything else.
    function hostageHit(tg, x, y) {
        if (G.dist(x, y, tg.hx, tg.hy) < 19) return 'head';
        if (G.dist(x, y, tg.x - 8, tg.y + 42) < 13) return 'hostage';
        if (x > tg.x - 34 && x < tg.x + 18 && y > tg.y + 52 && y < tg.bottom) return 'hostage';
        return (x >= tg.x + 20 && x < tg.x + 48 && y > tg.y + 38 && y < tg.bottom) ? 'body' : '';
    }

    function hitPart(tg, x, y) {
        var open = tg.phase === 'aim' || tg.phase === 'stay' || (tg.phase === 'in' && tg.pop > 0.5);
        if (tg.kind === 'car') return carHit(tg, x, y);
        if (!open || (tg.clip && !inSlot(tg.clip, x, y))) return '';
        if (tg.kind === 'hostage') return hostageHit(tg, x, y);
        var k = tg.sc;
        if (G.dist(x, y, tg.hx, tg.hy) < HEAD * k) return 'head';
        var wide = (tg.def.wide || 30) * k;
        return (Math.abs(x - tg.x) < wide && y > tg.y + 36 * k && y < tg.bottom) ? 'body' : '';
    }

    // Movers are drawn in front of everything else, so they are tested first.
    function findHit(s, x, y) {
        for (var pass = 0; pass < 2; pass++) {
            for (var i = s.targets.length - 1; i >= 0; i--) {
                var tg = s.targets[i];
                if (!!tg.def.mover !== (pass === 0)) continue;
                var part = hitPart(tg, x, y);
                if (part) return { tg: tg, part: part };
            }
        }
        return null;
    }

    // What a finger tap hits when the spot itself is empty wall or bodywork:
    // the nearest gangster within TAP_SLOP, looked for on two rings around
    // the tap. Only a gangster's own head or body is found this way — an
    // innocent or a hostage is never hit by a near miss, and a tap that
    // lands on one directly is still a shot innocent.
    function nearHit(s) {
        for (var ring = 1; ring <= 2; ring++) {
            for (var i = 0; i < 8; i++) {
                var a = i * TAU / 8, r = ring * TAP_SLOP / 2;
                var hit = findHit(s, s.cx + Math.cos(a) * r, s.cy + Math.sin(a) * r);
                if (hit && hit.tg.def.hostile && (hit.part === 'head' || hit.part === 'body')) return hit;
            }
        }
        return null;
    }

    function shootInnocent(s, tg) {
        tg.phase = 'dead'; tg.t = 0; tg.vy = -160;
        s.streak = 0;
        sndScream();
        G.burst(s.cx, s.cy, { n: 14, color: BLOOD, speed: 150, gravity: 600 });
        say(s.cx, s.cy - 30, 'INNOCENT!', HOT);
        G.flash(BLOOD, 0.2);
        G.loseLife();
    }

    function bossHit(s, tg) {
        var b = s.boss;
        b.hp--;
        tg.phase = 'out';   // he ducks back behind the barricade
        G.sfx('boom');
        G.shake(5, 0.2);
        if (b.hp > 0) return;
        G.sfx('bigboom');
        G.burst(tg.hx, tg.hy, { n: 60, color: BLOOD, speed: 320, gravity: 500, life: 1 });
        G.win(1000 + G.lives * 300);
    }

    // The levels are long, so steady shooting earns lives back.
    function rewardStreak(s) {
        if (s.streak % LIFE_STREAK !== 0) return;
        var before = G.lives;
        if (G.addLife(LIFE_CAP) <= before) return;
        say(s.cx, s.cy + 4, 'EXTRA LIFE', LAMP);
        G.sfx('power');
    }

    function kill(s, tg, part) {
        var head = part === 'head' && tg.kind !== 'car' && tg.kind !== 'hostage';
        // Quick shots, head shots and an unbroken streak all pay more.
        var quick = 1 - G.clamp(tg.t / tg.draw, 0, 1);
        var pts = Math.round(tg.def.score * (head ? 1.5 : 1) * (1 + Math.min(s.streak, 10) * 0.1) + quick * 50);
        s.streak++;
        G.addScore(pts);
        say(s.cx, s.cy - 30, (head ? 'HEAD SHOT ' : '') + pts, head ? LAMP : INK);
        if (head) G.sfx('coin');
        if (tg.kind === 'boss') { bossHit(s, tg); return; }
        s.busts++;
        rewardStreak(s);
        if (tg.kind === 'car') { tg.down = true; tg.phase = 'out'; sndScreech(); return; }
        tg.phase = 'dead'; tg.t = 0; tg.vy = -180;
    }

    function wound(s, tg, part) {
        sndThud();
        G.burst(s.cx, s.cy, { n: 10, color: BLOOD, speed: 170, gravity: 700, life: 0.5 });
        tg.hp--;
        if (tg.hp <= 0) { kill(s, tg, part); return; }
        // A heavy shrugs off the first bullet but loses his hat and his aim.
        // The hat is tossed gently so that it never flies up into the HUD.
        tg.t = Math.max(0, tg.t - 0.5);
        G.burst(tg.hx, tg.hy - 18, { n: 1, color: SILVER, size: 16, speed: 150, gravity: 900, angle: -Math.PI / 2, spread: 1, life: 0.9 });
        say(s.cx, s.cy - 30, 'ONE MORE', SILVER);
    }

    function miss(s) {
        s.streak = 0;
        sndRicochet();
        G.burst(s.cx, s.cy, { n: 6, color: SILVER, speed: 150, life: 0.3, gravity: 500 });
        if (s.cy >= GROUND) return;   // only the wall keeps a bullet hole
        s.holes.push({ x: s.cx, y: s.cy });
        if (s.holes.length > 28) s.holes.shift();
    }

    function fire(s, tap) {
        s.ammo--; s.cool = SHOT_COOLDOWN; s.kick = 14; s.muzzle = 0.08; s.spin += TAU / CHAMBERS;
        sndShot();
        // The spent casing hops out to the side and falls.
        G.burst(s.cx + 20, s.cy + 14, { n: 1, color: SILVER, size: 4, speed: 240, gravity: 1400, angle: -0.9, spread: 0.5, life: 0.7 });
        var hit = findHit(s, s.cx, s.cy);
        if (tap && (!hit || hit.part === 'metal')) hit = nearHit(s) || hit;
        if (!hit) { miss(s); return; }
        if (hit.part === 'metal') { s.streak = 0; sndMetal(); G.burst(s.cx, s.cy, { n: 8, color: LAMP, speed: 220, life: 0.25 }); return; }
        if (hit.part === 'hostage' || !hit.tg.def.hostile) { shootInnocent(s, hit.tg); return; }
        wound(s, hit.tg, hit.part);
    }

    // A reload asked for in time (X, right click, the pad's B) is quick. One
    // forced by a click on an empty cylinder fumbles: it is the only reload a
    // player who taps the screen needs, and the delay is its price.
    function startReload(s, fumbled) {
        if (s.reload > 0 || s.ammo === CHAMBERS) return;
        s.reload = s.reloadFull = RELOAD_TIME * (fumbled ? DRY_RELOAD : 1);
        sndReload(s.reloadFull);
    }

    // The trigger never fails silently: an empty cylinder or a reload under
    // way answers with a dry click, so a tap that fired nothing is not taken
    // for a miss.
    function pullTrigger(s, tap) {
        if (s.cool > 0) return;
        if (s.reload <= 0 && s.ammo > 0) { fire(s, tap); return; }
        sndEmpty();
        s.cool = SHOT_COOLDOWN;
        if (s.reload > 0) return;
        say(s.cx, s.cy - 30, 'EMPTY - RELOADING', HOT);
        startReload(s, true);
    }

    function updateGun(s, dt) {
        s.cool -= dt; s.muzzle -= dt; 
        s.kick -= s.kick * Math.min(1, 14 * dt);   // recoil settles like a damped spring
        if (s.reload > 0) {
            s.reload -= dt;
            if (s.reload <= 0) s.ammo = CHAMBERS;
        }
        if (G.hit.b || G.mouse.rhit) startReload(s, false);
        // A press from a pointer that has never moved with its button up is
        // a finger on a touch screen (a mouse hovers, a finger cannot), and a
        // finger gets TAP_SLOP.
        if (G.hit.a || G.mouse.hit) pullTrigger(s, G.mouse.hit && (G.isTouch() || !s.hovered));
    }

    // ------------------------------------------------------------------
    // Crosshair, weather and the level clock
    // ------------------------------------------------------------------

    function steer(v, axis, dt) {
        if (!axis) return v - v * Math.min(1, AIM_DRAG * dt);
        if (v * axis < 0) v = 0;   // reversing is instant, so small corrections are crisp
        return G.clamp(v + axis * AIM_ACCEL * dt, -AIM_SPEED, AIM_SPEED);
    }

    function nearestHead(s) {
        var best = null, near = SNAP;
        s.targets.forEach(function (tg) {
            if (!tg.def.hostile || !(tg.phase === 'aim' || (tg.phase === 'in' && tg.pop > 0.5))) return;
            var d = G.dist(s.cx, s.cy, tg.hx, tg.hy);
            if (d < near) { near = d; best = tg; }
        });
        return best;
    }

    // Keyboard aim assist: letting go of the keys close to a gangster's head
    // locks the crosshair onto it, and it stays there (following a runner or
    // a car) until a key or the mouse moves it again. Without this, a moving
    // head is a fair mark for a mouse but not for four arrow keys.
    function keyboardLock(s, steering) {
        if (steering) s.lock = null;
        else if (s.steering) s.lock = nearestHead(s);
        s.steering = steering;
        var tg = s.lock;
        if (!tg) return;
        if (tg.gone || (tg.phase !== 'aim' && tg.phase !== 'in')) { s.lock = null; return; }
        s.cx = tg.hx; s.cy = tg.hy; s.vx = s.vy = 0;
    }

    // The keys accelerate the crosshair; the mouse takes over only when it
    // really moves, so a resting pointer never drags the aim away. A click
    // always takes over: a finger tapping the same spot twice has not moved,
    // yet the shot must land under it and not where the stick left the aim.
    function moveCrosshair(s, dt) {
        var ax = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0), ay = (G.key.down ? 1 : 0) - (G.key.up ? 1 : 0);
        s.vx = steer(s.vx, ax, dt);
        s.vy = steer(s.vy, ay, dt);
        s.cx += s.vx * dt; s.cy += s.vy * dt;
        keyboardLock(s, !!(ax || ay));
        var moved = G.mouse.x !== s.lastMx || G.mouse.y !== s.lastMy;
        if (moved && !G.mouse.down) s.hovered = true;
        if (G.mouse.hit || moved) {
            s.cx = s.lastMx = G.mouse.x; s.cy = s.lastMy = G.mouse.y;
            s.vx = s.vy = 0; s.lock = null;
        }
        // The whole reticle, not just its centre, stays below the HUD bar.
        s.cx = G.clamp(s.cx, 6, W - 6);
        s.cy = G.clamp(s.cy, G.HUD + 26, H - 6);
    }

    function updateRain(s, dt) {
        s.rain.forEach(function (d) {
            d.y += d.v * dt;
            d.x = (d.x + s.wind * dt + W) % W;
            if (d.y < d.land) return;
            var sp = s.splashes[s.splashI];
            sp.x = d.x; sp.y = d.land; sp.t = 0;
            s.splashI = (s.splashI + 1) % s.splashes.length;
            d.y = G.HUD; d.x = G.rnd(0, W);
        });
        s.splashes.forEach(function (sp) { sp.t += dt; });
    }

    function updateSky(s, dt) {
        s.bolt -= dt;
        s.boltIn -= dt;
        if (s.boltIn <= 0) { s.boltIn = G.rnd(7, 15); s.bolt = 0.4; sndThunder(); }
        var dark = isDark(s);
        if (dark !== s.wasDark) {
            s.wasDark = dark;
            sndPowerCut(dark);
            G.popup(W / 2, 220, dark ? 'LIGHTS OUT' : 'POWER BACK', LAMP);
        }
        s.dim += ((dark ? 1 : 0) - s.dim) * Math.min(1, 7 * dt);
    }

    function update(s, dt) {
        if (s.grace > 0) s.grace -= dt;
        updateRain(s, dt);
        updateSky(s, dt);
        moveCrosshair(s, dt);
        updateGun(s, dt);
        spawnTargets(s, dt);
        updateBoss(s, dt);
        updateTargets(s, dt);
        if (!s.boss && s.busts >= s.cfg.quota) G.win(400 + G.lives * 200 + G.level * 50);
    }

    // ------------------------------------------------------------------
    // Drawing: figures
    // ------------------------------------------------------------------

    // Gangsters are black with a thin pale outline; innocents are pale. That
    // one rule is what the player learns to read.
    function setPaint(ctx, hostile) {
        ctx.fillStyle = hostile ? FOG : LAMP;
        ctx.strokeStyle = hostile ? INK : FOG;
        ctx.lineWidth = 1.5;
    }

    function drawBust(ctx, wide, bottom) {
        ctx.beginPath();
        ctx.moveTo(-wide, bottom); ctx.lineTo(-wide, 52);
        ctx.quadraticCurveTo(-wide, 40, -10, 38); ctx.lineTo(10, 38);
        ctx.quadraticCurveTo(wide, 40, wide, 52); ctx.lineTo(wide, bottom);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 26, 12, 0, TAU); ctx.fill(); ctx.stroke();
    }

    function drawHat(ctx, band) {
        ctx.beginPath(); ctx.rect(-13, 0, 26, 14); ctx.rect(-22, 13, 44, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = band;
        ctx.fillRect(-13, 9, 26, 4);
    }

    function drawTie(ctx) {
        ctx.fillStyle = BLOOD;
        ctx.beginPath(); ctx.moveTo(-4, 40); ctx.lineTo(4, 40); ctx.lineTo(2, 60); ctx.lineTo(0, 64); ctx.lineTo(-2, 60); ctx.closePath(); ctx.fill();
    }

    // The gun comes up as the draw timer runs: a second cue beside the ring.
    function drawGun(ctx, tg, long) {
        var raise = G.clamp(tg.t / tg.draw, 0, 1) * 12, y = 66 - raise;
        ctx.fillStyle = SILVER;
        ctx.fillRect(12, y, long ? 30 : 16, 6);
        ctx.fillRect(12, y + 5, 6, 9);
        if (long) { ctx.beginPath(); ctx.arc(26, y + 10, 6, 0, TAU); ctx.fill(); }
        if (tg.phase !== 'fired') return;
        ctx.fillStyle = LAMP;
        ctx.beginPath(); ctx.arc(long ? 46 : 30, y + 3, 9 + Math.sin(tg.t * 90) * 4, 0, TAU); ctx.fill();
    }

    function drawRaisedHands(ctx, age) {
        var wave = Math.sin(age * 9) * 3;
        ctx.strokeStyle = LAMP; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-26, 52); ctx.lineTo(-31 + wave, 16);
        ctx.moveTo(26, 52); ctx.lineTo(31 - wave, 16);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    function drawHair(ctx) {
        ctx.fillStyle = FOG;
        ctx.beginPath(); ctx.arc(0, 24, 13, Math.PI, TAU); ctx.lineTo(13, 32); ctx.lineTo(9, 22); ctx.lineTo(-9, 22); ctx.lineTo(-13, 32); ctx.closePath(); ctx.fill();
    }

    function drawLegs(ctx, tg) {
        var swing = tg.phase === 'dead' ? 4 : Math.sin(tg.age * 15) * 13;
        ctx.strokeStyle = tg.def.hostile ? '#55524c' : LAMP;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(-6, 68); ctx.lineTo(-6 + swing, 92);
        ctx.moveTo(6, 68); ctx.lineTo(6 - swing, 92);
        ctx.stroke();
    }

    function drawGangster(ctx, tg, bottom) {
        setPaint(ctx, true);
        drawBust(ctx, tg.def.wide || 30, bottom);
        drawTie(ctx);
        setPaint(ctx, true);
        // A heavy who has been hit once has lost his hat.
        if (tg.hp >= (tg.def.hp || 1)) drawHat(ctx, tg.kind === 'boss' ? BLOOD : SILVER);
        drawGun(ctx, tg, tg.kind === 'heavy' || tg.kind === 'boss');
    }

    function drawCivilian(ctx, tg, bottom) {
        drawRaisedHands(ctx, tg.age);
        setPaint(ctx, false);
        drawBust(ctx, 26, bottom);
        drawHair(ctx);
    }

    // The trap: he wears a hat like the gangsters, but he is pale and holds
    // a newspaper instead of a gun.
    function drawInformant(ctx, tg, bottom) {
        setPaint(ctx, false);
        drawBust(ctx, 30, bottom);
        drawHat(ctx, FOG);
        ctx.fillStyle = INK; ctx.strokeStyle = FOG;
        ctx.beginPath(); ctx.rect(-22, 54, 44, 26); ctx.fill(); ctx.stroke();
        ctx.fillStyle = FOG;
        for (var i = 0; i < 4; i++) ctx.fillRect(-17, 59 + i * 5, i ? 34 : 20, 2);
    }

    function drawHostage(ctx, tg, bottom) {
        ctx.save();
        ctx.translate(24, 0);
        setPaint(ctx, true);
        drawBust(ctx, 24, bottom);
        drawHat(ctx, SILVER);
        ctx.restore();
        ctx.save();
        ctx.translate(-8, 16);
        setPaint(ctx, false);
        drawBust(ctx, 24, bottom - 16);
        drawHair(ctx);
        ctx.restore();
        // The gangster's arm across the hostage, pistol at the ready.
        ctx.strokeStyle = FOG; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(34, 62); ctx.lineTo(-22, 68); ctx.stroke();
        ctx.fillStyle = SILVER;
        ctx.fillRect(-34, 62, 14, 6);
    }

    function drawRunner(ctx, tg) {
        drawLegs(ctx, tg);
        if (tg.def.hostile) { drawGangster(ctx, tg, 70); return; }
        setPaint(ctx, false);
        drawBust(ctx, 24, 70);
        // A flat cap and a satchel of papers.
        ctx.fillStyle = FOG;
        ctx.beginPath(); ctx.arc(0, 20, 12, Math.PI, TAU); ctx.rect(-12, 18, 30, 4); ctx.fill();
        ctx.fillStyle = INK; ctx.strokeStyle = FOG;
        ctx.beginPath(); ctx.rect(-28, 50, 20, 18); ctx.fill(); ctx.stroke();
    }

    var FIGURES = {
        thug: drawGangster, heavy: drawGangster, boss: drawGangster, civ: drawCivilian,
        informant: drawInformant, hostage: drawHostage, runner: drawRunner, paperboy: drawRunner
    };

    function drawFigure(ctx, tg) {
        var sl = tg.clip, k = tg.sc;
        ctx.save();
        if (sl) { ctx.beginPath(); ctx.rect(sl.x - sl.w / 2, sl.y, sl.w, sl.h); ctx.clip(); }
        ctx.translate(tg.x, tg.y);
        if (tg.def.mover && tg.phase === 'dead') {
            // Topple about the feet, then fade into the street.
            ctx.translate(0, 92 * k);
            ctx.rotate(tg.dir * Math.min(1, tg.t / 0.3) * 1.5);
            ctx.translate(0, -92 * k);
            ctx.globalAlpha = G.clamp(1.6 - tg.t * 2, 0, 1);
        }
        ctx.scale(k, k);
        FIGURES[tg.kind](ctx, tg, Math.max(60, (tg.bottom - tg.y) / k));
        ctx.restore();
    }

    // The draw timer. It is painted after the darkness, so it is the one
    // thing that always shows, even in a power cut.
    function drawRing(ctx, tg, mobile) {
        if (!tg.def.hostile || tg.phase !== 'aim') return;
        var f = G.clamp(tg.t / tg.draw, 0, 1), r = 25 * tg.sc;
        ctx.lineWidth = mobile ? 4 : 2;
        ctx.strokeStyle = mobile ? SILVER : 'rgba(169,55,43,0.35)';
        ctx.beginPath(); ctx.arc(tg.hx, tg.hy, r, 0, TAU); ctx.stroke();
        ctx.lineWidth = mobile ? 7 : 5;
        ctx.strokeStyle = f > 0.7 && Math.sin(tg.t * 40) > 0 ? HOT : BLOOD;
        ctx.beginPath(); ctx.arc(tg.hx, tg.hy, r, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
        // The glow of his cigarette.
        ctx.fillStyle = HOT;
        ctx.fillRect(tg.hx + 6 * tg.sc, tg.hy + 6 * tg.sc, 3, 3);
    }

    // ------------------------------------------------------------------
    // Drawing: scenery
    // ------------------------------------------------------------------

    function drawWall(ctx, s) {
        ctx.fillStyle = STREET;
        ctx.fillRect(0, 0, W, GROUND);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        var brickH = s.mobile ? 28 : 14, brickW = s.mobile ? 80 : 40;
        for (var row = 0, y = G.HUD; y < GROUND; y += brickH, row++) {
            ctx.moveTo(0, y); ctx.lineTo(W, y);
            for (var x = (row % 2) * brickW / 2; x < W; x += brickW) { ctx.moveTo(x, y); ctx.lineTo(x, y + brickH); }
        }
        ctx.stroke();
        ctx.fillStyle = '#060606';
        s.holes.forEach(function (h) { ctx.beginPath(); ctx.arc(h.x, h.y, 3, 0, TAU); ctx.fill(); });
    }

    // The hotel sign buzzes and drops out now and then; it dies with the power.
    function drawSign(ctx, s) {
        var buzz = Math.sin(G.t * 6.3) * Math.sin(G.t * 1.7) > 0.72;
        ctx.globalAlpha = (buzz ? 0.25 : 1) * (1 - s.dim);
        G.text('HOTEL', 205, 213, { size: 34, bold: true, color: BLOOD, align: 'center', glow: BLOOD });
        ctx.globalAlpha = 1;
    }

    function drawDoorLeaf(ctx, sl) {
        var x = sl.x - sl.w / 2;
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(x, sl.y, sl.w, sl.h);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 10, sl.y + 12, sl.w - 20, 56);
        ctx.strokeRect(x + 10, sl.y + 80, sl.w - 20, 62);
        ctx.fillStyle = SILVER;
        ctx.fillRect(x + sl.w - 12, sl.y + 78, 5, 5);
    }

    // An occupied window or doorway is lit from behind, which is what makes
    // a black silhouette readable; a power cut takes that light away.
    function drawOpening(ctx, s, sl, used) {
        var x = sl.x - sl.w / 2, lit = used && s.dim < 0.5;
        ctx.fillStyle = lit ? WINDOW_LIT : FOG;
        ctx.fillRect(x, sl.y, sl.w, sl.h);
        if (sl.type === 'd' && !used) drawDoorLeaf(ctx, sl);
        if (sl.type === 'w' && !used) {
            ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(sl.x, sl.y); ctx.lineTo(sl.x, sl.y + sl.h); ctx.moveTo(x, sl.y + 44); ctx.lineTo(x + sl.w, sl.y + 44); ctx.stroke();
        }
        ctx.strokeStyle = SILVER; ctx.lineWidth = 3;
        ctx.strokeRect(x, sl.y, sl.w, sl.h);
        ctx.fillStyle = SILVER;
        if (sl.type === 'w') ctx.fillRect(x - 6, sl.y + sl.h, sl.w + 12, 6);
    }

    function drawOpenings(ctx, s) {
        SLOTS.forEach(function (sl) {
            if (sl.type === 'c') return;   // street cover has no frame of its own
            drawOpening(ctx, s, sl, s.targets.some(function (tg) { return tg.slot === sl; }));
        });
    }

    function drawStreet(ctx) {
        ctx.fillStyle = '#101010';
        ctx.fillRect(0, GROUND, W, H - GROUND);
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, GROUND + 28, W, 3);
        // Wet cobbles: short glints that crawl as the water runs.
        ctx.fillStyle = 'rgba(216,209,196,0.10)';
        for (var i = 0; i < 26; i++) {
            var gx = (i * 137 + G.t * (12 + i % 5 * 6)) % W, gy = GROUND + 36 + (i * 53) % 100;
            ctx.fillRect(gx, gy, 18 + i % 4 * 9, 2);
        }
    }

    function drawLamp(ctx, s) {
        var out = Math.sin(G.t * 7) * Math.sin(G.t * 1.3) > 0.9;
        var glow = (out ? 0.02 : 0.09 + 0.02 * Math.sin(G.t * 13)) * (1 - s.dim);
        ctx.fillStyle = 'rgba(240,234,214,' + glow.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(395, 176); ctx.lineTo(260, H); ctx.lineTo(530, H); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2c2c2c';
        ctx.fillRect(392, 176, 6, 258);
        ctx.fillRect(384, 430, 22, 8);
        ctx.fillStyle = s.dim > 0.5 || out ? '#3a3935' : LAMP;
        ctx.fillRect(383, 164, 24, 12);
    }

    function drawCrate(ctx, x, y, w, h) {
        ctx.fillStyle = '#1b1b1b'; ctx.strokeStyle = '#4a4843'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
    }

    // Side view of a thirties sedan; (x, y) is the middle of the roof and
    // dir flips it to face the way it drives.
    function drawCar(ctx, x, y, dir, spin, lit) {
        ctx.save();
        ctx.translate(x, y); ctx.scale(dir, 1);
        ctx.fillStyle = FOG; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-110, 74); ctx.lineTo(-110, 40); ctx.quadraticCurveTo(-104, 30, -62, 30);
        ctx.lineTo(-48, 0); ctx.lineTo(40, 0); ctx.lineTo(62, 30); ctx.lineTo(104, 34); ctx.lineTo(110, 48); ctx.lineTo(110, 74);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = lit ? WINDOW_LIT : '#1c1c1c';
        ctx.fillRect(-50, 6, 40, 22); ctx.fillRect(-4, 6, 38, 22);
        [-68, 68].forEach(function (wx) {
            ctx.fillStyle = FOG; ctx.strokeStyle = SILVER; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(wx, 74, 14, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(wx - Math.cos(spin) * 10, 74 - Math.sin(spin) * 10); ctx.lineTo(wx + Math.cos(spin) * 10, 74 + Math.sin(spin) * 10); ctx.stroke();
        });
        if (lit) {
            ctx.fillStyle = 'rgba(240,234,214,0.13)';
            ctx.beginPath(); ctx.moveTo(110, 44); ctx.lineTo(330, 20); ctx.lineTo(330, 86); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    function drawDriveBy(ctx, tg) {
        drawCar(ctx, tg.x, tg.y, tg.dir, tg.x / 14, true);
        if (tg.down) return;   // the gunner has slumped out of sight
        ctx.save();
        ctx.translate(tg.hx, tg.hy - 26);
        setPaint(ctx, true);
        ctx.beginPath(); ctx.arc(0, 26, 11, 0, TAU); ctx.fill(); ctx.stroke();
        drawHat(ctx, SILVER);
        ctx.fillStyle = SILVER;
        ctx.fillRect(tg.dir > 0 ? 4 : -30, 32, 26, 5);
        if (tg.phase === 'fired') {
            ctx.fillStyle = LAMP;
            ctx.beginPath(); ctx.arc(tg.dir * 32, 34, 8 + Math.sin(tg.t * 90) * 4, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    function drawCover(ctx) {
        drawCrate(ctx, 146, 436, 52, 34); drawCrate(ctx, 198, 436, 52, 34);
        drawCrate(ctx, 136, 470, 62, 40); drawCrate(ctx, 198, 470, 62, 40);
        drawCar(ctx, 815, 418, -1, 0.6, false);
    }

    // The Kingpin's barricade, with his remaining health chalked across it.
    function drawBarricade(ctx, s) {
        var b = BARRICADE, boss = s.boss;
        for (var r = 0; r < 3; r++) {
            for (var c = 0; c < 4; c++) drawCrate(ctx, b.x + c * 50, b.y + r * 34, 50, 34);
        }
        ctx.fillStyle = FOG;
        ctx.fillRect(b.x + 20, b.y + 44, b.w - 40, 14);
        ctx.fillStyle = BLOOD;
        ctx.fillRect(b.x + 22, b.y + 46, (b.w - 44) * boss.hp / boss.max, 10);
    }

    // Figures are painted in three layers: 0 inside the facade's windows and
    // doors, 1 behind street cover (crates, car, barricade) and so after the
    // pavement is filled, 2 out in the open street.
    function layerOf(tg) {
        if (tg.def.mover) return 2;
        return tg.slot.type === 'c' || tg.slot.type === 'b' ? 1 : 0;
    }

    function drawTargets(ctx, s, layer) {
        s.targets.forEach(function (tg) {
            if (layerOf(tg) !== layer) return;
            if (tg.kind === 'car') drawDriveBy(ctx, tg); else drawFigure(ctx, tg);
        });
    }

    // ------------------------------------------------------------------
    // Drawing: weather, gun and the frame
    // ------------------------------------------------------------------

    function drawRain(ctx, s) {
        var lean = s.wind * 0.02;
        ctx.strokeStyle = 'rgba(216,209,196,0.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        s.rain.forEach(function (d) {
            if (d.y - 14 < G.HUD) return;   // never streak into the HUD bar
            ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - lean, d.y - 14);
        });
        s.splashes.forEach(function (sp) {
            if (sp.t > 0.25) return;
            ctx.moveTo(sp.x + 2 + sp.t * 24, sp.y);
            ctx.ellipse(sp.x, sp.y, 2 + sp.t * 24, 1 + sp.t * 6, 0, 0, TAU);
        });
        ctx.stroke();
    }

    // Power cuts darken everything drawn so far; lightning and the player's
    // own muzzle flash give a glimpse of the alley for a moment.
    function drawLight(ctx, s) {
        var reveal = s.bolt > 0 || s.muzzle > 0 ? 0.35 : 1;
        if (s.dim > 0.01) {
            ctx.fillStyle = 'rgba(0,0,0,' + (0.74 * s.dim * reveal).toFixed(3) + ')';
            ctx.fillRect(0, G.HUD, W, H - G.HUD);
        }
        if (s.bolt <= 0) return;
        var flick = 0.5 + 0.5 * Math.sin(s.bolt * 60);
        ctx.fillStyle = 'rgba(240,234,214,' + (0.3 * flick * s.bolt / 0.4).toFixed(3) + ')';
        ctx.fillRect(0, G.HUD, W, H - G.HUD);
    }

    function drawCylinder(ctx, s) {
        if (s.mobile) { drawPhoneAmmo(ctx, s); return; }
        var x = 58, y = 488, loading = s.reload > 0 ? 1 - s.reload / s.reloadFull : 1;
        ctx.fillStyle = 'rgba(11,11,11,0.8)'; ctx.strokeStyle = SILVER; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.fill(); ctx.stroke();
        for (var i = 0; i < CHAMBERS; i++) {
            var a = s.spin + i * TAU / CHAMBERS - Math.PI / 2;
            // While reloading the rounds drop in one after another.
            var full = s.reload > 0 ? i < Math.floor(loading * CHAMBERS) : i < s.ammo;
            ctx.fillStyle = full ? LAMP : FOG;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * 18, y + Math.sin(a) * 18, 6, 0, TAU); ctx.fill(); ctx.stroke();
        }
        // Sized to be read on a phone, where the canvas is drawn at 60%.
        if (s.reload > 0) G.text('RELOADING', x + 42, y + 2, { size: 20, bold: true, color: SILVER });
        else if (s.ammo === 0 && Math.sin(G.t * 10) > 0) G.text('X / LOAD: RELOAD', x + 42, y + 2, { size: 20, bold: true, color: HOT });
        if (s.streak > 2) G.text('STREAK x' + s.streak, x + 42, y + 28, { size: 20, color: SILVER });
    }

    // A simple row remains countable when the whole canvas is only 390 px
    // wide. Reload and streak occupy separate columns, even when both show.
    function drawPhoneAmmo(ctx, s) {
        var loading = s.reload > 0 ? Math.floor((1 - s.reload / s.reloadFull) * CHAMBERS) : s.ammo;
        ctx.fillStyle = 'rgba(11,11,11,0.92)';
        ctx.fillRect(14, STREET_Y, W - 28, H - STREET_Y);
        for (var i = 0; i < CHAMBERS; i++) {
            ctx.fillStyle = i < loading ? LAMP : '#393632';
            ctx.fillRect(28 + i * 23, 515, 15, 20);
        }
        var label = s.reload > 0 ? 'RELOADING' : (s.ammo === 0 ? 'LOAD TO RELOAD' : 'AMMO ' + s.ammo + '/6');
        G.text(label, 186, 533, { size: 30, bold: true, color: s.ammo === 0 ? HOT : LAMP });
        if (s.streak > 2) G.text('STREAK x' + s.streak, W - 28, 533, { size: 28, color: SILVER, align: 'right' });
    }

    function drawCrosshair(ctx, s) {
        var x = s.cx, y = Math.max(G.HUD + 26, s.cy - s.kick);   // recoil must not lift it into the HUD
        if (s.muzzle > 0) {
            ctx.fillStyle = 'rgba(240,234,214,0.5)';
            ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = LAMP; ctx.lineWidth = s.mobile ? 3 : 2;
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, TAU);
        ctx.moveTo(x - 24, y); ctx.lineTo(x - 8, y); ctx.moveTo(x + 8, y); ctx.lineTo(x + 24, y);
        ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 8); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 24);
        ctx.stroke();
        ctx.fillStyle = HOT;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        if (s.reload <= 0) return;
        ctx.strokeStyle = SILVER; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + (1 - s.reload / s.reloadFull) * TAU); ctx.stroke();
    }

    function draw(s, ctx) {
        drawWall(ctx, s);
        drawSign(ctx, s);
        drawOpenings(ctx, s);
        drawTargets(ctx, s, 0);
        drawStreet(ctx);
        drawLamp(ctx, s);
        drawTargets(ctx, s, 1);
        drawCover(ctx);
        if (s.boss) drawBarricade(ctx, s);
        drawTargets(ctx, s, 2);
        drawRain(ctx, s);
        drawLight(ctx, s);
        s.targets.forEach(function (tg) { drawRing(ctx, tg, s.mobile); });
        drawCylinder(ctx, s);
        drawCrosshair(ctx, s);
    }

    // ------------------------------------------------------------------
    // The ending: case closed
    // ------------------------------------------------------------------

    // Rain over the last frame of the alley, a case file on the left that
    // gets stamped CLOSED in red, and the Kingpin's red-banded hat in a
    // puddle on the right whose ripples keep spreading.
    function endingRain(e) {
        if (!e.data.rain) {
            e.data.rain = [];
            for (var i = 0; i < 70; i++) e.data.rain.push({ x: (i * 197) % W, y: (i * 89) % H, v: 560 + (i * 37) % 300 });
        }
        return e.data.rain;
    }

    function drawEndingRain(ctx, e) {
        ctx.strokeStyle = 'rgba(216,209,196,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath();
        endingRain(e).forEach(function (d) {
            var y = G.HUD + 16 + (d.y + e.t * d.v) % (H - G.HUD - 16), x = (d.x - e.t * 90 % W + W) % W;
            ctx.moveTo(x, y); ctx.lineTo(x + 2, y - 16);
        });
        ctx.stroke();
    }

    function drawCaseFile(ctx, e) {
        ctx.save();
        ctx.translate(120, 300); ctx.rotate(-0.12);
        ctx.fillStyle = '#c9b993'; ctx.strokeStyle = FOG; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(-80, -60, 160, 120); ctx.rect(-80, -74, 60, 16); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6e6450';
        for (var i = 0; i < 4; i++) ctx.fillRect(-62, -36 + i * 14, i ? 100 : 60, 4);
        // The stamp comes down hard half a second in, then stays.
        var k = G.clamp((e.t - 0.5) / 0.15, 0, 1);
        if (k > 0) {
            ctx.globalAlpha = k;
            ctx.rotate(-0.25); ctx.scale(2.2 - 1.2 * k, 2.2 - 1.2 * k);
            ctx.strokeStyle = HOT; ctx.lineWidth = 4;
            ctx.strokeRect(-70, 4, 140, 40);
            G.text('CLOSED', 0, 36, { size: 32, bold: true, color: HOT, align: 'center' });
        }
        ctx.restore();
    }

    function drawPuddleHat(ctx, e) {
        var x = 840, y = 330;
        // A red glow pulses over the street, like the hotel sign coming back on.
        var glow = ctx.createRadialGradient(x, y, 10, x, y, 110);
        glow.addColorStop(0, BLOOD); glow.addColorStop(1, 'rgba(169,55,43,0)');
        ctx.globalAlpha = 0.35 + 0.2 * Math.sin(e.t * 3);
        ctx.fillStyle = glow;
        ctx.fillRect(x - 110, y - 110, 220, 220);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(216,209,196,0.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i < 3; i++) {
            var r = ((e.t * 40 + i * 30) % 90) + 10;
            ctx.moveTo(x + r, y + 14); ctx.ellipse(x, y + 14, r, r * 0.25, 0, 0, TAU);
        }
        ctx.stroke();
        ctx.save();
        ctx.translate(x - 4, y - 8); ctx.rotate(0.2); ctx.scale(1.6, 1.6);
        setPaint(ctx, true);
        drawHat(ctx, BLOOD);
        ctx.restore();
    }

    function drawEnding(e, ctx) {
        drawEndingRain(ctx, e);
        drawCaseFile(ctx, e);
        drawPuddleHat(ctx, e);
    }

    function hud(s) {
        if (s.boss) return 'KINGPIN ' + s.boss.hp + '/' + s.boss.max;
        return 'BUSTS ' + s.busts + '/' + s.cfg.quota;
    }

    G.register('noir', {
        title: 'MIDNIGHT ALLEY',
        blurb: 'Shoot the gangsters before the red ring closes. Never shoot the pale ones.',
        controls: [
            'Mouse or ← ↑ → ↓ aim · click, SPACE or FIRE shoot · phone: tap a gangster',
            'X, right click or LOAD: reload six shots (an empty click reloads slowly)',
            'Keys or pad: let go of the arrows near a gangster to lock on',
            'Black with a red tie: shoot · pale: hold your fire · ' + LIFE_STREAK + ' busts in a row: extra life'
        ],
        levelNames: ['First Watch', 'Drive-By', 'The Kingpin'],
        colors: { bg: FOG, fg: INK, accent: BLOOD, dim: SILVER },
        lives: 4,
        cursor: 'none',
        // The whole pad stays: the stick is the arrow keys for those who
        // would rather steer the crosshair than tap the alley.
        touch: { a: 'FIRE', b: 'LOAD' },
        // A slow twelve-bar blues: the bass walks root, fifth, octave, fifth
        // in quarter notes under a muted, sighing lead.
        music: {
            bpm: 84, root: 43, scale: 'blues', prog: [0, 0, 0, 0, 2, 2, 0, 0, 4, 2, 0, 4],
            bass: 'x...5...o...5...x...5...o..5x...',
            lead: [
                '6--.5.4-3...0---', '....0.2.3-4-....', '6--.5.4-3...2-0-', '........0.3.4.5.',
                '8--.7.6-5...4---', '....6.5.4-3-2...', '6--.5.4-3...0---', '..0.2.3.4-..5-..',
                '9--.8-..6--.5-..', '8--.6-..5-4-3-2-', '0---..2.3.4...0-', '..4.5.4.2---....'
            ],
            arp: '......2.......1.',
            drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x...x..xx...x..x' },
            leadWave: 'triangle', bassWave: 'triangle', arpWave: 'sine', leadOct: 2
        },
        ending: {
            title: 'CASE CLOSED',
            text: 'The Kingpin is down. The rain washes the alley clean.',
            colors: [BLOOD, HOT, LAMP, INK],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
