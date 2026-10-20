/*
 * Gravity Well — the cosmos theme's game.
 *
 * Asteroids on a wrapping screen where stars, black holes and pulsars pull on
 * everything: the ship, the rocks and every shot. Bullets curve, rocks
 * slingshot, and a ship or shot that touches a well's core is gone. Rocks are
 * too tough for that: they ricochet off a core in a flare, so gravity never
 * does the player's job. Destroy every rock of every wave to clear the level.
 *
 * On a phone the left thumb turns and thrusts on the stick (its lower half
 * turns without thrusting) while the right thumb holds FIRE and taps HYPER.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    // The playfield is the canvas below the HUD strip; it wraps on both axes.
    var TOP = G.HUD, PW = G.W, PH = G.H - G.HUD, TAU = Math.PI * 2;
    var THRUST = 270, TURN = 4.2, DRAG = 0.12, SHIP_R = 10, SHIP_MAX = 420;
    var SHOT_SPEED = 430, SHOT_LIFE = 1.15, MAX_SHOTS = 5;
    // Free fall onto the giant's core reaches about 410 px/s. The rock cap sits
    // well above that: a cap that clips close passes bleeds orbital energy and
    // slowly sinks every rock onto a core. It is only a safety net.
    var ROCK_MAX = 620, REST_SPEED = 40, SAUCER_BOUNTIES = 5;
    // Moving wells bat and slingshot rocks, which would heat them up without
    // limit. A rock may keep at most FAR_SPEED once it has climbed FAR away
    // from the wells around it; the excess energy is bled off at COOL per second.
    var FAR = 260, FAR_SPEED = 125, COOL = 2;
    // Spawn shields (seconds): a level opens with a long one so a newcomer can
    // read the screen, cut down to SHIELD_GO by the first button pressed; a
    // hyperspace jump gets a blink of one and lands where the next JUMP_CLEAR
    // seconds look safe. WARP is how long a rock of a later wave takes to
    // materialise.
    var SHIELD_START = 8, SHIELD_GO = 2, SHIELD = 2.5, SHIELD_JUMP = 0.6, JUMP_CLEAR = 1.2, WARP = 1.6;
    // Saucers hold their fire this close to the ship: a shot from nearer
    // could not be dodged.
    var FOE_HOLD = 150, FOE_TELL = 0.45;
    // Saucer shots are slow enough to see coming and sidestep from across
    // the screen; a big saucer reloads slower and aims worse than a sniper.
    var FOE_SHOT = 215, FOE_RELOAD = { big: 2.3, small: 1.8 }, FOE_ERR = { big: 0.36, small: 0.22 };
    // Four ships: the later levels pile saucers, beams and moving wells on
    // top of the rocks, and one stray shot should not decide a run.
    var LIVES = 4;
    var ROCK_R = [0, 12, 22, 38], ROCK_PTS = [0, 100, 50, 20];
    var CORE_R = { star: 20, hole: 18, pulsar: 15, giant: 46 };
    var C = { bg: '#020214', gold: '#ffd166', purple: '#9b5de5', blue: '#4cc9f0', fg: '#d4e8ff', red: '#ff5d73', dim: '#6f7fa8' };
    var WELL_COLOR = { star: C.gold, hole: C.purple, pulsar: C.blue, giant: C.purple };
    var PHONE_HINTS = ['Thrust away from stars; shots curve', 'Two holes waltz; red saucers fire back',
        'Orbit the giant; dodge the blue beam'];

    // One entry per level: a lone star to learn the pull, a waltzing pair of
    // black holes with saucers and iron rocks, and the finale around a giant
    // hole with an orbiting pulsar. `rocks` lists the big rocks of each wave
    // (the next wave warps in when the last rock of the current one is gone)
    // and `iron` how many of each wave are iron. A well may orbit (cx, cy) at
    // radius `or` with angular speed `ow` or sweep a beam of length `beam` at
    // `bw` rad/s. `saucer` is the seconds between saucer visits and `sniper`
    // the share of them that are small sharpshooters; `swirl` puts every rock
    // on a circular orbit around the first well. Spawn points are
    // deliberately off every axis of symmetry, so a ship left alone always
    // falls into something, and out of reach of every beam.
    var LEVELS = [
        { rocks: [3, 3], spawns: [[150, 430], [810, 120]], hint: 'Stars pull on everything, even your shots. Thrust to stay out',
            wells: [{ kind: 'star', cx: 480, cy: 285, gm: 0.5e6 }] },
        { rocks: [4, 4], iron: 1, saucer: 14, spawns: [[120, 440], [840, 100]],
            hint: 'Two black holes waltz. Saucers ignore gravity, their shots do not',
            wells: [{ kind: 'hole', cx: 480, cy: 285, gm: 0.75e6, or: 105, ow: 0.5 },
                { kind: 'hole', cx: 480, cy: 285, gm: 0.75e6, or: 105, ow: 0.5, ph: Math.PI }] },
        { rocks: [3, 4, 4], iron: 1, saucer: 14, sniper: 0.3, swirl: true,
            spawns: [[70, 80], [890, 80], [70, 490], [890, 490]], hint: 'Everything circles the giant. So should you',
            wells: [{ kind: 'giant', cx: 480, cy: 285, gm: 4.5e6 },
                { kind: 'pulsar', cx: 480, cy: 285, gm: 0.12e6, or: 250, ow: 0.2, beam: 160, bw: 1.0 }] }
    ];

    // ------------------------------------------------------------------
    // Wrapping space
    // ------------------------------------------------------------------

    function wrapX(x) { return ((x % PW) + PW) % PW; }
    function wrapY(y) { return TOP + ((((y - TOP) % PH) + PH) % PH); }
    // Shortest signed distance on the torus, so gravity and collisions work
    // across the screen edges exactly as they do in the middle.
    function dX(d) { return d > PW / 2 ? d - PW : (d < -PW / 2 ? d + PW : d); }
    function dY(d) { return d > PH / 2 ? d - PH : (d < -PH / 2 ? d + PH : d); }

    function gap(a, b) { return Math.hypot(dX(b.x - a.x), dY(b.y - a.y)); }
    function near(a, b, r) { return gap(a, b) < r; }

    function move(o, dt) {
        o.x = wrapX(o.x + o.vx * dt);
        o.y = wrapY(o.y + o.vy * dt);
    }

    function capSpeed(o, max) {
        var sp = Math.hypot(o.vx, o.vy);
        if (sp > max) { o.vx *= max / sp; o.vy *= max / sp; }
    }

    // Adds the pull of every well to o's velocity. The distance is floored so
    // the inverse square never blows up at a core: ships and shots that close
    // die on the same tick, and rocks are stopped at the surface, well outside
    // the floor.
    function pull(s, o, dt) {
        for (var i = 0; i < s.wells.length; i++) {
            var w = s.wells[i], dx = dX(w.x - o.x), dy = dY(w.y - o.y);
            var d2 = Math.max(dx * dx + dy * dy, 400), d = Math.sqrt(d2), a = w.gm / d2 * dt;
            o.vx += dx / d * a; o.vy += dy / d * a;
        }
    }

    // The well whose core (grown or shrunk by pad) contains o, if any.
    function coreAt(s, o, pad) {
        for (var i = 0; i < s.wells.length; i++) {
            if (near(o, s.wells[i], s.wells[i].r + pad)) return s.wells[i];
        }
        return null;
    }

    // Inside this radius gravity beats the ship's engine: only sideways speed
    // gets you out again. It is drawn as the dashed red ring.
    function dangerRadius(w) { return Math.sqrt(w.gm / THRUST); }

    // ------------------------------------------------------------------
    // Level setup
    // ------------------------------------------------------------------

    // Sets a well's position and its orbital velocity, which rocks need to
    // bounce off a moving core correctly.
    function placeWell(w) {
        var c = Math.cos(w.ph), sn = Math.sin(w.ph);
        w.x = w.cx + c * w.or; w.y = w.cy + sn * w.or;
        w.vx = -sn * w.or * w.ow; w.vy = c * w.or * w.ow;
    }

    function makeWell(d) {
        var w = {
            kind: d.kind, gm: d.gm, r: CORE_R[d.kind],
            cx: d.cx, cy: d.cy, or: d.or || 0, ow: d.ow || 0, ph: d.ph || 0,
            beam: d.beam || 0, bw: d.bw || 0, ba: 0,
            x: 0, y: 0, vx: 0, vy: 0
        };
        placeWell(w);
        return w;
    }

    // Saucers fly in from beyond one edge and out past the other without
    // wrapping, so they are measured in plain screen distance: on the torus a
    // saucer still off-screen would touch a ship at the opposite edge.
    function foeNear(f, o, r) { return G.dist(f.x, f.y, o.x, o.y) < r; }

    function crowded(s, spot) {
        return s.rocks.some(function (k) { return near(spot, k, k.r + 120); }) ||
            s.foes.some(function (f) { return foeNear(f, spot, 150); });
    }

    // The spawn point that is currently furthest from every well and beam;
    // wells move, so the best one changes during a level. With `strict` a
    // point that has a rock or saucer close by is skipped, and the result is
    // null when every point is crowded.
    function bestSpawn(s, strict) {
        var best = null, bestD = -Infinity;
        s.spawns.forEach(function (p) {
            var spot = { x: p[0], y: p[1] }, d = Infinity;
            if (strict && crowded(s, spot)) return;
            s.wells.forEach(function (w) { d = Math.min(d, gap(spot, w) - w.r - w.beam); });
            if (d > bestD) { bestD = d; best = spot; }
        });
        return best;
    }

    // `inv` is the shield in seconds; `late` counts how long a destroyed ship
    // has waited for a clear spawn; `fresh` marks the level's first ship
    // until the player touches a control.
    function newShip(spot, shield) {
        return {
            x: spot.x, y: spot.y, vx: 0, vy: 0, a: -Math.PI / 2, inv: shield, fresh: shield === SHIELD_START,
            dead: false, wait: 0, late: 0, flame: false
        };
    }

    // `warp` counts down while a rock of a later wave materialises: until it
    // reaches zero the rock can neither hit nor be hit. `ping` rate-limits
    // its bounce effects.
    function newRock(x, y, vx, vy, size, iron, rnd) {
        var shape = [];
        for (var i = 0; i < 10; i++) shape.push(0.74 + rnd() * 0.38);
        return {
            x: x, y: y, vx: vx, vy: vy, size: size, r: ROCK_R[size], iron: iron, hp: iron ? 2 : 1,
            a: rnd() * TAU, spin: (rnd() - 0.5) * 2.4, shape: shape, ping: 0, warp: 0
        };
    }

    // Rocks start on a rough orbit around the well that pulls hardest at
    // their position, so the level opens with slingshots instead of a rain
    // of rocks straight into the cores. A swirl level uses the exact circular
    // speed around the first well, in one direction, so its rocks really do
    // circle the giant.
    function orbitVelocity(s, spot, rnd, swirl) {
        var best = s.wells[0], bestPull = 0;
        s.wells.forEach(function (w) {
            var d = Math.max(gap(spot, w), 1), p = w.gm / (d * d);
            if (p > bestPull && !swirl) { bestPull = p; best = w; }
        });
        var dx = dX(best.x - spot.x), dy = dY(best.y - spot.y), d = Math.max(Math.hypot(dx, dy), 1);
        var circular = Math.sqrt(best.gm / d);
        var sp = swirl ? circular : G.clamp(circular * (0.8 + rnd() * 0.3), 40, 150);
        var dir = swirl || rnd() < 0.5 ? 1 : -1;
        return { vx: -dy / d * sp * dir, vy: dx / d * sp * dir };
    }

    // A swirl level keeps its rocks in a ring that fits on the screen, since
    // an orbit that crosses the wrap is no longer an orbit.
    function rockCandidate(s, rnd, swirl) {
        if (!swirl) return { x: rnd() * PW, y: TOP + rnd() * PH };
        var a = rnd() * TAU, d = 170 + rnd() * 45, w = s.wells[0];
        return { x: w.x + Math.cos(a) * d, y: w.y + Math.sin(a) * d };
    }

    // Clear of the ship (which starts at one of the spawn points, not always
    // the first), of the other spawn points and of every core.
    function rockSpotOk(s, spot) {
        if (near(spot, s.ship, 230)) return false;
        if (s.spawns.some(function (p) { return near(spot, { x: p[0], y: p[1] }, 150); })) return false;
        return !s.wells.some(function (w) { return near(spot, w, w.r + 120); });
    }

    // Places the big rocks of wave s.wave. The first wave is laid out from
    // the level's seed; later ones depend on where the ship is by then, so
    // they take plain random numbers and warp in.
    function placeRocks(s, rnd, warp) {
        for (var i = 0; i < s.waves[s.wave]; i++) {
            var spot = rockCandidate(s, rnd, s.swirl);
            // Bounded: the first wave of every level finds a legal spot well
            // within this many tries (fixed seeds, checked). A later wave on a
            // crowded moment may give up, and its warp-in keeps that fair.
            for (var tries = 0; tries < 300 && !rockSpotOk(s, spot); tries++) spot = rockCandidate(s, rnd, s.swirl);
            var v = orbitVelocity(s, spot, rnd, s.swirl), k = newRock(spot.x, spot.y, v.vx, v.vy, 3, i < s.iron, rnd);
            k.warp = warp;
            s.rocks.push(k);
        }
    }

    function makeStars(rnd) {
        var stars = [];
        for (var i = 0; i < 110; i++) {
            stars.push({ x: rnd() * PW, y: TOP + rnd() * PH, size: 1 + rnd() * 1.6, ph: rnd() * TAU, sp: 0.8 + rnd() * 2.4 });
        }
        return stars;
    }

    function init(level) {
        var L = LEVELS[level - 1], rnd = G.rng(level * 7919 + 13);
        var s = {
            time: 0, touch: G.isTouch(), hint: L.hint, wells: L.wells.map(makeWell), spawns: L.spawns,
            rocks: [], shots: [], foes: [], foeShots: [], stars: makeStars(rnd),
            waves: L.rocks, wave: 0, iron: L.iron || 0, swirl: !!L.swirl, banner: 0,
            saucerEvery: L.saucer || 0, saucerT: (L.saucer || 0) * 0.6, sniper: L.sniper || 0,
            bounties: SAUCER_BOUNTIES,
            cool: 0, hyper: 0, tm: { thrust: 0, warn: 0, hum: 0, pulse: 0 }, ship: null
        };
        s.ship = newShip(bestSpawn(s, false), SHIELD_START);
        placeRocks(s, rnd, 0);
        // Thin decoration after setup so phone and desktop keep the same seed
        // and rock layout, regardless of how many stars they draw.
        if (s.touch) {
            s.stars = s.stars.filter(function (_, i) { return i % 4 === 0; });
            s.hint = PHONE_HINTS[level - 1];
        }
        return s;
    }

    // ------------------------------------------------------------------
    // Wells
    // ------------------------------------------------------------------

    function moveWells(s, dt) {
        s.wells.forEach(function (w) {
            w.ph += w.ow * dt;
            w.ba += w.bw * dt;
            placeWell(w);
        });
    }

    // Rocks survive a core: they ricochet off it elastically, measured in the
    // core's own frame so an orbiting well bats them properly. If
    // wells ate rocks a level would clear itself while the player kept away.
    // A slow contact is a rock resting on the surface: it is set back on the
    // surface and just stops sinking, silently. A real bounce only turns the
    // velocity round and leaves the position alone, because pushing the rock
    // outward would hand it energy on every bounce. The flare and tone are
    // rate-limited per rock, so a rock skipping along a core stays quiet.
    function bounceRock(w, k) {
        var dx = dX(k.x - w.x), dy = dY(k.y - w.y), d = Math.max(Math.hypot(dx, dy), 1);
        var nx = dx / d, ny = dy / d, reach = w.r + k.r * 0.6;
        var vn = (k.vx - w.vx) * nx + (k.vy - w.vy) * ny;
        if (vn >= 0) return;
        var resting = -vn < REST_SPEED, push = resting ? vn : 2 * vn;
        k.vx -= push * nx; k.vy -= push * ny;
        if (resting) { k.x = wrapX(w.x + nx * reach); k.y = wrapY(w.y + ny * reach); }
        if (resting || k.ping > 0) return;
        k.ping = 0.25;
        G.burst(w.x + nx * w.r, w.y + ny * w.r, { n: 8, color: WELL_COLOR[w.kind], speed: 170, life: 0.4, size: 2 });
        G.tone(150 + k.size * 40, 0.16, { type: 'sine', slide: 420, vol: 0.12 });
    }

    // The beam wraps like everything else, so it is one segment repeated in
    // each neighbouring copy of the screen. fn gets both ends of each copy,
    // with the beam turned on by `lead` seconds.
    function eachBeam(w, lead, fn) {
        var a = w.ba + w.bw * lead, ex = Math.cos(a) * w.beam, ey = Math.sin(a) * w.beam;
        for (var ix = -1; ix <= 1; ix++) {
            for (var iy = -1; iy <= 1; iy++) {
                var x = w.x + ix * PW, y = w.y + iy * PH;
                fn(x, y, x + ex, y + ey);
            }
        }
    }

    // True when a ship at p is in a beam, or within pad of one, `lead`
    // seconds from now.
    function beamHits(s, p, pad, lead) {
        var hit = false;
        s.wells.forEach(function (w) {
            if (!w.beam) return;
            eachBeam(w, lead, function (ax, ay, bx, by) {
                var q = G.closestOnSeg(p.x, p.y, ax, ay, bx, by);
                if (G.dist(p.x, p.y, q.x, q.y) < SHIP_R + pad) hit = true;
            });
        });
        return hit;
    }

    // ------------------------------------------------------------------
    // Ship
    // ------------------------------------------------------------------

    function thrust(s, p, dt) {
        p.vx += Math.cos(p.a) * THRUST * dt;
        p.vy += Math.sin(p.a) * THRUST * dt;
        if (s.tm.thrust > 0) return;
        // Gated: one puff of noise and exhaust every few ticks, not per tick.
        s.tm.thrust = 0.07;
        G.noise(0.1, { freq: 320, vol: 0.09 });
        G.burst(p.x - Math.cos(p.a) * 10, p.y - Math.sin(p.a) * 10, {
            n: 2, color: C.gold, speed: 150, life: 0.35, size: 2, angle: p.a + Math.PI, spread: 0.6
        });
    }

    function fire(s, p) {
        if (s.cool > 0 || s.shots.length >= MAX_SHOTS) return;
        s.cool = 0.17;
        var cx = Math.cos(p.a), cy = Math.sin(p.a);
        // Shots inherit the ship's velocity, as they would in free fall.
        s.shots.push({ x: p.x + cx * 14, y: p.y + cy * 14, vx: p.vx + cx * SHOT_SPEED, vy: p.vy + cy * SHOT_SPEED, life: SHOT_LIFE });
        G.tone(1040, 0.08, { slide: 320, vol: 0.09 });
    }

    // Where o will be in t seconds if nothing pulls on it.
    function ahead(o, t) {
        return { x: wrapX(o.x + o.vx * t), y: wrapY(o.y + (o.vy || 0) * t) };
    }

    // Whether a ship that jumps to `spot` with velocity (vx, vy) is, t
    // seconds later, outside every danger ring and clear of rocks, saucers,
    // their shots and the beams.
    function jumpClearAt(s, spot, vx, vy, t) {
        var q = ahead({ x: spot.x, y: spot.y, vx: vx, vy: vy }, t);
        return !s.wells.some(function (w) { return near(q, w, w.r + dangerRadius(w)); }) &&
            !s.rocks.some(function (k) { return near(q, ahead(k, t), k.r + 50); }) &&
            !s.foes.some(function (f) { return foeNear({ x: f.x + f.vx * t, y: f.y }, q, 100); }) &&
            !s.foeShots.some(function (b) { return near(q, ahead(b, t), 50); }) &&
            !beamHits(s, q, 30, t);
    }

    // A spot for a jump that does not kill on arrival: clear right now and,
    // going by everyone's present course, for the next JUMP_CLEAR seconds.
    // When the screen is too busy for that it settles for clear right now;
    // null when even that cannot be found.
    function jumpSpot(s, p) {
        var fallback = null;
        for (var tries = 0; tries < 40; tries++) {
            var spot = { x: G.rnd(20, PW - 20), y: G.rnd(TOP + 20, G.H - 20) }, t = 0;
            if (!jumpClearAt(s, spot, p.vx, p.vy, 0)) continue;
            fallback = fallback || spot;
            for (t = 0.2; t <= JUMP_CLEAR && jumpClearAt(s, spot, p.vx, p.vy, t); t += 0.2) { /* scan the course */ }
            if (t > JUMP_CLEAR) return spot;
        }
        return fallback;
    }

    // A random jump that keeps the ship's momentum. The risk is where that
    // momentum and the wells carry the ship afterwards, not the arrival: the
    // spot is clear and a blink of shield covers the landing. If no clear
    // spot turns up the ship stays put.
    function hyperspace(s, p) {
        if (s.hyper > 0) return;
        s.hyper = 3;
        G.burst(p.x, p.y, { n: 16, color: C.purple, speed: 200, life: 0.4 });
        var spot = jumpSpot(s, p);
        if (spot) { p.x = spot.x; p.y = spot.y; p.inv = Math.max(p.inv, SHIELD_JUMP); }
        G.burst(p.x, p.y, { n: 16, color: C.blue, speed: 200, life: 0.4 });
        G.tone(200, 0.3, { type: 'sawtooth', slide: 2400, vol: 0.1 });
        G.noise(0.25, { filter: 'bandpass', freq: 400, slide: 3000, vol: 0.12 });
        G.flash(C.purple, 0.12);
    }

    // The new ship appears only at a spawn point with no rock or saucer close
    // by, so its shield cannot run out on top of one. If every point stays
    // crowded for three seconds it takes the best one anyway.
    function respawn(s, p, dt) {
        p.wait -= dt;
        if (p.wait > 0) return;
        p.late += dt;
        var spot = bestSpawn(s, p.late < 3);
        if (spot) s.ship = newShip(spot, SHIELD);
    }

    function steerShip(s, dt) {
        var p = s.ship;
        if (p.dead) { respawn(s, p, dt); return; }
        // The opening shield waits for the player, then gives a short head start.
        if (p.fresh && (G.key.left || G.key.right || G.key.up || G.key.a || G.key.b)) {
            p.fresh = false;
            p.inv = Math.min(p.inv, SHIELD_GO);
        }
        if (G.key.left) p.a -= TURN * dt;
        if (G.key.right) p.a += TURN * dt;
        p.flame = G.key.up;
        if (p.flame) thrust(s, p, dt);
        // The shield also holds the ship against gravity, so a fresh ship
        // hangs where it spawned until the player has found the controls.
        if (p.inv <= 0) pull(s, p, dt);
        // A trace of drag keeps the ship controllable and means a drifting
        // ship always spirals inward in the end.
        p.vx -= p.vx * DRAG * dt; p.vy -= p.vy * DRAG * dt;
        capSpeed(p, SHIP_MAX);
        move(p, dt);
        if (p.inv > 0) p.inv -= dt;
        if (G.key.a) fire(s, p);
        if (G.hit.b) hyperspace(s, p);
    }

    function killShip(s) {
        var p = s.ship;
        G.burst(p.x, p.y, { n: 40, color: C.blue, speed: 260, life: 0.9 });
        G.burst(p.x, p.y, { n: 20, color: C.gold, speed: 140, life: 0.7 });
        G.sfx('bigboom');
        // The wreck is cleared away for a moment, then a new ship spawns with
        // a short shield; shots in flight are removed so it is a fair start.
        p.dead = true; p.wait = 1.0; p.flame = false;
        s.foeShots = [];
        G.loseLife();
    }

    function warnNearWell(s, p) {
        if (s.tm.warn > 0) return;
        var close = s.wells.some(function (w) { return near(p, w, dangerRadius(w) * 1.25 + w.r); });
        if (!close) return;
        s.tm.warn = 0.32;
        G.tone(1320, 0.07, { type: 'triangle', vol: 0.1 });
    }

    function checkShip(s) {
        var p = s.ship;
        if (p.dead) return;
        // A core kills even a freshly spawned, shielded ship.
        if (coreAt(s, p, SHIP_R * 0.5)) { killShip(s); return; }
        warnNearWell(s, p);
        if (p.inv > 0) return;
        var rock = s.rocks.some(function (k) { return k.warp <= 0 && near(p, k, k.r * 0.85 + SHIP_R * 0.7); });
        var foe = s.foes.some(function (f) { return foeNear(f, p, f.r + SHIP_R * 0.7); });
        if (rock || foe || beamHits(s, p, 0, 0)) killShip(s);
    }

    // ------------------------------------------------------------------
    // Rocks and shots
    // ------------------------------------------------------------------

    function splitRock(s, k) {
        var sp = Math.hypot(k.vx, k.vy) || 1, nx = -k.vy / sp, ny = k.vx / sp, kick = G.rnd(45, 80);
        [1, -1].forEach(function (side) {
            s.rocks.push(newRock(k.x + nx * side * k.r * 0.4, k.y + ny * side * k.r * 0.4,
                k.vx + nx * side * kick, k.vy + ny * side * kick, k.size - 1, k.iron, Math.random));
        });
    }

    function breakRock(s, k) {
        s.rocks.splice(s.rocks.indexOf(k), 1);
        var pts = ROCK_PTS[k.size] * (k.iron ? 2 : 1);
        G.addScore(pts);
        G.popup(k.x, k.y, pts, C.gold);
        G.burst(k.x, k.y, { n: 6 + k.size * 5, color: k.iron ? C.purple : C.fg, speed: 150 + k.size * 30, life: 0.6 });
        // Bigger rocks rumble lower and longer.
        G.noise(0.14 + k.size * 0.1, { freq: 2200 - k.size * 550, slide: 80, vol: 0.2 + k.size * 0.06 });
        if (k.size === 3) G.shake(4, 0.15);
        if (k.size > 1) splitRock(s, k);
    }

    function hitRock(s, k, shot) {
        k.hp--;
        if (k.hp <= 0) { breakRock(s, k); return; }
        // Iron: the first hit only cracks it and shoves it a little.
        k.vx += shot.vx * 0.04; k.vy += shot.vy * 0.04;
        G.tone(1700, 0.09, { type: 'triangle', vol: 0.14 });
        G.burst(shot.x, shot.y, { n: 6, color: C.gold, speed: 160, life: 0.3, size: 2 });
    }

    // Bleeds off what a rock has above FAR_SPEED in far-field terms: its
    // speed after climbing out to FAR from the wells it is close to. Judged
    // that way a rock diving past a core is not slowed (which would sink it),
    // while one that a moving well has batted too hard calms down again.
    function coolRock(s, k, dt) {
        var v2 = k.vx * k.vx + k.vy * k.vy, far2 = v2;
        s.wells.forEach(function (w) {
            var d = Math.max(gap(k, w), w.r);
            if (d < FAR) far2 -= 2 * w.gm * (1 / d - 1 / FAR);
        });
        var excess = far2 - FAR_SPEED * FAR_SPEED;
        if (excess <= 0) return;
        var f = Math.sqrt(1 - Math.min(0.5, excess / v2 * COOL * dt));
        k.vx *= f; k.vy *= f;
    }

    function updateRocks(s, dt) {
        s.rocks.forEach(function (k) {
            if (k.ping > 0) k.ping -= dt;
            if (k.warp > 0) k.warp -= dt;
            // Half the pull before the move and half after (leapfrog). The
            // plain pull-then-move step loses a little energy on every bounce
            // off a core, which over a minute sinks all rocks onto the cores.
            pull(s, k, dt / 2);
            move(k, dt);
            pull(s, k, dt / 2);
            coolRock(s, k, dt);
            capSpeed(k, ROCK_MAX);
            k.a += k.spin * dt;
            var w = coreAt(s, k, k.r * 0.6);
            if (w) bounceRock(w, k);
        });
    }

    // True when the shot hit something and must be removed.
    function shotHits(s, b) {
        var i;
        for (i = 0; i < s.rocks.length; i++) {
            if (s.rocks[i].warp <= 0 && near(b, s.rocks[i], s.rocks[i].r + 2)) { hitRock(s, s.rocks[i], b); return true; }
        }
        for (i = 0; i < s.foes.length; i++) {
            if (foeNear(s.foes[i], b, s.foes[i].r + 3)) { killFoe(s, s.foes[i]); return true; }
        }
        return false;
    }

    function fizzle(b, color) {
        G.burst(b.x, b.y, { n: 3, color: color, speed: 60, life: 0.25, size: 2 });
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (b) {
            pull(s, b, dt);
            move(b, dt);
            b.life -= dt;
            if (coreAt(s, b, 0)) { fizzle(b, C.gold); return false; }
            return b.life > 0 && !shotHits(s, b);
        });
    }

    // ------------------------------------------------------------------
    // Saucers
    // ------------------------------------------------------------------

    function spawnFoe(s) {
        var dir = Math.random() < 0.5 ? 1 : -1, small = Math.random() < s.sniper;
        s.foes.push({
            x: dir > 0 ? -20 : PW + 20, y: G.rnd(TOP + 70, G.H - 70), vx: dir * G.rnd(80, 120),
            ph: G.rnd(0, TAU), small: small, r: small ? 10 : 16, fireT: 1.3
        });
        G.sfx('alarm');
    }

    function foeFire(s, f) {
        var p = s.ship, err = f.small ? FOE_ERR.small : FOE_ERR.big;
        var a = Math.atan2(dY(p.y - f.y), dX(p.x - f.x)) + G.rnd(-err, err);
        s.foeShots.push({ x: f.x, y: f.y, vx: Math.cos(a) * FOE_SHOT, vy: Math.sin(a) * FOE_SHOT, life: 2.4 });
        G.tone(520, 0.14, { type: 'sawtooth', slide: 140, vol: 0.1 });
    }

    // A saucer shoots only from on the screen (its shot would otherwise wrap
    // to the far edge) and only at a ship far enough away to dodge.
    function canFire(s, f) {
        return !s.ship.dead && f.x > 0 && f.x < PW && !foeNear(f, s.ship, FOE_HOLD);
    }

    // Saucers fly on anti-gravity: they cross the screen once, bobbing, and
    // swerve around any core in their lane. Returns false once off-screen.
    function moveFoe(s, f, dt) {
        var vy = Math.cos(f.ph * 1.6) * 50;
        s.wells.forEach(function (w) {
            if (near(f, w, w.r + 110)) vy += (f.y < w.y ? -1 : 1) * 110;
        });
        f.ph += dt;
        f.x += f.vx * dt;
        f.y = G.clamp(f.y + vy * dt, TOP + 20, G.H - 20);
        f.fireT -= dt;
        if (f.fireT <= 0) {
            if (canFire(s, f)) foeFire(s, f);
            f.fireT = f.small ? FOE_RELOAD.small : FOE_RELOAD.big;
        }
        return f.x > -30 && f.x < PW + 30;
    }

    // Saucers keep coming for as long as the level lasts, but only the first
    // few pay a bounty, so nobody can farm them next to the last rock.
    function killFoe(s, f) {
        s.foes.splice(s.foes.indexOf(f), 1);
        var pts = s.bounties > 0 ? (f.small ? 600 : 300) : 0;
        if (s.bounties > 0) s.bounties--;
        G.addScore(pts);
        G.popup(f.x, f.y, pts || 'NO BOUNTY', C.red);
        G.burst(f.x, f.y, { n: 26, color: C.red, speed: 220, life: 0.7 });
        G.sfx('boom');
    }

    function updateFoes(s, dt) {
        if (s.saucerEvery) {
            s.saucerT -= dt;
            // One saucer at a time: the next waits until the sky is clear.
            if (s.saucerT <= 0 && !s.foes.length) { spawnFoe(s); s.saucerT = s.saucerEvery; }
        }
        s.foes = s.foes.filter(function (f) { return moveFoe(s, f, dt); });
        if (s.foes.length && s.tm.hum <= 0) {
            s.tm.hum = 0.28;
            G.tone(s.foes[0].small ? 640 : 380, 0.12, { type: 'sine', slide: s.foes[0].small ? 760 : 460, vol: 0.06 });
        }
    }

    function updateFoeShots(s, dt) {
        var p = s.ship, hit = false;
        s.foeShots = s.foeShots.filter(function (b) {
            pull(s, b, dt);
            move(b, dt);
            b.life -= dt;
            if (coreAt(s, b, 0)) { fizzle(b, C.red); return false; }
            if (!p.dead && p.inv <= 0 && near(b, p, SHIP_R)) { hit = true; return false; }
            return b.life > 0;
        });
        if (hit) killShip(s);
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    function tickTimers(s, dt) {
        for (var k in s.tm) if (s.tm[k] > 0) s.tm[k] -= dt;
        if (s.cool > 0) s.cool -= dt;
        if (s.hyper > 0) s.hyper -= dt;
        if (s.banner > 0) s.banner -= dt;
        // The pulsar ticks like a lighthouse so its beam can be heard coming.
        var pulsar = s.wells.some(function (w) { return w.beam > 0; });
        if (pulsar && s.tm.pulse <= 0) {
            s.tm.pulse = 0.9;
            G.tone(1760, 0.03, { type: 'sine', vol: 0.05 });
        }
    }

    // The next wave warps in at once, well away from the ship; the banner
    // and the rising chord announce it.
    function nextWave(s) {
        s.wave++;
        s.banner = 2.2;
        placeRocks(s, Math.random, WARP);
        G.tone(220, 0.5, { type: 'triangle', slide: 660, vol: 0.12 });
        G.tone(330, 0.5, { type: 'sine', slide: 990, vol: 0.08, delay: 0.08 });
    }

    function update(s, dt) {
        s.time += dt;
        tickTimers(s, dt);
        moveWells(s, dt);
        steerShip(s, dt);
        updateShots(s, dt);
        updateRocks(s, dt);
        updateFoes(s, dt);
        updateFoeShots(s, dt);
        checkShip(s);
        if (s.rocks.length) return;
        if (s.wave + 1 < s.waves.length) nextWave(s);
        else G.win(500 + G.lives * 250);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // Calls fn at (x, y) and at its mirror images across any edge it
    // overlaps, so things slide across the wrap instead of popping.
    function eachImage(x, y, r, fn) {
        var xs = [x], ys = [y];
        if (x < r) xs.push(x + PW); else if (x > PW - r) xs.push(x - PW);
        if (y < TOP + r) ys.push(y + PH); else if (y > G.H - r) ys.push(y - PH);
        xs.forEach(function (ix) { ys.forEach(function (iy) { fn(ix, iy); }); });
    }

    function circle(ctx, x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
    }

    function drawSky(s, ctx) {
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, G.W, G.H);
        if (!s.touch) {
            var neb = ctx.createRadialGradient(700, 150, 20, 700, 150, 520);
            neb.addColorStop(0, 'rgba(155,93,229,0.20)');
            neb.addColorStop(0.5, 'rgba(76,201,240,0.06)');
            neb.addColorStop(1, 'rgba(2,2,20,0)');
            ctx.fillStyle = neb;
            ctx.fillRect(0, TOP, G.W, PH);
        }
        ctx.fillStyle = C.fg;
        s.stars.forEach(function (st) {
            ctx.globalAlpha = 0.3 + 0.3 * Math.sin(s.time * st.sp + st.ph);
            ctx.fillRect(st.x, st.y, st.size, st.size);
        });
        ctx.globalAlpha = 1;
    }

    // Rings that shrink toward the core show the inflow, and the dashed red
    // ring marks where gravity outpulls the engine.
    function drawField(s, ctx, w, x, y) {
        var reach = dangerRadius(w) * 1.7;
        ctx.strokeStyle = WELL_COLOR[w.kind];
        ctx.lineWidth = s.touch ? 2 : 1;
        for (var i = 0; i < (s.touch ? 1 : 3); i++) {
            var f = 1 - ((s.time * 0.22 + i / 3) % 1);
            ctx.globalAlpha = 0.34 * (1 - f);
            circle(ctx, x, y, w.r + reach * f);
            ctx.stroke();
        }
        ctx.globalAlpha = s.touch ? 0.85 : 0.5;
        ctx.strokeStyle = C.red;
        ctx.setLineDash(s.touch ? [8, 8] : [4, 8]);
        ctx.lineDashOffset = s.time * 14;
        circle(ctx, x, y, dangerRadius(w) + w.r);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    function drawGlow(ctx, x, y, r, color) {
        var g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(2,2,20,0)');
        ctx.fillStyle = g;
        circle(ctx, x, y, r);
        ctx.fill();
    }

    // A black disc inside a glowing rim, with tilted accretion arcs that
    // rotate so the hole never looks static.
    function drawHole(s, ctx, w, x, y) {
        ctx.globalAlpha = 0.55;
        if (!s.touch) drawGlow(ctx, x, y, w.r * 2.6, C.purple);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        circle(ctx, x, y, w.r);
        ctx.fill();
        ctx.lineWidth = s.touch ? 3 : 2;
        ctx.strokeStyle = C.purple;
        ctx.stroke();
        var rings = w.kind === 'giant' && !s.touch ? 3 : 1;
        for (var i = 0; i < rings; i++) {
            var a = s.time * (1.4 - i * 0.3) + i * 2;
            ctx.strokeStyle = i % 2 ? C.gold : C.blue;
            ctx.beginPath();
            ctx.ellipse(x, y, w.r * (1.55 + i * 0.4), w.r * (0.5 + i * 0.14), 0.35, a, a + 4.2);
            ctx.stroke();
        }
    }

    function drawSun(s, ctx, w, x, y) {
        var beat = 1 + 0.08 * Math.sin(s.time * 3 + w.cx);
        var pulsar = w.kind === 'pulsar';
        ctx.globalAlpha = 0.6;
        if (!s.touch) drawGlow(ctx, x, y, w.r * 2.8 * beat, pulsar ? C.blue : C.gold);
        ctx.globalAlpha = 1;
        ctx.fillStyle = pulsar ? '#eaffff' : '#fff3c4';
        circle(ctx, x, y, w.r * (pulsar ? 0.6 : 0.8) * beat);
        ctx.fill();
        ctx.strokeStyle = pulsar ? C.blue : C.gold;
        ctx.lineWidth = s.touch ? 3 : 2;
        circle(ctx, x, y, w.r);
        ctx.stroke();
    }

    function drawWell(s, ctx, w) {
        eachImage(w.x, w.y, dangerRadius(w) * 1.7 + w.r, function (x, y) {
            drawField(s, ctx, w, x, y);
            if (w.kind === 'hole' || w.kind === 'giant') drawHole(s, ctx, w, x, y);
            else drawSun(s, ctx, w, x, y);
        });
    }

    function drawBeam(ctx, w) {
        if (!w.beam) return;
        ctx.lineCap = 'round';
        [[16, 0.16, C.blue], [7, 0.4, C.blue], [2.5, 1, '#ffffff']].forEach(function (layer) {
            ctx.globalAlpha = layer[1];
            ctx.strokeStyle = layer[2];
            ctx.lineWidth = layer[0];
            ctx.beginPath();
            // Every wrapped copy; the ones off-screen are clipped away.
            eachBeam(w, 0, function (ax, ay, bx, by) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); });
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    function drawRock(s, ctx, k) {
        var ghost = k.warp > 0;
        ctx.fillStyle = k.iron ? '#2a1746' : '#141a3c';
        // A cracked iron rock turns gold: one more hit breaks it.
        ctx.strokeStyle = k.iron ? (k.hp > 1 ? C.purple : C.gold) : C.fg;
        ctx.lineWidth = k.iron || s.touch ? 3 : 2;
        // A rock still warping in is a dashed outline that grows solid.
        if (ghost) { ctx.globalAlpha = 0.9 - 0.6 * k.warp / WARP; ctx.setLineDash([5, 6]); }
        eachImage(k.x, k.y, k.r * 1.2, function (x, y) {
            ctx.beginPath();
            for (var i = 0; i < k.shape.length; i++) {
                var a = k.a + i / k.shape.length * TAU, r = k.r * k.shape[i];
                ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            }
            ctx.closePath();
            if (!ghost) ctx.fill();
            ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    function drawShots(s, ctx) {
        // Big enough to stay visible when a phone draws the canvas at 40%.
        [[s.shots, C.gold, 3.2], [s.foeShots, C.red, 4.5]].forEach(function (kind) {
            ctx.fillStyle = kind[1];
            kind[0].forEach(function (b) {
                eachImage(b.x, b.y, kind[2], function (x, y) { circle(ctx, x, y, kind[2]); ctx.fill(); });
            });
        });
    }

    function drawFoe(s, ctx, f) {
        var r = f.r;
        ctx.lineWidth = s.touch ? 3 : 2;
        ctx.strokeStyle = C.red;
        ctx.fillStyle = '#2b0d1c';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, r * 1.5, r * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(f.x, f.y - r * 0.3, r * 0.7, Math.PI, 0);
        ctx.stroke();
        // Running lights chase along the rim.
        for (var i = -1; i <= 1; i++) {
            ctx.fillStyle = Math.floor(s.time * 6 + i + 3) % 3 === 0 ? C.gold : C.red;
            ctx.fillRect(f.x + i * r * 0.8 - 2, f.y - 2, 4, 4);
        }
        if (f.fireT > FOE_TELL || !canFire(s, f)) return;
        // The tell: a ring closes on the saucer just before it shoots.
        ctx.strokeStyle = C.gold;
        circle(ctx, f.x, f.y, r * 1.5 + f.fireT / FOE_TELL * 22);
        ctx.stroke();
    }

    // Dots along the path a shot fired right now would take: the only way to
    // read how the wells will bend it.
    function drawAim(s, ctx, p) {
        var cx = Math.cos(p.a), cy = Math.sin(p.a);
        var o = { x: p.x + cx * 14, y: p.y + cy * 14, vx: p.vx + cx * SHOT_SPEED, vy: p.vy + cy * SHOT_SPEED };
        ctx.fillStyle = C.blue;
        for (var i = 1; i <= 44; i++) {
            pull(s, o, G.STEP);
            move(o, G.STEP);
            if (coreAt(s, o, 0)) break;
            if (i % (s.touch ? 6 : 4)) continue;
            ctx.globalAlpha = 0.85 * (1 - i / 52);
            var dot = s.touch ? 6 : 4;
            ctx.fillRect(o.x - dot / 2, o.y - dot / 2, dot, dot);
        }
        ctx.globalAlpha = 1;
    }

    function shipPath(ctx, x, y, a) {
        var cx = Math.cos(a), cy = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(x + cx * 14, y + cy * 14);
        ctx.lineTo(x - cx * 9 - cy * 9, y - cy * 9 + cx * 9);
        ctx.lineTo(x - cx * 5, y - cy * 5);
        ctx.lineTo(x - cx * 9 + cy * 9, y - cy * 9 - cx * 9);
        ctx.closePath();
    }

    function drawShip(s, ctx) {
        var p = s.ship;
        if (p.dead) return;
        drawAim(s, ctx, p);
        eachImage(p.x, p.y, 18, function (x, y) {
            if (p.flame) {
                var len = 16 + Math.random() * 10, cx = Math.cos(p.a), cy = Math.sin(p.a);
                ctx.strokeStyle = C.gold;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x - cx * 7, y - cy * 7);
                ctx.lineTo(x - cx * len, y - cy * len);
                ctx.stroke();
            }
            ctx.fillStyle = '#0b1638';
            ctx.strokeStyle = C.blue;
            ctx.lineWidth = s.touch ? 3 : 2;
            shipPath(ctx, x, y, p.a);
            ctx.fill();
            ctx.stroke();
            // A bright centre distinguishes the player from blue aim dots at
            // portrait size without changing the ship's collision footprint.
            if (s.touch) { ctx.fillStyle = C.fg; circle(ctx, x, y, 3.5); ctx.fill(); }
            if (p.inv <= 0) return;
            // The spawn shield pulses and fades as it runs out.
            ctx.globalAlpha = Math.min(1, p.inv) * (0.5 + 0.4 * Math.sin(s.time * 18));
            ctx.strokeStyle = C.fg;
            circle(ctx, x, y, 19);
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
    }

    function draw(s, ctx) {
        drawSky(s, ctx);
        // Mirror images near the top edge must not paint under the HUD.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, TOP, G.W, PH);
        ctx.clip();
        s.wells.forEach(function (w) { drawWell(s, ctx, w); });
        s.wells.forEach(function (w) { drawBeam(ctx, w); });
        s.rocks.forEach(function (k) { drawRock(s, ctx, k); });
        drawShots(s, ctx);
        s.foes.forEach(function (f) { drawFoe(s, ctx, f); });
        drawShip(s, ctx);
        ctx.restore();
        // s.time is 0 until the level is actually played, which keeps the hint
        // off the title screen where it would sit on top of the menu text.
        if (s.time > 0 && s.time < 7) {
            ctx.globalAlpha = Math.min(1, 7 - s.time);
            G.text(s.hint, G.W / 2, G.H - 16, { size: s.touch ? 26 : 20, color: C.fg, align: 'center', max: G.W - 40 });
            ctx.globalAlpha = 1;
        }
        if (s.banner > 0) drawBanner(s, ctx);
    }

    function drawBanner(s, ctx) {
        ctx.globalAlpha = Math.min(1, s.banner);
        G.text('WAVE ' + (s.wave + 1) + ' OF ' + s.waves.length, G.W / 2, TOP + 44,
            { size: 28, bold: true, color: C.gold, align: 'center', glow: C.gold });
        ctx.globalAlpha = 1;
    }

    function hud(s) {
        var wave = (s.touch ? 'W' : 'WAVE ') + (s.wave + 1) + '/' + s.waves.length;
        return wave + '  ROCKS ' + s.rocks.length + '  HYPER ' + (s.hyper > 0 ? Math.ceil(s.hyper) + 's' : 'OK');
    }

    // ------------------------------------------------------------------
    // The ending: the giant's last breath as a supernova, and the new
    // constellation that its light draws across the sky
    // ------------------------------------------------------------------

    var NOVA_X = G.W / 2, NOVA_Y = 330;

    // Shock rings race out of the core and a white-gold glare fades into a
    // steady new star, so the scene keeps moving long after the blast.
    function drawNova(t, ctx) {
        var glare = Math.max(0, 1 - t / 2.5);
        // Kept soft: the score is printed across the blast.
        ctx.globalAlpha = 0.3 + 0.3 * glare;
        drawGlow(ctx, NOVA_X, NOVA_Y, 70 + 110 * glare + 8 * Math.sin(t * 3), glare > 0.2 ? '#fff3c4' : C.gold);
        ctx.lineWidth = 3;
        for (var i = 0; i < 4; i++) {
            var f = (t * 0.45 + i / 4) % 1;
            ctx.globalAlpha = 0.6 * (1 - f);
            ctx.strokeStyle = [C.gold, C.blue, C.purple, C.fg][i];
            circle(ctx, NOVA_X, NOVA_Y, 30 + f * 520);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        circle(ctx, NOVA_X, NOVA_Y, 9 + 2 * Math.sin(t * 5));
        ctx.fill();
    }

    // A dozen stars in the sky's free corners, joined one line at a time.
    function constellation(e) {
        if (!e.data.stars) {
            e.data.stars = [];
            for (var i = 0; i < 12; i++) {
                var side = i % 2 ? 1 : -1;
                e.data.stars.push({ x: NOVA_X + side * (250 + e.rng() * 200), y: 50 + e.rng() * 440, ph: e.rng() * TAU });
            }
        }
        return e.data.stars;
    }

    function drawConstellation(e, ctx) {
        var stars = constellation(e), shown = Math.min(stars.length, Math.floor(e.t * 3));
        ctx.strokeStyle = C.blue;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        // Each side is its own figure: a star links to the previous one there.
        for (var i = 2; i < shown; i++) {
            ctx.moveTo(stars[i - 2].x, stars[i - 2].y);
            ctx.lineTo(stars[i].x, stars[i].y);
        }
        ctx.stroke();
        ctx.fillStyle = C.fg;
        for (i = 0; i < shown; i++) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.t * 4 + stars[i].ph);
            ctx.fillRect(stars[i].x - 3, stars[i].y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        drawNova(e.t, ctx);
        drawConstellation(e, ctx);
    }

    G.register('cosmos', {
        title: 'GRAVITY WELL',
        blurb: 'Destroy every rock. Everything falls, including your shots.',
        controls: [
            '← → rotate · ↑ thrust · SPACE / FIRE shoot (hold)',
            'X / HYPER hyperspace: a random jump that keeps your momentum',
            'Never touch a core: it swallows ships and shots, but rocks bounce off',
            'The dotted arc shows where your next shot will curve'
        ],
        levelNames: ['First Light', 'Binary Waltz', 'Event Horizon'],
        colors: { bg: C.bg, fg: C.fg, accent: C.blue, dim: C.dim },
        lives: LIVES,
        // Slow D dorian: long held lead notes stand in for pads over a
        // rolling sine arpeggio and a sparse, half-time beat.
        music: {
            bpm: 96, root: 38, scale: 'dorian', prog: [0, 3, 6, 4],
            bass: 'x.......x.....o.',
            lead: ['4-----7-9---..7-', '8-----6-5---....', 'b---9---7-8---4-', '7-----5-4-------',
                '2---4---7-----9-', 'a-----8-7---5---', '6---8---b-----9-', '7-------........'],
            arp: '0.12.3.21.0.23.1',
            drums: { k: 'x.........x.....', s: '........x.......', h: '..x...x...x...x.' },
            leadWave: 'triangle', bassWave: 'sine', arpWave: 'sine', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // The stick keeps ↑ so one thumb can turn and thrust together on its
        // upper corners, leaving the other thumb on FIRE; with ↓ unused, the
        // lower half of the stick turns without thrusting.
        touch: { a: 'FIRE', b: 'HYPER', hide: ['down'] },
        ending: {
            title: 'SUPERNOVA',
            text: 'The giant burns out, and its light draws new constellations',
            colors: [C.gold, C.blue, C.purple, C.fg],
            draw: drawEnding
        }
    });
})();
