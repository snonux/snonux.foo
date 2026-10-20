/*
 * Orbital Dock — the spaceage theme's game: a thrust lander.
 *
 * Rotate the capsule, burn the engine against gravity and set it down on the
 * pad slowly and upright. Rock, flak, debris and an empty tank all end the
 * flight. Every level is a route of pads to land on in order: beacon pads on
 * the way refill the tank, a cargo pad hands over a crate, the last pad wins.
 * Three levels: a first landing; a cargo haul across a windy plain under a
 * flak turret; and the finale, a rotating starbase whose two arms both have
 * to be docked with, the crate carried from one to the other. Docking there
 * opens the ending: the capsule rides the arm while satellites circle.
 *
 * Every pad (ground, hovering or orbiting) is described by a centre, a normal
 * angle and a velocity, so one touchdown test serves all of them.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var SEG = 24;                    // horizontal spacing of the terrain points
    var R = 12;                      // ship radius: centre to the feet
    // BURN gives a full tank about 15 s of engine: a tidy flight uses some 60%
    // of it on the longest legs, which leaves a learner room to hover and retry.
    var THRUST = 170, TURN = 3.2, BURN = 6.5, TANK = 100, CAN_FUEL = 35;
    var HAUL = 0.88;                 // thrust left over while carrying cargo
    var LIMIT = { down: 60, side: 40, tilt: 0.35 };   // a softer touch than this lands
    var EDGE = 2, FEET = 14;         // deck rim that does not count; half the ship's stance
    // Turrets hold their fire outside [near, range] and a shell burns out once
    // it has flown the range; every start and every pad lies beyond it, so
    // spawning and landing are never under fire.
    var TURRET = { range: 440, near: 150, period: 2.2, shell: 150, lead: 0.6, warmup: 3.5 };
    var DRY = { landed: 1.5, adrift: 5 };             // seconds a dry tank is tolerated
    // Keep phone hints short enough to retain their larger type.
    var TOUCH_HINTS = ['BEACON FIRST — LAND SLOW AND UPRIGHT', 'CARGO WEST — DELIVER EAST — KEEP MOVING', 'DOCK BOTH ARMS — MATCH THE SPIN'];
    // Desktop instruments sit in a compact panel.
    var PANEL = { x: 10, y: 38, w: 212, h: 92, bar: 76, len: 128, row: 21 };
    var C = { bg: '#030a0f', sky: '#06202b', teal: '#00e8e8', dim: '#1a4455', red: '#ff3320', silver: '#c8d8e0', rock: '#082230', far: '#05171f' };

    // One entry per level. floor is a skeleton of [x, y] points that gets
    // seeded jaggedness. pads are listed in the order they must be reached.
    // Ground pads are {i, n}: first terrain point and width in segments, so
    // their edges always sit on the terrain grid; {arm} pads ride the station.
    var LEVELS = [
        { w: 1920, g: 55, fuel: 100, start: [160, 90, 30], amp: 10, hint: 'LAND GENTLY AND UPRIGHT — BEACON PAD FIRST, THEN ON',
            floor: [[0, 430], [150, 470], [300, 440], [450, 490], [600, 455], [744, 460], [864, 460], [1000, 410], [1150, 480], [1300, 440], [1450, 490], [1584, 470], [1704, 470], [1820, 420], [1920, 400]],
            pads: [{ i: 31, n: 5, kind: 'relay' }, { i: 66, n: 5, kind: 'goal' }] },
        // The haul back east crosses the flak turret's range under a
        // crosswind; the canister on the way pays for the detour, and the
        // turret stands far enough from the start and both pads.
        { w: 1920, g: 58, fuel: 100, start: [900, 100, 0], amp: 10, wind: [12, 5], hint: 'FETCH THE CARGO IN THE WEST, DELIVER IT EAST — KEEP MOVING PAST THE FLAK',
            floor: [[0, 300], [96, 300], [192, 300], [300, 460], [450, 420], [600, 480], [760, 430], [900, 500], [1050, 440], [1200, 480], [1350, 420], [1500, 470], [1680, 360], [1776, 360], [1920, 300]],
            turrets: [52], cans: [[1000, 220]], pads: [{ i: 4, n: 4, kind: 'cargo' }, { i: 70, n: 4, kind: 'goal' }] },
        // The arms sweep at about 40 px/s (spin * d) and their decks are three
        // capsules wide: slow and wide enough to match by eye, with a crate on.
        { w: 960, g: 0, fuel: 100, start: [130, 120, 25], amp: 0, hint: 'CARRY THE CRATE FROM ONE ARM TO THE OTHER — MATCH THE SPIN',
            station: { x: 480, y: 290, r: 58, d: 122, spin: 0.32, g: 40, debris: [[205, -0.45, 0], [205, -0.45, Math.PI], [235, 0.35, 1]] },
            pads: [{ w: 72, arm: 0, kind: 'cargo' }, { w: 72, arm: Math.PI, kind: 'goal' }] }
    ];

    // ---------------------------------------------------------------- setup

    function skeletonY(points, x) {
        for (var k = 1; k < points.length; k++) {
            if (x <= points[k][0]) {
                var a = points[k - 1], b = points[k];
                return G.lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
            }
        }
        return points[points.length - 1][1];
    }

    // Turns a skeleton into one height per SEG pixels, roughened by the
    // level's seeded generator so the rock is jagged but always the same.
    function profile(points, cfg, rnd) {
        var line = [];
        if (!points) return null;
        for (var i = 0; i <= cfg.w / SEG; i++) line.push(skeletonY(points, i * SEG) + (rnd() * 2 - 1) * cfg.amp);
        return line;
    }

    // A ground pad flattens the terrain points beneath it; the others ride a
    // station arm (orbit) and are placed by placePads().
    function buildPad(s, def, floorSkeleton) {
        var pad = { kind: def.kind, w: def.w, ground: false, cx: 0, cy: 0, ang: 0, vx: 0, vy: 0 };
        if (def.n) {
            pad.w = def.n * SEG; pad.ground = true;
            pad.cx = def.i * SEG + pad.w / 2; pad.cy = skeletonY(floorSkeleton, pad.cx);
            for (var k = def.i; k <= def.i + def.n; k++) s.floor[k] = pad.cy;
        } else {
            pad.orbit = true; pad.phase = def.arm;
        }
        return pad;
    }

    function placePads(s) {
        var st = s.cfg.station;
        s.pads.forEach(function (pad) {
            if (!pad.orbit) return;
            var th = s.t * st.spin + pad.phase, c = Math.cos(th), sn = Math.sin(th);
            pad.cx = st.x + c * st.d; pad.cy = st.y + sn * st.d;
            pad.vx = -sn * st.d * st.spin; pad.vy = c * st.d * st.spin;
            pad.ang = th + Math.PI / 2;          // the pad's normal points away from the hub
        });
    }

    function buildHazards(s, cfg) {
        s.turrets = (cfg.turrets || []).map(function (i, k) {
            return { x: i * SEG, y: s.floor[i], cool: TURRET.warmup + k * 0.5, warned: false, aim: -Math.PI / 2 };
        });
        s.debris = cfg.station ? cfg.station.debris : [];
        s.cans = (cfg.cans || []).map(function (c) { return { x: c[0], y: c[1], taken: false }; });
    }

    function buildSky(rnd) {
        var stars = [];
        for (var i = 0; i < 70; i++) stars.push({ x: rnd() * G.W, y: G.HUD + rnd() * 400, r: 0.6 + rnd() * 1.4, ph: rnd() * 6.3 });
        return { stars: stars, planet: { x: 560 + rnd() * 300, y: 90 + rnd() * 90, r: 26 + rnd() * 30 } };
    }

    function camTarget(s) { return G.clamp(s.ship.x - G.W / 2, 0, s.cfg.w - G.W); }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 733);
        var s = {
            cfg: cfg, t: 0, dead: false, windX: 0, dry: 0, step: 0, shells: [],
            touch: G.isTouch(), turnHeld: 0, turnDir: 0,
            floor: profile(cfg.floor, cfg, rnd),
            ship: { x: cfg.start[0], y: cfg.start[1], vx: cfg.start[2], vy: 0, ang: 0, fuel: cfg.fuel, landed: -1, off: 0, cargo: false, burning: false },
            msg: { text: G.isTouch() ? TOUCH_HINTS[level - 1] : cfg.hint, t: 5 },
            timers: { engine: 0, beep: 0, ping: 0, wind: 0 }
        };
        s.pads = cfg.pads.map(function (def) { return buildPad(s, def, cfg.floor); });
        placePads(s);
        buildHazards(s, cfg);
        s.sky = buildSky(rnd);
        s.camX = camTarget(s);
        return s;
    }

    // -------------------------------------------------------------- helpers

    function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

    function heightAt(line, x) {
        var i = G.clamp(Math.floor(x / SEG), 0, line.length - 2);
        return G.lerp(line[i], line[i + 1], x / SEG - i);
    }

    function windAt(s) {
        var w = s.cfg.wind;
        return w ? w[0] * Math.sin(s.t * 0.4) + w[1] * Math.sin(s.t * 1.7 + 1) : 0;
    }

    // A shard of debris d = [radius, angular speed, phase] circles the station.
    function debrisPos(s, d) {
        var st = s.cfg.station, a = d[2] + s.t * d[1];
        return { x: st.x + Math.cos(a) * d[0], y: st.y + Math.sin(a) * d[0] };
    }

    // The pad the pilot has to reach next (the last one once the level is won).
    function target(s) { return s.pads[Math.min(s.step, s.pads.length - 1)]; }

    // The ship as the pad sees it: offset along the deck, height above it,
    // closing speed, sideways slip and tilt against the pad's normal.
    function padFrame(ship, pad) {
        var nx = Math.sin(pad.ang), ny = -Math.cos(pad.ang);
        var dx = ship.x - pad.cx, dy = ship.y - pad.cy, rvx = ship.vx - pad.vx, rvy = ship.vy - pad.vy;
        return {
            along: -dx * ny + dy * nx, h: dx * nx + dy * ny,
            down: -(rvx * nx + rvy * ny), side: Math.abs(-rvx * ny + rvy * nx),
            tilt: Math.abs(angDiff(ship.ang, pad.ang))
        };
    }

    function say(s, text, seconds) { s.msg = { text: text, t: seconds || 3 }; }

    // Two-tone mission-control beeps.
    function radio(notes) {
        notes.forEach(function (f, i) { G.tone(f, 0.09, { type: 'sine', vol: 0.12, delay: i * 0.11 }); });
    }

    // ------------------------------------------------------------ collisions

    function hitsRock(s, x, y, r) {
        var line = s.floor;
        if (!line) return false;
        if (y > heightAt(line, x)) return true;                    // already inside the rock
        var i0 = Math.max(0, Math.floor((x - r) / SEG)), i1 = Math.min(line.length - 2, Math.floor((x + r) / SEG));
        for (var i = i0; i <= i1; i++) {
            var p = G.closestOnSeg(x, y, i * SEG, line[i], (i + 1) * SEG, line[i + 1]);
            if (G.dist(x, y, p.x, p.y) < r) return true;
        }
        return false;
    }

    // The hull ring and the arms are deadly; each arm stops short of its deck
    // so a ship standing on the pad does not touch it.
    function hitsStation(s) {
        var st = s.cfg.station, ship = s.ship;
        if (!st) return false;
        if (G.dist(ship.x, ship.y, st.x, st.y) < st.r + R - 1) return true;
        return s.pads.some(function (pad) {
            var th = s.t * st.spin + pad.phase, c = Math.cos(th), sn = Math.sin(th);
            var p = G.closestOnSeg(ship.x, ship.y, st.x + c * st.r, st.y + sn * st.r, st.x + c * (st.d - 9), st.y + sn * (st.d - 9));
            return G.dist(ship.x, ship.y, p.x, p.y) < R + 2;
        });
    }

    // Debris and the turret housings are solid.
    function hitsHazard(s) {
        var ship = s.ship;
        return s.debris.some(function (d) {
            var p = debrisPos(s, d);
            return G.dist(ship.x, ship.y, p.x, p.y) < R + 7;
        }) || s.turrets.some(function (tu) {
            return G.dist(ship.x, ship.y, tu.x, tu.y - 8) < R + 9;
        });
    }

    // '' = clear of the pad, 'land' = a good touchdown, 'crash' = too fast,
    // too tilted, off the edge or from underneath. A soft touch counts as
    // long as the capsule's centre is over the deck (EDGE px of grace): with
    // all three instruments in the clear, a foot over the rim must not be a
    // wreck. A ground pad's edges are left to the terrain test; a station
    // deck is solid all the way round.
    function padContact(ship, pad) {
        var f = padFrame(ship, pad), deck = pad.w / 2 - EDGE, reach = pad.ground ? deck : pad.w / 2 + R * 0.6;
        if (Math.abs(f.along) > reach || Math.abs(f.h) > R) return '';
        var soft = f.down < LIMIT.down && f.side < LIMIT.side && f.tilt < LIMIT.tilt;
        return soft && f.h > 0 && Math.abs(f.along) <= deck ? 'land' : 'crash';
    }

    function crash(s) {
        var ship = s.ship;
        if (s.dead) return;
        s.dead = true;
        G.burst(ship.x, ship.y, { n: 36, color: C.red, speed: 260, life: 0.9, gravity: 180 });
        G.burst(ship.x, ship.y, { n: 16, color: C.silver, speed: 180, life: 1.2, gravity: 180, size: 4 });
        G.sfx('bigboom');
        G.noise(0.5, { filter: 'bandpass', freq: 900, slide: 120, vol: 0.3 });
        G.shake(12, 0.5); G.flash(C.red, 0.2);
        G.die();
    }

    // -------------------------------------------------------------- landing

    // Pins the ship to its pad. With lift it is released a hair above the
    // deck and pushed off, so the touchdown test does not catch it again.
    function seat(s, lift) {
        var ship = s.ship, pad = s.pads[ship.landed], nx = Math.sin(pad.ang), ny = -Math.cos(pad.ang);
        var h = R + (lift ? 1.5 : 0), kick = lift ? 30 : 0;
        ship.x = pad.cx - ny * ship.off + nx * h; ship.y = pad.cy + nx * ship.off + ny * h;
        ship.vx = pad.vx + nx * kick; ship.vy = pad.vy + ny * kick;
        ship.ang = pad.ang;
    }

    // The next pad of the route has been reached: the last one wins, every
    // other one refills the tank (and a cargo pad loads its crate), which is
    // what lets a level be several tanks long. The canisters are restocked
    // too: the way back out often passes the ones emptied on the way in, and
    // a loaded capsule on the heavy world cannot cross that stretch without.
    function reachPad(s, pad) {
        var ship = s.ship, cargo = pad.kind === 'cargo';
        s.step++;
        if (s.step >= s.pads.length) {
            radio([1320, 1760, 2093, 2637]);
            G.win(200 + Math.round(ship.fuel) * 5 + G.lives * 100);
            return;
        }
        ship.fuel = TANK;
        s.cans.forEach(function (can) { can.taken = false; });
        if (cargo) ship.cargo = true;
        G.sfx('power'); G.addScore(200);
        G.popup(ship.x, ship.y - 26, (cargo ? 'CARGO' : 'BEACON') + ' +200', C.teal);
        say(s, cargo ? 'CARGO ABOARD, TANK FILLED — DELIVER IT' : 'BEACON LIT, TANK FILLED — ON TO THE NEXT PAD', 4);
    }

    function touchDown(s, i) {
        var ship = s.ship, pad = s.pads[i], nx = Math.sin(pad.ang), ny = -Math.cos(pad.ang);
        // The deck clamps draw the capsule in until both feet stand on it.
        ship.off = G.clamp(padFrame(ship, pad).along, FEET - pad.w / 2, pad.w / 2 - FEET);
        ship.landed = i; ship.burning = false;
        seat(s, false);
        G.noise(0.12, { freq: 300, vol: 0.3 });
        // Dust sprays away from the deck, whichever way the pad faces.
        G.burst(ship.x - nx * R, ship.y - ny * R, { n: 10, color: C.silver, speed: 90, life: 0.5, angle: Math.atan2(ny, nx), spread: Math.PI });
        radio([1320, 1760]);
        if (i === s.step) reachPad(s, pad);
        else if (i > s.step) {
            G.tone(140, 0.3, { type: 'square', vol: 0.12 });
            say(s, 'WRONG PAD — FOLLOW THE MARKER');
        }
    }

    // While landed the ship rides its pad; thrust lifts it off again.
    function ride(s) {
        var ship = s.ship, lift = (G.key.up || G.key.a) && ship.fuel > 0;
        seat(s, lift);
        if (!lift) return;
        ship.landed = -1;
        G.tone(180, 0.2, { type: 'sawtooth', slide: 420, vol: 0.1 });
    }

    // A dry tank normally ends on the rocks. Two cases would never end,
    // though: sitting on a pad that is not the next one, and coasting round
    // the station between its arms and the debris. Both cost a life after a
    // warning; everywhere else gravity settles it.
    function checkDry(s, dt) {
        var ship = s.ship, landed = ship.landed >= 0;
        if (ship.fuel > 0 || !(landed || s.cfg.station)) { s.dry = 0; return; }
        if (s.dry === 0) say(s, landed ? 'STRANDED — TANK DRY' : 'ADRIFT — TANK DRY', DRY.adrift);
        s.dry += dt;
        if (s.dry < (landed ? DRY.landed : DRY.adrift)) return;
        G.tone(440, 0.7, { type: 'sawtooth', slide: 55, vol: 0.16 });
        G.noise(0.5, { filter: 'bandpass', freq: 1200, slide: 200, vol: 0.12 });
        G.popup(ship.x, ship.y - 26, 'MISSION LOST', C.red);
        G.flash(C.red, 0.25);
        G.die();
    }

    // --------------------------------------------------------------- flight

    function steer(s, dt) {
        var ship = s.ship;
        var dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        // Short thumb presses allow a small correction; holding still gives
        // the full turn rate for travelling and matching the station's spin.
        s.turnHeld = dir && dir === s.turnDir ? s.turnHeld + dt : 0;
        s.turnDir = dir;
        var rate = s.touch ? TURN * G.lerp(0.5, 1, Math.min(1, s.turnHeld / 0.25)) : TURN;
        ship.ang += dir * rate * dt;
        if (G.hit.left || G.hit.right) G.noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.06 });   // RCS puff
        ship.burning = (G.key.up || G.key.a) && ship.fuel > 0;
    }

    function burn(s, dt) {
        var ship = s.ship;
        ship.fuel = Math.max(0, ship.fuel - BURN * dt);
        if (ship.fuel > 0) return;
        say(s, 'TANK DRY');
        G.tone(520, 0.5, { type: 'sawtooth', slide: 90, vol: 0.14 });
    }

    // The top limit sits a little below the HUD so the nose never pokes into it.
    function keepInBounds(s) {
        var ship = s.ship, w = s.cfg.w, top = G.HUD + R + 4;
        if (ship.x < R) { ship.x = R; ship.vx = Math.max(0, ship.vx); }
        if (ship.x > w - R) { ship.x = w - R; ship.vx = Math.min(0, ship.vx); }
        if (ship.y < top) { ship.y = top; ship.vy = Math.max(0, ship.vy); }
        if (ship.y > G.H - R) { ship.y = G.H - R; ship.vy = Math.min(0, ship.vy); }
    }

    // Gravity pulls down, or towards the hub on the station level; wind is a
    // sideways acceleration; the engine pushes along the ship's nose.
    function fly(s, dt) {
        var ship = s.ship, st = s.cfg.station, ax = windAt(s), ay = s.cfg.g;
        if (st) {
            var d = Math.max(1, G.dist(ship.x, ship.y, st.x, st.y));
            ax += (st.x - ship.x) / d * st.g; ay += (st.y - ship.y) / d * st.g;
        }
        if (ship.burning) {
            var push = THRUST * (ship.cargo ? HAUL : 1);
            ax += Math.sin(ship.ang) * push; ay -= Math.cos(ship.ang) * push;
            burn(s, dt);
        }
        ship.vx += ax * dt; ship.vy += ay * dt;
        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        keepInBounds(s);
    }

    function checkContacts(s) {
        var ship = s.ship;
        for (var i = 0; i < s.pads.length; i++) {
            var hit = padContact(ship, s.pads[i]);
            if (hit === 'land') { touchDown(s, i); return; }
            if (hit === 'crash') { crash(s); return; }
        }
        if (hitsRock(s, ship.x, ship.y, R - 1) || hitsStation(s)) crash(s);
    }

    function collectCans(s) {
        var ship = s.ship;
        s.cans.forEach(function (can) {
            if (can.taken || G.dist(ship.x, ship.y, can.x, can.y) > R + 14) return;
            can.taken = true;
            ship.fuel = Math.min(TANK, ship.fuel + CAN_FUEL);
            G.addScore(50);
            G.sfx('coin'); G.tone(330, 0.25, { type: 'triangle', slide: 660, vol: 0.12 });
            G.popup(can.x, can.y - 14, 'FUEL +' + CAN_FUEL, C.teal);
        });
    }

    // -------------------------------------------------------------- hazards

    // A turret tracks the ship, whines half a second before it fires and
    // holds its fire while the ship is out of range or right on top of it.
    // It leads its target by part of the shell's flight time: a full lead
    // would be unfair, none would never hit a moving ship — so a slow or
    // hovering ship is the one that gets hit.
    function updateTurrets(s, dt) {
        var ship = s.ship;
        s.turrets.forEach(function (tu) {
            var my = tu.y - 14, d = G.dist(tu.x, my, ship.x, ship.y), lead = d / TURRET.shell * TURRET.lead;
            tu.aim = Math.atan2(ship.y + ship.vy * lead - my, ship.x + ship.vx * lead - tu.x);
            if (d > TURRET.range || d < TURRET.near) { tu.cool = Math.max(tu.cool, 0.8); tu.warned = false; return; }
            tu.cool -= dt;
            if (tu.cool < 0.5 && !tu.warned) { tu.warned = true; G.tone(420, 0.4, { type: 'sawtooth', slide: 900, vol: 0.07 }); }
            if (tu.cool > 0) return;
            tu.cool = TURRET.period; tu.warned = false;
            s.shells.push({ x: tu.x + Math.cos(tu.aim) * 16, y: my + Math.sin(tu.aim) * 16, vx: Math.cos(tu.aim) * TURRET.shell, vy: Math.sin(tu.aim) * TURRET.shell, life: TURRET.range / TURRET.shell });
            G.sfx('shoot'); G.noise(0.1, { freq: 700, vol: 0.15 });
        });
    }

    function updateShells(s, dt) {
        var ship = s.ship;
        s.shells = s.shells.filter(function (sh) {
            sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
            if (G.dist(sh.x, sh.y, ship.x, ship.y) < R + 3) { crash(s); return false; }
            if (hitsRock(s, sh.x, sh.y, 2)) {
                G.burst(sh.x, sh.y, { n: 5, color: C.red, speed: 70, life: 0.3 });
                return false;
            }
            return sh.life > 0;
        });
    }

    // ------------------------------------------------------------- ambience

    function engineSound(s) {
        var ship = s.ship, back = Math.atan2(Math.cos(ship.ang), -Math.sin(ship.ang));
        s.timers.engine = 0.09;
        G.noise(0.14, { freq: 260, vol: 0.14 });
        G.tone(46 + Math.random() * 8, 0.12, { type: 'sawtooth', vol: 0.06 });
        G.burst(ship.x - Math.sin(ship.ang) * R, ship.y + Math.cos(ship.ang) * R, { n: 2, color: C.red, speed: 150, life: 0.35, angle: back, spread: 0.5 });
    }

    // Continuous sounds are gated by timers: engine rumble, the low-fuel
    // warning, the radar altimeter that pings faster near the pad, and gusts.
    function ambience(s, dt) {
        var ship = s.ship, tm = s.timers, wind = Math.abs(windAt(s)), f = padFrame(ship, target(s));
        for (var k in tm) if (tm[k] > 0) tm[k] -= dt;
        if (s.msg.t > 0) s.msg.t -= dt;
        s.windX += windAt(s) * dt * 6;
        if (ship.burning && tm.engine <= 0) engineSound(s);
        if (ship.fuel > 0 && ship.fuel < 20 && tm.beep <= 0) {
            tm.beep = 0.7;
            G.tone(1046, 0.07, { vol: 0.07 });
        }
        if (ship.landed < 0 && tm.ping <= 0 && f.h > 0 && f.h < 170 && Math.abs(f.along) < target(s).w / 2 + 40) {
            tm.ping = G.clamp(f.h / 170, 0.12, 0.8);
            G.tone(1500, 0.03, { type: 'sine', vol: 0.09 });
        }
        if (wind > 10 && tm.wind <= 0) {
            tm.wind = 1.4;
            G.noise(1.2, { filter: 'bandpass', freq: 400, slide: 900, vol: 0.003 * wind, attack: 0.4 });
        }
    }

    function update(s, dt) {
        var ship = s.ship;
        s.t += dt;
        placePads(s);
        if (ship.landed >= 0) {
            // Rotation is parked on a pad; takeoff starts a fresh correction.
            s.turnHeld = 0; s.turnDir = 0;
            ride(s);
        }
        else { steer(s, dt); fly(s, dt); }
        collectCans(s);
        updateTurrets(s, dt);
        updateShells(s, dt);
        if (ship.landed < 0) checkContacts(s);
        if (hitsHazard(s)) crash(s);
        checkDry(s, dt);
        s.camX += (camTarget(s) - s.camX) * Math.min(1, dt * 6);
        ambience(s, dt);
    }

    // -------------------------------------------------------------- drawing

    function drawSky(ctx, s) {
        var grad = ctx.createLinearGradient(0, 0, 0, G.H), p = s.sky.planet, px = p.x - s.camX * 0.08;
        grad.addColorStop(0, C.bg); grad.addColorStop(1, C.sky);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, G.W, G.H);
        s.sky.stars.forEach(function (st, k) {
            if (s.touch && k % 2) return;
            var x = (((st.x - s.camX * 0.2) % G.W) + G.W) % G.W;
            ctx.globalAlpha = 0.45 + 0.4 * Math.sin(s.t * 2 + st.ph);
            ctx.fillStyle = C.silver; ctx.fillRect(x, st.y, st.r, st.r);
        });
        ctx.globalAlpha = 1;
        // A ringed planet far behind everything, in the space-age poster style.
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = C.dim;
        ctx.beginPath(); ctx.arc(px, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(px, p.y, p.r * 1.8, p.r * 0.35, -0.35, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Distant ridges for the open-sky levels; they scroll at half speed.
    function drawFarHills(ctx, s) {
        if (!s.floor) return;
        ctx.fillStyle = C.far;
        ctx.beginPath(); ctx.moveTo(0, G.H);
        for (var x = 0; x <= G.W; x += SEG) {
            var wx = x + s.camX * 0.5;
            ctx.lineTo(x, 380 + 45 * Math.sin(wx * 0.011 + s.cfg.g) + 22 * Math.sin(wx * 0.031));
        }
        ctx.lineTo(G.W, G.H); ctx.fill();
    }

    function trace(ctx, line, i0, i1, dy) {
        ctx.beginPath();
        for (var i = i0; i <= i1; i++) ctx.lineTo(i * SEG, line[i] + dy);
    }

    function drawRock(ctx, s) {
        var line = s.floor;
        if (!line) return;
        var i0 = Math.max(0, Math.floor(s.camX / SEG)), i1 = Math.min(line.length - 1, Math.ceil((s.camX + G.W) / SEG));
        trace(ctx, line, i0, i1, 0);
        ctx.lineTo(i1 * SEG, G.H); ctx.lineTo(i0 * SEG, G.H); ctx.closePath();
        ctx.fillStyle = C.rock; ctx.fill();
        trace(ctx, line, i0, i1, 9);                      // a dim inner contour gives the rock depth
        ctx.strokeStyle = C.dim; ctx.lineWidth = 2; ctx.stroke();
        trace(ctx, line, i0, i1, 0);
        ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
        ctx.shadowColor = C.teal; ctx.shadowBlur = s.touch ? 0 : 8; ctx.stroke();
        ctx.shadowBlur = 0;
    }

    function drawStation(ctx, s) {
        var st = s.cfg.station;
        if (!st) return;
        ctx.save();
        ctx.translate(st.x, st.y); ctx.rotate(s.t * st.spin);
        s.pads.forEach(function (pad) {                                                // docking arms
            ctx.save(); ctx.rotate(pad.phase);
            ctx.fillStyle = C.dim; ctx.fillRect(st.r - 2, -3, st.d - st.r - 4, 6);
            ctx.restore();
        });
        ctx.strokeStyle = C.silver; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, st.r - 4, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 3;
        for (var k = 0; k < 4; k++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(st.r - 8, 0); ctx.stroke();
            ctx.fillStyle = Math.sin(s.t * 3 + k) > 0 ? C.teal : C.dim;
            ctx.fillRect(st.r * 0.68, st.r * 0.68, 4, 4);                              // ring windows
        }
        ctx.fillStyle = C.dim; ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    function drawCrate(ctx, y) {
        ctx.fillStyle = C.bg; ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
        ctx.fillRect(-8, y - 8, 16, 16); ctx.strokeRect(-8, y - 8, 16, 16);
        ctx.beginPath(); ctx.moveTo(-8, y - 8); ctx.lineTo(8, y + 8); ctx.moveTo(8, y - 8); ctx.lineTo(-8, y + 8); ctx.stroke();
    }

    // Drawn in the pad's own frame (x along the deck, -y along its normal),
    // so ground, ferry and station pads share the code. Lamps: blinking teal
    // on the pad to reach next, blinking red on later ones, dark once done.
    function drawPad(ctx, s, pad, i) {
        var next = i === s.step, blink = Math.sin(s.t * 6) > 0, bob = 4 * Math.sin(s.t * 4), half = pad.w / 2;
        ctx.save();
        ctx.translate(pad.cx, pad.cy); ctx.rotate(pad.ang);
        ctx.fillStyle = C.silver; ctx.fillRect(-half, 0, pad.w, 5);
        ctx.fillStyle = C.dim; ctx.fillRect(-half + 6, 5, pad.w - 12, 4);
        ctx.fillStyle = blink && i >= s.step ? (next ? C.teal : C.red) : C.dim;
        ctx.fillRect(-half, -4, 5, 4); ctx.fillRect(half - 5, -4, 5, 4);
        if (pad.kind === 'cargo' && i >= s.step) drawCrate(ctx, -34 + bob);
        else if (next) {                                   // a bobbing chevron marks the pad to reach
            ctx.fillStyle = C.teal;
            ctx.beginPath(); ctx.moveTo(-9, -52 + bob); ctx.lineTo(9, -52 + bob); ctx.lineTo(0, -40 + bob); ctx.fill();
        }
        ctx.restore();
    }

    function drawShip(ctx, s) {
        var ship = s.ship;
        ctx.save();
        ctx.translate(ship.x, ship.y); ctx.rotate(ship.ang);
        if (ship.burning) {
            ctx.fillStyle = C.red;
            ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, 6); ctx.lineTo(0, 17 + Math.random() * 12); ctx.fill();
            ctx.fillStyle = C.silver;
            ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(2, 6); ctx.lineTo(0, 11 + Math.random() * 6); ctx.fill();
        }
        ctx.strokeStyle = C.silver; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, 4); ctx.lineTo(-11, 12); ctx.moveTo(6, 4); ctx.lineTo(11, 12);          // legs
        ctx.moveTo(-14, 12); ctx.lineTo(-8, 12); ctx.moveTo(8, 12); ctx.lineTo(14, 12);        // feet
        ctx.stroke();
        ctx.fillStyle = C.silver;
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.quadraticCurveTo(9, -8, 7, 5); ctx.lineTo(-7, 5); ctx.quadraticCurveTo(-9, -8, 0, -15); ctx.fill();
        ctx.fillStyle = C.red; ctx.fillRect(-7, 0, 14, 2);
        ctx.fillStyle = C.teal;
        ctx.beginPath(); ctx.arc(0, -5, 3, 0, Math.PI * 2); ctx.fill();
        if (ship.cargo) { ctx.fillRect(-4, 6, 8, 6); ctx.strokeRect(-4, 6, 8, 6); }             // crate slung between the legs
        ctx.restore();
    }

    // The station's debris is a tumbling shard of torn hull, so it does not
    // read as a target marker.
    function drawDebris(ctx, s, d) {
        var p = debrisPos(s, d);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(s.t * 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, -3); ctx.lineTo(-3, -10); ctx.lineTo(9, -7); ctx.lineTo(5, 0); ctx.lineTo(11, 7); ctx.lineTo(-2, 10); ctx.lineTo(-8, 5); ctx.closePath();
        ctx.fillStyle = C.dim; ctx.strokeStyle = C.silver; ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.red; ctx.fillRect(-3, -2, 5, 3);                                      // a glowing torn edge
        ctx.restore();
    }

    function drawTurret(ctx, tu) {
        var hot = tu.cool < 0.5;
        ctx.fillStyle = C.dim;
        ctx.beginPath(); ctx.moveTo(tu.x - 12, tu.y + 2); ctx.lineTo(tu.x - 7, tu.y - 14); ctx.lineTo(tu.x + 7, tu.y - 14); ctx.lineTo(tu.x + 12, tu.y + 2); ctx.fill();
        ctx.strokeStyle = hot ? C.red : C.silver; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(tu.x, tu.y - 14); ctx.lineTo(tu.x + Math.cos(tu.aim) * 16, tu.y - 14 + Math.sin(tu.aim) * 16); ctx.stroke();
        ctx.fillStyle = hot ? C.red : C.silver;
        ctx.beginPath(); ctx.arc(tu.x, tu.y - 14, 5, 0, Math.PI * 2); ctx.fill();
    }

    function drawThings(ctx, s) {
        s.cans.forEach(function (can, k) {
            if (can.taken) return;
            var y = can.y + 3 * Math.sin(s.t * 3 + k);
            ctx.fillStyle = C.teal; ctx.fillRect(can.x - 7, y - 9, 14, 18);
            ctx.fillStyle = C.silver; ctx.fillRect(can.x - 3, y - 12, 6, 3);
            G.text('F', can.x, y + 5, { size: 12, bold: true, color: C.bg, align: 'center' });
        });
        s.turrets.forEach(function (tu) { drawTurret(ctx, tu); });
        s.debris.forEach(function (d) { drawDebris(ctx, s, d); });
        ctx.fillStyle = C.red; ctx.shadowColor = C.red; ctx.shadowBlur = s.touch ? 0 : 10;
        s.shells.forEach(function (sh) { ctx.beginPath(); ctx.arc(sh.x, sh.y, s.touch ? 4 : 3, 0, Math.PI * 2); ctx.fill(); });
        ctx.shadowBlur = 0;
    }

    // Streaks drift with the wind so its direction and strength can be read.
    function drawWind(ctx, s) {
        var wind = windAt(s), span = G.W + 80;
        if (!s.cfg.wind) return;
        ctx.strokeStyle = C.silver; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
        ctx.beginPath();
        for (var k = 0; k < 16; k++) {
            var x = (((k * 137 + s.windX) % span) + span) % span - 40, y = 50 + (k * 89) % 400;
            ctx.moveTo(x, y); ctx.lineTo(x - wind * 2, y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
    }

    // Phone instruments form a transparent row below the engine HUD. Fuel
    // already appears in that HUD; keep the three touchdown limits visible.
    function drawTouchPanel(ctx, s) {
        ctx.save();
        if (s.ship.y < 100) ctx.globalAlpha = 0.2;
        var f = padFrame(s.ship, target(s));
        var rows = [['DESC', f.down / LIMIT.down], ['SIDE', f.side / LIMIT.side], ['TILT', f.tilt / LIMIT.tilt]];
        rows.forEach(function (row, k) {
            var x = 24 + k * 310, v = s.ship.landed >= 0 ? 0 : Math.max(0, row[1]);
            G.text(row[0], x, 63, { size: 26, bold: true, color: C.silver });
            G.text(v >= 1 ? (k === 2 ? 'OFF' : 'FAST') : 'OK', x + 210, 63, { size: 26, color: v >= 1 ? C.red : C.teal });
            ctx.fillStyle = C.dim; ctx.fillRect(x, 72, 270, 5);
            ctx.fillStyle = v >= 1 ? C.red : C.teal; ctx.fillRect(x, 72, Math.min(270, v * 135), 5);
            ctx.fillStyle = C.silver; ctx.fillRect(x + 134, 69, 2, 11);
        });
        ctx.restore();
    }

    // The instrument panel: closing speed, side slip and tilt against the
    // target pad, each with its limit mark at half scale, and the tank (full
    // scale, no mark). Red means that touching down now would wreck the
    // ship, or that the tank is nearly dry. It fades while the ship flies
    // behind it, so it never hides the capsule.
    function drawPanel(ctx, s) {
        if (s.touch) { drawTouchPanel(ctx, s); return; }
        var ship = s.ship, f = padFrame(ship, target(s)), landed = ship.landed >= 0, P = PANEL;
        var under = ship.x - s.camX < P.x + P.w + 24 && ship.y < P.y + P.h + 24;
        var rows = [['DESC', f.down / LIMIT.down], ['SIDE', f.side / LIMIT.side], ['TILT', f.tilt / LIMIT.tilt], ['FUEL', ship.fuel / TANK * 2]];
        ctx.globalAlpha = under ? 0.22 : 1;
        ctx.fillStyle = 'rgba(2,6,8,0.72)'; ctx.fillRect(P.x, P.y, P.w, P.h);
        ctx.strokeStyle = C.dim; ctx.lineWidth = 1; ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w, P.h);
        rows.forEach(function (row, k) {
            var y = P.y + 7 + k * P.row, fuel = k === 3, v = landed && !fuel ? 0 : Math.max(0, row[1]);
            var bad = fuel ? ship.fuel < 20 : v >= 1;
            G.text(row[0], P.x + 6, y + 13, { size: 18, color: C.silver });
            ctx.fillStyle = C.dim; ctx.fillRect(P.x + P.bar, y, P.len, 11);
            ctx.fillStyle = bad ? C.red : C.teal; ctx.fillRect(P.x + P.bar, y, Math.min(P.len, v * P.len / 2), 11);
            if (!fuel) { ctx.fillStyle = C.silver; ctx.fillRect(P.x + P.bar + P.len / 2 - 1, y - 2, 2, 15); }   // the limit
        });
        ctx.globalAlpha = 1;
    }

    // The mission line at the top, and an arrow at the screen edge while the
    // target pad is scrolled out of sight.
    function drawGuide(ctx, s) {
        var pad = target(s), sx = pad.cx - s.camX, off = sx < 0 ? -1 : (sx > G.W ? 1 : 0);
        if (s.msg.t > 0) {
            ctx.globalAlpha = Math.min(1, s.msg.t);
            G.text(s.msg.text, G.W / 2, 156, { size: s.touch ? 28 : 20, color: C.teal, align: 'center', glow: s.touch ? undefined : C.teal, max: G.W - 60 });
            ctx.globalAlpha = 1;
        }
        if (!off || Math.sin(s.t * 6) < -0.4) return;
        var x = off < 0 ? 16 : G.W - 16, y = G.clamp(pad.cy - 40, 190, G.H - 40);
        ctx.fillStyle = C.teal;
        ctx.beginPath(); ctx.moveTo(x + off * 10, y); ctx.lineTo(x - off * 6, y - 10); ctx.lineTo(x - off * 6, y + 10); ctx.fill();
        G.text(Math.round(Math.abs(pad.cx - s.ship.x) / 10) + 'm', x - off * 14, y + 7, { size: 20, color: C.teal, align: off < 0 ? 'left' : 'right' });
    }

    function draw(s, ctx) {
        drawSky(ctx, s);
        drawFarHills(ctx, s);
        G.cam.x = s.camX;            // engine particles and popups scroll with the world
        ctx.save();
        ctx.translate(-s.camX, 0);
        drawRock(ctx, s);
        drawStation(ctx, s);
        s.pads.forEach(function (pad, i) { drawPad(ctx, s, pad, i); });
        drawThings(ctx, s);
        if (!s.dead) drawShip(ctx, s);
        ctx.restore();
        drawWind(ctx, s);
        drawPanel(ctx, s);
        drawGuide(ctx, s);
    }

    // ------------------------------------------------------------- ending

    // The docking ceremony: the starbase turns on the left with the capsule
    // riding its arm, beacon rings pulse out from the hub, and on the right
    // satellites circle a ringed planet trailing dots. All of it follows from
    // e.t, through the game's own drawStation and drawShip on stand-in states.
    var HALO = { x: 150, y: 300, r: 46, d: 100, spin: 0.32 };
    var MOONS = [[96, 0.9, 0], [124, -0.6, 2], [152, 0.45, 4], [70, 1.3, 1]];

    function drawCeremony(ctx, t) {
        var th = t * HALO.spin, c = Math.cos(th), sn = Math.sin(th), d = HALO.d + R;
        for (var k = 0; k < 3; k++) {
            var age = (t + k * 0.8) % 2.4;
            ctx.globalAlpha = 1 - age / 2.4; ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(HALO.x, HALO.y, HALO.r + age * 70, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        drawStation(ctx, { cfg: { station: HALO }, t: t, pads: [{ phase: 0 }, { phase: Math.PI }] });
        drawShip(ctx, { ship: { x: HALO.x + c * d, y: HALO.y + sn * d, ang: th + Math.PI / 2, burning: false, cargo: true } });
    }

    function drawOrbits(ctx, t) {
        var px = 815, py = 300;
        ctx.fillStyle = C.dim;
        ctx.beginPath(); ctx.arc(px, py, 38, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(px, py, 64, 12, -0.35, 0, Math.PI * 2); ctx.stroke();
        MOONS.forEach(function (m) {
            for (var k = 0; k < 6; k++) {
                var a = m[2] + (t - k * 0.12) * m[1];
                ctx.globalAlpha = 1 - k / 6;
                ctx.fillStyle = k ? C.teal : C.silver;
                ctx.fillRect(px + Math.cos(a) * m[0] - 2, py + Math.sin(a) * m[0] * 0.45 - 2, k ? 3 : 5, k ? 3 : 5);
            }
        });
        ctx.globalAlpha = 1;
    }

    var ENDING = {
        title: 'DOCKED',
        text: 'Starbase Halo welcomes its crew home.',
        colors: [C.teal, C.silver, C.red, '#ffffff'],
        draw: function (e, ctx) { drawCeremony(ctx, e.t); drawOrbits(ctx, e.t); }
    };

    function hud(s) {
        var pads = s.pads.length, at = Math.min(s.step + 1, pads);
        return 'FUEL ' + Math.ceil(s.ship.fuel) + (pads > 1 ? '  PAD ' + at + '/' + pads : '') + (s.ship.cargo ? ' +CARGO' : '');
    }

    G.register('spaceage', {
        title: 'ORBITAL DOCK',
        blurb: 'Fly the capsule from pad to pad and touch down slowly and upright.',
        controls: [
            '← → rotate · ↑ / SPACE / THRUST fire the engine',
            'Land with DESC, SIDE and TILT all below their marks',
            'Follow the marker from pad to pad: each one refills the tank',
            'Canisters add fuel · cargo crates must be delivered to the last pad'
        ],
        levelNames: ['First Contact', 'Cargo Haul', 'Starbase Halo'],
        colors: { bg: C.bg, fg: C.silver, accent: C.teal, dim: '#5d8a9a' },
        // Four lives: a crash restarts the whole route, and the flak crossing
        // and the spinning station each take a try or two to learn.
        lives: 4,
        // A slow lydian tune: long sine notes over a sparse pulse, calm
        // enough to concentrate on a landing.
        music: {
            bpm: 84, root: 45, scale: 'lydian', prog: [0, 4, 1, 0, 5, 4, 1, 0],
            bass: 'x.......5.....x.',
            lead: [
                '4-----7---6-4---', '6-----8---6---4-', '5-----3---5-8---', '7-------4---2---',
                '9-----7---5-7---', '8-----b---8-6---', 'a-----8---5-3---', '4-----------....'
            ],
            arp: '0...1...2...1.3.',
            drums: { k: 'x.......x.......', h: '....x.......x.x.' },
            leadWave: 'sine', bassWave: 'triangle', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud, ending: ENDING,
        // Two thumbs: ← → turn the capsule, THRUST burns. ↑ is hidden on the
        // pad because a thumb sliding between ← and → would brush it and
        // waste fuel; ↓ and B do nothing in this game.
        touch: { a: 'THRUST', hide: ['up', 'down', 'b'] }
    });
})();
