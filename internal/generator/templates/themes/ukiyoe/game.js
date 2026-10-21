/*
 * Tokaido Crossing — the ukiyoe theme's game.
 *
 * A Frogger-style crossing printed like an Edo woodblock: hop the traveller
 * over the Tokaido road (ox carts, palanquins, samurai riders), rest on the
 * pine verge, then ride sampans and logs across the river to fill every inn
 * on the far bank. Hops are short ballistic arcs, a hop that starts on a
 * boat keeps the boat's drift, and the boats carry momentum: the current
 * surges and slackens under them. On the Great Wave the river swells, and a
 * boat in the trough of the roll is under water for a moment. At Fuji Pass
 * it is night, the lanes are lit only by lanterns, and a ronin guards the
 * far bank.
 */
(function () {
    'use strict';
    var G = window.SnoGame;

    // The board: thirteen rows of RH px from the start bank (0) to the inns
    // (12), with the sky strip and Mount Fuji above row 12. Lanes loop over
    // LOOP px so an object leaves one edge fully before it re-enters.
    var RH = 34, TOP = 12, MEDIAN = 6, BOTTOM = 536, HOP_X = 40, HOP_T = 0.16, GRAV = 2400;
    var M = 200, LOOP = 960 + M, BODY = 11, REACH = 62;
    var C = {
        paper: '#f3e9d2', paper2: '#e6d6b4', ink: '#2b2420', blue: '#1f3a5f', indigo: '#14243d',
        water: '#2f5d86', water2: '#24496d', foam: '#f7f1e1', red: '#c8402a', ver: '#e0553a',
        green: '#93a868', green2: '#6f8a4a', road: '#dcc79d', road2: '#c4aa7a', wood: '#8a5a35',
        wood2: '#5e3b22', gold: '#d9a441', dim: '#a89c84', sky: '#b9cad6', pink: '#f0b3bd', stone: '#b7a68a'
    };
    var WIDTH = { cart: 80, kago: 66, horse: 88, log: 160, boat: 128 };
    var RIVER = { log: true, boat: true };

    // r: row, k: kind, d: direction, v: speed (px/s), n: how many per lane,
    // w: width override. Later levels add riders and the swell; level 3
    // also brings the night and the ronin (see LEVEL_CFG).
    var ROAD1 = [
        { r: 1, k: 'cart', d: -1, v: 40, n: 3 }, { r: 2, k: 'kago', d: 1, v: 62, n: 3 },
        { r: 3, k: 'cart', d: -1, v: 50, n: 2 }, { r: 4, k: 'kago', d: 1, v: 76, n: 2 },
        { r: 5, k: 'cart', d: -1, v: 56, n: 3 }
    ];
    var RIVER1 = [
        { r: 7, k: 'log', d: 1, v: 42, n: 3 }, { r: 8, k: 'boat', d: -1, v: 54, n: 3 },
        { r: 9, k: 'log', d: 1, v: 60, n: 3, w: 180 }, { r: 10, k: 'boat', d: -1, v: 48, n: 3 },
        { r: 11, k: 'log', d: 1, v: 52, n: 3 }
    ];
    var ROAD2 = [
        { r: 1, k: 'cart', d: -1, v: 46, n: 3 }, { r: 2, k: 'kago', d: 1, v: 70, n: 3 },
        { r: 3, k: 'horse', d: -1, v: 150, n: 2 }, { r: 4, k: 'kago', d: 1, v: 82, n: 2 },
        { r: 5, k: 'cart', d: -1, v: 60, n: 3 }
    ];
    var RIVER2 = [
        { r: 7, k: 'boat', d: 1, v: 50, n: 4, w: 136 }, { r: 8, k: 'log', d: -1, v: 60, n: 4, w: 150 },
        { r: 9, k: 'boat', d: 1, v: 66, n: 4, w: 136 }, { r: 10, k: 'log', d: -1, v: 56, n: 4, w: 150 },
        { r: 11, k: 'boat', d: 1, v: 58, n: 4, w: 140 }
    ];
    var ROAD3 = [
        { r: 1, k: 'cart', d: -1, v: 50, n: 3 }, { r: 2, k: 'horse', d: 1, v: 150, n: 2 },
        { r: 3, k: 'kago', d: -1, v: 78, n: 3 }, { r: 4, k: 'horse', d: 1, v: 140, n: 2 },
        { r: 5, k: 'cart', d: -1, v: 62, n: 3 }
    ];
    var RIVER3 = [
        { r: 7, k: 'log', d: 1, v: 52, n: 4, w: 150 }, { r: 8, k: 'boat', d: -1, v: 62, n: 4, w: 136 },
        { r: 9, k: 'log', d: 1, v: 68, n: 4, w: 150 }, { r: 10, k: 'boat', d: -1, v: 58, n: 4, w: 136 },
        { r: 11, k: 'log', d: 1, v: 60, n: 4, w: 150 }
    ];
    var LEVEL_CFG = [
        { inns: 4, clock: 45, road: ROAD1, river: RIVER1, surge: 0.12, swell: 0 },
        { inns: 5, clock: 45, road: ROAD2, river: RIVER2, surge: 0.3, swell: 0.9 },
        { inns: 5, clock: 50, road: ROAD3, river: RIVER3, surge: 0.3, swell: 0.92 }
    ];
    // In scale (A Bb D E F): the plucked koto notes of the game's own chimes.
    var IN_SCALE = [220, 233.08, 293.66, 329.63, 349.23, 440, 466.16, 587.33, 659.25, 698.46];

    function rowTop(r) { return BOTTOM - (r + 1) * RH; }
    function rowMid(r) { return rowTop(r) + RH / 2; }
    function wrap(x) { return ((x + M) % LOOP + LOOP) % LOOP - M; }

    // Road lanes keep at least 90 px between vehicles so every lane has a
    // gap to slip through; river craft are spread more loosely.
    function makeLane(spec, level, cfg) {
        var rnd = G.rng(level * 131 + spec.r * 17), w = spec.w || WIDTH[spec.k];
        var gap = LOOP / spec.n, river = !!RIVER[spec.k], objs = [];
        for (var i = 0; i < spec.n; i++) {
            var slack = river ? (gap - w) * 0.45 : Math.max(0, gap - w - 90);
            objs.push({ x: wrap(i * gap + rnd() * slack), w: w, k: spec.k, seed: rnd() });
        }
        return {
            row: spec.r, river: river, base: spec.v * spec.d, v: spec.v * spec.d, objs: objs,
            ph: (spec.r % 2) * Math.PI + spec.r * 0.35, surge: river ? cfg.surge : 0,
            lamp: spec.k !== 'horse' && spec.k !== 'log'
        };
    }

    function newPlayer() { return { x: 480, row: 0, hop: null, z: 0, vz: 0, face: 'up' }; }

    function makePetals(level) {
        var rnd = G.rng(level * 7 + 3), out = [];
        for (var i = 0; i < 22; i++) out.push({ x: rnd() * 960, y: 30 + rnd() * 510, vx: 14 + rnd() * 20, vy: 12 + rnd() * 18, a: rnd() * 6 });
        return out;
    }

    function init(level) {
        var cfg = LEVEL_CFG[level - 1];
        var s = {
            level: level, touch: G.isTouch(), time: 0, lanes: [], inns: [], p: newPlayer(),
            clock: cfg.clock, clockMax: cfg.clock, maxRow: 0, dead: 0, fx: null, rep: 0, buf: null,
            petals: makePetals(level), night: level === 3, wash: 0, stamps: [],
            swell: { on: cfg.swell > 0, w: Math.PI * 2 / 4.6, k: Math.PI * 2 / 7600, deep: cfg.swell || 9 },
            ronin: level === 3 ? { x: 860, vx: 0, cycle: 0, walk: 5, restLen: 2.6, rest: 0, resting: false, patrol: 100, speed: 72 } : null
        };
        for (var r = 0; r <= TOP; r++) s.lanes.push(null);
        cfg.road.concat(cfg.river).forEach(function (spec) { s.lanes[spec.r] = makeLane(spec, level, cfg); });
        for (var i = 0; i < cfg.inns; i++) s.inns.push({ x: Math.round(960 * (i + 0.5) / cfg.inns), filled: false, t: 0 });
        return s;
    }

    // ------------------------------------------------------------------
    // The river and the road
    // ------------------------------------------------------------------

    // The swell: a rolling sine along each river lane, alternate lanes half
    // a roll apart. Below -deep a craft is under water.
    function swellAt(s, lane, x) {
        if (!s.swell.on) return 0;
        return Math.sin(s.time * s.swell.w + lane.ph - s.swell.k * x);
    }

    function sunk(s, lane, o) { return swellAt(s, lane, o.x + o.w / 2) < -s.swell.deep; }

    // The current surges and slackens; the craft follow it with inertia
    // rather than jumping to the new speed.
    function updateLanes(s, dt) {
        s.lanes.forEach(function (lane) {
            if (!lane) return;
            var target = lane.base * (1 + lane.surge * Math.sin(s.time * 0.7 + lane.row));
            lane.v += (target - lane.v) * Math.min(1, dt * 1.2);
            lane.objs.forEach(function (o) { o.x = wrap(o.x + lane.v * dt); });
        });
    }

    function supportAt(s, lane, x) {
        for (var i = 0; i < lane.objs.length; i++) {
            var o = lane.objs[i];
            if (x > o.x + 6 && x < o.x + o.w - 6) return o;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // The traveller
    // ------------------------------------------------------------------

    // A tap starts a hop at once; a held direction repeats after a pause,
    // and a press during a hop is buffered for the landing.
    function wantDir(s, dt) {
        var d = G.hit.up ? 'up' : G.hit.down ? 'down' : G.hit.left ? 'left' : G.hit.right ? 'right' : null;
        if (d) { s.rep = 0.24; return d; }
        var held = G.key.up ? 'up' : G.key.down ? 'down' : G.key.left ? 'left' : G.key.right ? 'right' : null;
        if (!held) return null;
        s.rep -= dt;
        if (s.rep > 0) return null;
        s.rep = 0.1;
        return held;
    }

    function bump(s) {
        G.sfx('click');
        G.tone(150, 0.08, { type: 'triangle', vol: 0.18 });
        s.p.face = 'up';
    }

    // The far bank is a stone wall except at the inns' doors: an up hop
    // from the top river lane must line up with an empty inn.
    function innUnder(s, x) {
        for (var i = 0; i < s.inns.length; i++) if (!s.inns[i].filled && Math.abs(s.inns[i].x - x) < 28) return s.inns[i];
        return null;
    }

    function startHop(s, dir) {
        var p = s.p, dx = dir === 'left' ? -HOP_X : dir === 'right' ? HOP_X : 0;
        var r1 = p.row + (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
        p.face = dir;
        if (r1 < 0 || p.x + dx < 16 || p.x + dx > 944) return;
        if (r1 === TOP) {
            var inn = innUnder(s, p.x);
            if (!inn) { bump(s); return; }
            dx = inn.x - p.x;
        }
        // A hop from a boat keeps the boat's drift: momentum, not a teleport.
        var lane = s.lanes[p.row], carry = lane && lane.river ? lane.v : 0;
        p.hop = { t: 0, x0: p.x, vx: dx / HOP_T + carry, r0: p.row, r1: r1 };
        p.vz = GRAV * HOP_T / 2; p.z = 0;
        G.tone(520 + p.row * 18, 0.06, { type: 'triangle', vol: 0.12, slide: 700 + p.row * 18 });
    }

    function movePlayer(s, dt) {
        var p = s.p, h = p.hop;
        if (h) {
            h.t += dt;
            p.x = h.x0 + h.vx * Math.min(h.t, HOP_T);
            p.z += p.vz * dt; p.vz -= GRAV * dt;
            if (h.t >= HOP_T) { p.hop = null; p.z = 0; p.row = h.r1; land(s); }
            return;
        }
        var lane = s.lanes[p.row];
        if (lane && lane.river) p.x += lane.v * dt;
    }

    function land(s) {
        var p = s.p, lane = s.lanes[p.row];
        if (p.row === TOP) { arrive(s); return; }
        if (p.row > s.maxRow) { G.addScore(10 * (p.row - s.maxRow)); s.maxRow = p.row; }
        if (lane && lane.river) {
            var o = supportAt(s, lane, p.x);
            // The craft dips under the traveller's weight.
            if (o) { o.dip = 1; G.tone(150, 0.07, { type: 'square', vol: 0.07 }); G.noise(0.05, { filter: 'lowpass', freq: 600, vol: 0.12 }); }
        } else {
            G.noise(0.04, { filter: 'bandpass', freq: 1400, vol: 0.06 });
        }
    }

    function curRow(p) {
        if (!p.hop) return p.row;
        return p.hop.t > HOP_T * 0.5 ? p.hop.r1 : p.hop.r0;
    }

    // ------------------------------------------------------------------
    // Arrival, danger and death
    // ------------------------------------------------------------------

    function koto(notes, gap, vol) {
        notes.forEach(function (n, i) { G.tone(IN_SCALE[n], 0.5, { type: 'triangle', vol: vol || 0.14, delay: i * gap }); });
    }

    function arrive(s) {
        var p = s.p, inn = innUnder(s, p.x) || s.inns[0], r = s.ronin;
        if (r && !r.resting && Math.abs(r.x - inn.x) < REACH) { kill(s, 'ronin'); return; }
        inn.filled = true; inn.t = 0;
        var bonus = 100 + Math.ceil(s.clock) * 5;
        G.addScore(bonus);
        G.popup(inn.x, rowTop(TOP) - 6, '+' + bonus, C.red);
        G.burst(inn.x, rowMid(TOP), { n: 16, color: C.pink, speed: 140, gravity: 120, life: 1.2 });
        G.tone(110, 0.25, { type: 'sine', slide: 55, vol: 0.4 });      // the seal stamp's thud
        koto([0, 2, 3, 5, 7], 0.08);
        if (s.inns.every(function (i) { return i.filled; })) { G.win(500 + G.lives * 150); return; }
        respawn(s);
    }

    function respawn(s) {
        s.p = newPlayer(); s.clock = s.clockMax; s.maxRow = 0; s.buf = null; s.dead = 0;
    }

    function deathSound(cause) {
        if (cause === 'splash' || cause === 'wave' || cause === 'swept') {
            G.sfx('splash');
            G.noise(0.6, { filter: 'lowpass', freq: 900, slide: 200, vol: 0.25 });
        } else if (cause === 'ronin') {
            G.noise(0.22, { filter: 'highpass', freq: 3000, vol: 0.3 });
            G.tone(1500, 0.25, { type: 'sawtooth', slide: 300, vol: 0.1 });
        } else if (cause === 'time') {
            koto([4, 3, 1, 0], 0.14, 0.12);
        } else {
            G.tone(90, 0.35, { type: 'sine', slide: 40, vol: 0.5 });   // a taiko thud
            G.sfx('hit');
        }
    }

    function kill(s, cause) {
        if (s.dead > 0) return;
        var p = s.p;
        s.dead = 1.1;
        s.fx = { cause: cause, x: p.x, y: rowMid(curRow(p)), t: 0 };
        deathSound(cause);
        G.burst(p.x, s.fx.y, { n: 14, color: cause === 'ronin' ? C.red : cause === 'cart' ? C.ink : C.foam, speed: 120, life: 0.7 });
        p.hop = null;
        G.loseLife();
    }

    // Vehicles hit only once a hop is past its middle; the river judges a
    // traveller only standing (a hop sails over the water).
    function checkHazards(s) {
        var p = s.p, row = curRow(p), lane = s.lanes[row];
        if (!lane) return;
        if (!lane.river) {
            for (var i = 0; i < lane.objs.length; i++) {
                var o = lane.objs[i];
                if (p.x + BODY > o.x + 5 && p.x - BODY < o.x + o.w - 5) { kill(s, 'cart'); return; }
            }
            return;
        }
        if (p.hop) return;
        var sup = supportAt(s, lane, p.x);
        if (!sup) kill(s, 'splash');
        else if (sunk(s, lane, sup)) kill(s, 'wave');
        else if (p.x < 6 || p.x > 954) kill(s, 'swept');
    }

    // The ronin walks the far bank. Once the traveller is on the river he
    // follows the traveller's line, so he has to be led away from an inn
    // (or caught at rest: every few seconds he sits down to meditate).
    function updateRonin(s, dt) {
        var r = s.ronin;
        if (!r) return;
        r.cycle += dt;
        var period = r.walk + r.restLen, c = r.cycle % period, resting = c >= r.walk;
        if (resting !== r.resting) {
            r.resting = resting;
            if (resting) G.tone(196, 0.6, { type: 'sine', slide: 147, vol: 0.12, attack: 0.08 });
            else G.tone(392, 0.5, { type: 'sine', slide: 466, vol: 0.14, attack: 0.1 });
        }
        r.rest = resting ? period - c : 0;
        var chase = s.p.row >= 7 && s.dead <= 0, target = chase ? s.p.x : r.patrol;
        if (!chase && Math.abs(r.patrol - r.x) < 20) r.patrol = r.patrol < 480 ? 860 : 100;
        var want = resting ? 0 : G.clamp((target - r.x) * 2.5, -r.speed, r.speed);
        r.vx += (want - r.vx) * Math.min(1, dt * 5);
        r.x = G.clamp(r.x + r.vx * dt, 40, 920);
    }

    function tickClock(s, dt) {
        var before = Math.ceil(s.clock);
        s.clock -= dt;
        if (s.clock < 8 && Math.ceil(s.clock) !== before) G.tone(880, 0.05, { type: 'sine', vol: 0.08 });
        if (s.clock <= 0) kill(s, 'time');
    }

    // Petals and flecks of foam drift on the wind all the time, so the
    // print is never still; the Great Wave's roll is heard as a wash.
    function updateAmbience(s, dt) {
        var wind = 1 + 0.6 * Math.sin(s.time * 0.4);
        s.petals.forEach(function (f) {
            f.x += f.vx * wind * dt; f.y += f.vy * dt; f.a += dt * 2;
            if (f.x > 970) f.x = -10;
            if (f.y > 545) { f.y = 30; f.x = G.rnd(0, 960); }
        });
        s.lanes.forEach(function (lane) {
            if (lane) lane.objs.forEach(function (o) { if (o.dip) o.dip = Math.max(0, o.dip - dt * 4); });
        });
        s.inns.forEach(function (i) { i.t += dt; });
        if (!s.swell.on) return;
        var cyc = Math.floor(s.time * s.swell.w / (Math.PI * 2));
        if (cyc !== s.wash) { s.wash = cyc; G.noise(1.2, { filter: 'lowpass', freq: 500, slide: 180, vol: 0.07 }); }
    }

    function update(s, dt) {
        s.time += dt;
        updateLanes(s, dt);
        updateAmbience(s, dt);
        updateRonin(s, dt);
        if (s.fx) s.fx.t += dt;
        if (s.dead > 0) {
            s.dead -= dt;
            if (s.dead <= 0) respawn(s);
            return;
        }
        tickClock(s, dt);
        if (s.dead > 0) return;
        var d = wantDir(s, dt);
        if (d && s.p.hop) s.buf = d;
        else if (d) startHop(s, d);
        if (!s.p.hop && s.buf) { var b = s.buf; s.buf = null; startHop(s, b); }
        movePlayer(s, dt);
        if (s.dead > 0 || s.p.row === TOP) return;
        checkHazards(s);
    }

    // ------------------------------------------------------------------
    // Drawing: the printed backdrop, baked once per level
    // ------------------------------------------------------------------

    function paintSky(g, s) {
        var top = rowTop(TOP), grad = g.createLinearGradient(0, 0, 0, top);
        grad.addColorStop(0, s.night ? '#0d1830' : C.blue);
        grad.addColorStop(0.45, s.night ? '#1d2c4c' : '#6f8fae');
        grad.addColorStop(1, s.night ? '#33426a' : C.paper);
        g.fillStyle = grad; g.fillRect(0, 0, 960, top);
        // The bokashi sun (or moon) and Mount Fuji with its carved snowcap.
        g.fillStyle = s.night ? C.paper : C.ver;
        g.beginPath(); g.arc(150, 62, 18, 0, Math.PI * 2); g.fill();
        g.fillStyle = s.night ? '#2c3b5e' : '#4a6f96';
        g.beginPath(); g.moveTo(560, top); g.lineTo(705, 34); g.lineTo(735, 34); g.lineTo(900, top); g.closePath(); g.fill();
        g.fillStyle = C.foam;
        g.beginPath(); g.moveTo(682, 52); g.lineTo(705, 34); g.lineTo(735, 34); g.lineTo(760, 54);
        g.lineTo(744, 48); g.lineTo(730, 58); g.lineTo(718, 47); g.lineTo(700, 57); g.closePath(); g.fill();
        g.strokeStyle = C.ink; g.lineWidth = 2;
        g.beginPath(); g.moveTo(560, top); g.lineTo(705, 34); g.lineTo(735, 34); g.lineTo(900, top); g.stroke();
        // Kasumi: the golden bands of mist that cut across every print.
        g.fillStyle = s.night ? 'rgba(120,130,170,0.5)' : 'rgba(217,164,65,0.55)';
        [[40, 74, 260], [420, 82, 300], [780, 70, 200]].forEach(function (b) {
            g.beginPath(); g.ellipse(b[0] + b[2] / 2, b[1], b[2] / 2, 6, 0, 0, Math.PI * 2); g.fill();
        });
    }

    // Seigaiha: the overlapping wave scallops of the river, carved in lines.
    function paintRiver(g) {
        var y0 = rowTop(11), y1 = rowTop(6);
        g.fillStyle = C.water; g.fillRect(0, y0, 960, y1 - y0);
        g.strokeStyle = 'rgba(160,195,225,0.35)'; g.lineWidth = 1.5;
        g.beginPath();
        for (var y = y0 + 14, row = 0; y < y1 + 10; y += 13, row++) {
            for (var x = (row % 2) * 16; x < 980; x += 32) {
                for (var k = 0; k < 3; k++) { g.moveTo(x + 14 - k * 5, y); g.arc(x, y, 14 - k * 5, 0, Math.PI, true); }
            }
        }
        g.stroke();
    }

    function paintGround(g, s) {
        g.fillStyle = C.stone; g.fillRect(0, rowTop(TOP), 960, RH);
        g.fillStyle = C.green; g.fillRect(0, rowTop(MEDIAN), 960, RH);
        g.fillStyle = C.road; g.fillRect(0, rowTop(5), 960, RH * 5);
        g.fillStyle = C.green2; g.fillRect(0, rowTop(0), 960, 540 - rowTop(0));
        // Rice paddies on the start bank, stone courses on the far bank.
        g.strokeStyle = 'rgba(43,36,32,0.35)'; g.lineWidth = 1.5; g.beginPath();
        for (var x = 0; x < 960; x += 48) { g.moveTo(x, rowTop(0)); g.lineTo(x + 10, 540); }
        for (x = 0; x < 960; x += 36) { g.moveTo(x + (x / 36 % 2) * 18, rowTop(TOP)); g.lineTo(x + (x / 36 % 2) * 18, rowTop(TOP) + RH); }
        g.moveTo(0, rowMid(TOP)); g.lineTo(960, rowMid(TOP));
        g.stroke();
        // Wheel ruts between the road lanes.
        g.strokeStyle = 'rgba(94,59,34,0.35)'; g.setLineDash([18, 14]); g.beginPath();
        for (var r = 1; r < 5; r++) { g.moveTo(0, rowTop(r)); g.lineTo(960, rowTop(r)); }
        g.stroke(); g.setLineDash([]);
        // Pines on the verge, flat and inked.
        for (x = 70; x < 960; x += 210) {
            g.fillStyle = C.green2; g.beginPath(); g.ellipse(x, rowMid(MEDIAN) - 4, 22, 8, 0, 0, Math.PI * 2); g.fill();
            g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
        }
    }

    // Carved outlines between the bands, then the paper grain over all.
    function paintGrain(g) {
        g.strokeStyle = C.ink; g.lineWidth = 2.5; g.beginPath();
        [TOP, 11, MEDIAN, 5, 0].forEach(function (r) { g.moveTo(0, rowTop(r) + RH); g.lineTo(960, rowTop(r) + RH); });
        g.moveTo(0, rowTop(TOP)); g.lineTo(960, rowTop(TOP));
        g.stroke();
        var rnd = G.rng(77);
        g.fillStyle = 'rgba(60,40,20,0.08)';
        for (var i = 0; i < 900; i++) g.fillRect(rnd() * 960, rnd() * 540, 1 + rnd() * 2, 1);
        g.fillStyle = 'rgba(255,250,235,0.1)';
        for (i = 0; i < 500; i++) g.fillRect(rnd() * 960, rnd() * 540, 2, 1);
    }

    function paintBackdrop(g, s) {
        g.fillStyle = C.paper; g.fillRect(0, 0, 960, 540);
        paintSky(g, s);
        paintRiver(g);
        paintGround(g, s);
        paintGrain(g);
    }

    // The baked picture is sized to the canvas's backing store, so it stays
    // sharp on a dense screen; it is redrawn only when that size changes.
    function drawBackdrop(s, ctx) {
        var w = ctx.canvas.width, h = ctx.canvas.height, bg = s.bg;
        if (!bg || bg.w !== w || bg.h !== h) {
            bg = s.bg = { w: w, h: h, pic: bg ? bg.pic : document.createElement('canvas') };
            bg.pic.width = w; bg.pic.height = h;
            var g = bg.pic.getContext('2d');
            g.setTransform(w / G.W, 0, 0, h / G.H, 0, 0);
            paintBackdrop(g, s);
        }
        ctx.drawImage(bg.pic, 0, 0, G.W, G.H);
    }

    // ------------------------------------------------------------------
    // Drawing: the moving world
    // ------------------------------------------------------------------

    // The river's surface: drifting current strokes, and on a swelling
    // river the rolling crest line with its foam claws.
    function drawWater(s, ctx) {
        ctx.strokeStyle = 'rgba(247,241,225,0.55)'; ctx.lineWidth = 2; ctx.beginPath();
        s.lanes.forEach(function (lane) {
            if (!lane || !lane.river) return;
            var y = rowMid(lane.row) + 9;
            for (var i = 0; i < 6; i++) {
                var x = wrap(i * 193 + lane.row * 57 + s.time * lane.v * 0.6);
                ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 4, x + 22, y);
            }
            if (!s.swell.on) return;
            for (var j = 0; j <= 24; j++) {
                var px = j * 40, py = rowMid(lane.row) - swellAt(s, lane, px) * 7 - 2;
                if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
        });
        ctx.stroke();
        if (s.swell.on) drawClaws(s, ctx);
    }

    // Foam claws curl off the crests, as on the Great Wave itself.
    function drawClaws(s, ctx) {
        ctx.fillStyle = C.foam; ctx.beginPath();
        s.lanes.forEach(function (lane) {
            if (!lane || !lane.river) return;
            for (var x = 20; x < 960; x += 80) {
                var h = swellAt(s, lane, x);
                if (h < 0.75) continue;
                var y = rowMid(lane.row) - h * 7 - 4, sz = (h - 0.75) * 24;
                ctx.moveTo(x + sz, y); ctx.arc(x, y, sz, 0, Math.PI * 1.3, true);
            }
        });
        ctx.fill();
    }

    function drawLog(ctx, o, y) {
        ctx.fillStyle = C.wood; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, y, o.w / 2, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.road;
        ctx.beginPath(); ctx.ellipse(o.x + o.w - 8, y, 5, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o.x + 20, y - 3); ctx.lineTo(o.x + o.w * 0.6, y - 3);
        ctx.moveTo(o.x + 34, y + 4); ctx.lineTo(o.x + o.w * 0.8, y + 4); ctx.stroke();
    }

    function drawBoat(ctx, o, y, d, lamp) {
        var x0 = o.x, x1 = o.x + o.w, bow = d > 0 ? x1 : x0, stern = d > 0 ? x0 : x1;
        ctx.fillStyle = C.wood2; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(stern, y - 6); ctx.lineTo(bow + d * 8, y - 10);
        ctx.lineTo(bow - d * 14, y + 9); ctx.lineTo(stern + d * 6, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.road; ctx.fillRect(Math.min(x0, x1) + 10, y - 6, o.w - 26, 4);
        // The boatman at the stern with his pole and straw hat.
        var bx = stern + d * 16;
        ctx.beginPath(); ctx.moveTo(bx - d * 6, y - 26); ctx.lineTo(bx + d * 10, y + 12); ctx.stroke();
        ctx.fillStyle = C.blue; ctx.fillRect(bx - 4, y - 18, 8, 12);
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(bx - 9, y - 18); ctx.lineTo(bx, y - 25); ctx.lineTo(bx + 9, y - 18); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (lamp) { ctx.fillStyle = C.ver; ctx.fillRect(bow - d * 22 - 4, y - 20, 8, 10); }
    }

    function drawCraft(s, ctx, lane) {
        var d = lane.v >= 0 ? 1 : -1;
        lane.objs.forEach(function (o) {
            var h = swellAt(s, lane, o.x + o.w / 2), y = rowMid(lane.row) - h * 7 + (o.dip || 0) * 3;
            var under = s.swell.on ? G.clamp((-h - (s.swell.deep - 0.25)) / 0.25, 0, 1) : 0;
            ctx.globalAlpha = 1 - under * 0.7;
            if (o.k === 'log') drawLog(ctx, o, y); else drawBoat(ctx, o, y, d, s.night);
            ctx.globalAlpha = 1;
            if (under > 0) {
                // Water washing over a craft in the trough: unsafe while it shows.
                ctx.fillStyle = 'rgba(36,73,109,' + (0.35 + under * 0.5) + ')';
                ctx.fillRect(o.x, y - 6, o.w, 18);
                ctx.strokeStyle = C.foam; ctx.lineWidth = 2; ctx.beginPath();
                ctx.moveTo(o.x, y - 6); ctx.quadraticCurveTo(o.x + o.w / 2, y - 14 * under - 6, o.x + o.w, y - 6); ctx.stroke();
            }
        });
    }

    function drawCart(ctx, o, y, d, t) {
        var back = d > 0 ? o.x : o.x + o.w, ox = back + d * 60;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        // The roofed carriage, its great wheel and the ox that draws it.
        ctx.fillStyle = C.wood2; ctx.fillRect(Math.min(back, back + d * 42), y - 14, 42, 16); ctx.strokeRect(Math.min(back, back + d * 42), y - 14, 42, 16);
        ctx.fillStyle = C.ink; ctx.fillRect(Math.min(back, back + d * 46) - 2, y - 19, 50, 6);
        ctx.fillStyle = C.road; ctx.beginPath(); ctx.arc(back + d * 21, y + 4, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        var a = t * 3 * d;
        ctx.beginPath(); ctx.moveTo(back + d * 21 + Math.cos(a) * 9, y + 4 + Math.sin(a) * 9); ctx.lineTo(back + d * 21 - Math.cos(a) * 9, y + 4 - Math.sin(a) * 9); ctx.stroke();
        ctx.fillStyle = '#3b2f2a'; ctx.beginPath(); ctx.ellipse(ox, y - 2, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ox + d * 15, y - 6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.paper; ctx.beginPath(); ctx.moveTo(ox + d * 14, y - 10); ctx.lineTo(ox + d * 20, y - 15); ctx.stroke();
    }

    function drawBearer(ctx, x, y, t, k) {
        var step = Math.sin(t * 9 + k) * 4;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3 + step, y + 13); ctx.moveTo(x, y); ctx.lineTo(x + 3 - step, y + 13); ctx.stroke();
        ctx.fillStyle = C.blue; ctx.fillRect(x - 4, y - 12, 8, 12);
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x, y - 18); ctx.lineTo(x + 8, y - 12); ctx.closePath(); ctx.fill();
    }

    function drawKago(ctx, o, y, d, t) {
        drawBearer(ctx, o.x + 8, y - 2, t, 0);
        drawBearer(ctx, o.x + o.w - 8, y - 2, t, 1.7);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(o.x + 2, y - 15); ctx.lineTo(o.x + o.w - 2, y - 15); ctx.stroke();
        ctx.fillStyle = C.red; ctx.lineWidth = 2;
        ctx.fillRect(o.x + 20, y - 12, o.w - 40, 16); ctx.strokeRect(o.x + 20, y - 12, o.w - 40, 16);
        ctx.fillStyle = C.ink; ctx.fillRect(o.x + 17, y - 17, o.w - 34, 5);
    }

    function drawHorse(ctx, o, y, d, t) {
        var cx = o.x + o.w / 2, g = t * 14 + o.seed * 6;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath();
        for (var i = 0; i < 4; i++) {
            var lx = cx + (i < 2 ? -18 : 16) + i % 2 * 5;
            ctx.moveTo(lx, y + 2); ctx.lineTo(lx + Math.sin(g + i * 1.6) * 7, y + 15);
        }
        ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.ellipse(cx, y, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + d * 18, y - 4); ctx.lineTo(cx + d * 38, y - 16); ctx.lineTo(cx + d * 42, y - 10); ctx.lineTo(cx + d * 24, y + 4); ctx.closePath(); ctx.fill();
        // The rider: lacquered red armour, a gilt crest, a banner on his back.
        ctx.fillStyle = C.red; ctx.fillRect(cx - 6, y - 24, 12, 16);
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(cx - 6, y - 26); ctx.lineTo(cx, y - 34); ctx.lineTo(cx + 6, y - 26); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.paper; ctx.fillRect(cx - d * 14 - 4, y - 38, 8, 16);
        ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.strokeRect(cx - d * 14 - 4, y - 38, 8, 16);
    }

    function drawRoad(s, ctx, lane) {
        var d = lane.v >= 0 ? 1 : -1, y = rowMid(lane.row) + 2;
        lane.objs.forEach(function (o) {
            if (o.x > 960 || o.x + o.w < 0) return;
            if (o.k === 'cart') drawCart(ctx, o, y, d, s.time);
            else if (o.k === 'kago') drawKago(ctx, o, y, d, s.time);
            else drawHorse(ctx, o, y, d, s.time);
        });
    }

    // An inn: timbered walls, a tiled roof, an indigo noren over the door
    // and a red lantern; a filled inn wears the traveller's red hanko seal.
    function drawInn(s, ctx, inn) {
        var x = inn.x, y = rowTop(TOP), base = y + RH;
        ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.fillRect(x - 34, y - 10, 68, RH + 10); ctx.strokeRect(x - 34, y - 10, 68, RH + 10);
        ctx.fillStyle = '#3c4a5c';
        ctx.beginPath(); ctx.moveTo(x - 46, y - 8); ctx.lineTo(x - 28, y - 28); ctx.lineTo(x + 28, y - 28); ctx.lineTo(x + 46, y - 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        var glow = inn.filled ? C.wood2 : 'rgba(217,164,65,' + (0.7 + 0.3 * Math.sin(s.time * 3 + x)) + ')';
        ctx.fillStyle = glow; ctx.fillRect(x - 15, y + 2, 30, base - y - 2);
        ctx.fillStyle = C.blue; ctx.fillRect(x - 17, y - 2, 34, 12);
        ctx.fillStyle = C.ver; ctx.beginPath(); ctx.ellipse(x + 26, y + 6, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (inn.filled) drawSeal(ctx, x, y + 14, Math.min(1, inn.t * 5));
    }

    // The hanko: thuds down large and settles, red with a carved border.
    function drawSeal(ctx, x, y, k) {
        var sz = 12 + (1 - k) * 20;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08);
        ctx.fillStyle = C.red; ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
        ctx.strokeStyle = C.paper; ctx.lineWidth = 2; ctx.strokeRect(-sz + 3, -sz + 3, sz * 2 - 6, sz * 2 - 6);
        ctx.beginPath(); ctx.moveTo(-sz * 0.4, -sz * 0.5); ctx.lineTo(-sz * 0.4, sz * 0.5); ctx.moveTo(-sz * 0.6, 0); ctx.lineTo(sz * 0.5, 0);
        ctx.moveTo(sz * 0.3, -sz * 0.5); ctx.lineTo(sz * 0.3, sz * 0.5); ctx.stroke();
        ctx.restore();
    }

    function drawRonin(s, ctx) {
        var r = s.ronin, x = r.x, y = rowMid(TOP) + 2;
        if (!r.resting) {
            // His reach: a dashed vermilion arc on the bank.
            ctx.strokeStyle = 'rgba(224,85,58,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
            ctx.beginPath(); ctx.ellipse(x, y + 8, REACH, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
        var h = r.resting ? 12 : 22;
        ctx.fillStyle = '#4a4440'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.fillRect(x - 7, y + 8 - h, 14, h); ctx.strokeRect(x - 7, y + 8 - h, 14, h);
        ctx.fillStyle = C.road; ctx.beginPath(); ctx.arc(x, y + 2 - h, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.fillRect(x - 2, y - 6 - h, 4, 4);
        ctx.strokeStyle = r.resting ? C.ink : '#dfe6ee'; ctx.lineWidth = 2.5; ctx.beginPath();
        if (r.resting) { ctx.moveTo(x - 12, y + 6); ctx.lineTo(x + 14, y + 4); }
        else { var sw = Math.sin(s.time * 4) * 0.3, dir = r.vx >= 0 ? 1 : -1; ctx.moveTo(x + dir * 6, y - 8); ctx.lineTo(x + dir * (20 + sw * 8), y - 30 + sw * 10); }
        ctx.stroke();
        if (r.resting) G.text('z', x + 12, y - 14 - Math.sin(s.time * 2) * 3, { size: 16, color: C.paper });
    }

    function drawTraveller(s, ctx) {
        var p = s.p, h = p.hop, rv = h ? h.r0 + (h.r1 - h.r0) * Math.min(1, h.t / HOP_T) : p.row;
        var y = rowMid(0) - rv * RH + 4, x = p.x, z = p.z;
        ctx.fillStyle = 'rgba(43,36,32,0.3)';
        ctx.beginPath(); ctx.ellipse(x, y + 8, 10 - z * 0.1, 4, 0, 0, Math.PI * 2); ctx.fill();
        y -= z;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(x - 7, y + 8); ctx.lineTo(x - 5, y - 8); ctx.lineTo(x + 5, y - 8); ctx.lineTo(x + 7, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.paper; ctx.fillRect(x - 5, y - 1, 10, 3);
        ctx.beginPath(); ctx.moveTo(x + 9, y - 14); ctx.lineTo(x + 11, y + 10); ctx.stroke();
        // The kasa: the wide straw hat that reads from any distance.
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(x - 14, y - 7); ctx.lineTo(x, y - 18); ctx.lineTo(x + 14, y - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (s.night) { ctx.fillStyle = C.ver; ctx.fillRect(x - 15, y - 2, 6, 8); }
    }

    function drawPetals(s, ctx) {
        ctx.fillStyle = C.pink; ctx.beginPath();
        s.petals.forEach(function (f) {
            ctx.moveTo(f.x + 4, f.y); ctx.ellipse(f.x, f.y, 4, 2, f.a, 0, Math.PI * 2);
        });
        ctx.fill();
    }

    function drawDeath(s, ctx) {
        var f = s.fx;
        if (!f || f.t > 1.2) return;
        var t = f.t;
        ctx.globalAlpha = Math.max(0, 1 - t / 1.2);
        if (f.cause === 'ronin') {
            ctx.strokeStyle = C.red; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(f.x - 40, f.y - 30); ctx.lineTo(f.x + 40 * Math.min(1, t * 6), f.y + 30 * Math.min(1, t * 6)); ctx.stroke();
        } else if (f.cause === 'cart' || f.cause === 'time') {
            ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(f.x, f.y, 16 + t * 10, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(f.x - 14, f.y); ctx.lineTo(f.x, f.y - 8); ctx.lineTo(f.x + 14, f.y); ctx.closePath(); ctx.fill();
        } else {
            ctx.strokeStyle = C.foam; ctx.lineWidth = 2; ctx.beginPath();
            for (var k = 0; k < 3; k++) { var rr = 6 + t * 40 - k * 10; if (rr > 0) { ctx.moveTo(f.x + rr, f.y); ctx.ellipse(f.x, f.y, rr, rr * 0.35, 0, 0, Math.PI * 2); } }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------
    // Night at Fuji Pass: darkness with lantern-lit holes
    // ------------------------------------------------------------------

    var POSTS = [[150, MEDIAN], [480, MEDIAN], [810, MEDIAN], [300, 0], [660, 0], [240, 3], [720, 3]];

    function lightSprite(s) {
        if (s.lamp) return s.lamp;
        var c = document.createElement('canvas'), g;
        c.width = c.height = 64; g = c.getContext('2d');
        var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.85)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        s.lamp = c;
        return c;
    }

    function nightLights(s) {
        var out = POSTS.map(function (p) { return [p[0], rowMid(p[1]), 90]; });
        s.lanes.forEach(function (lane) {
            if (!lane || !lane.lamp) return;
            lane.objs.forEach(function (o) { out.push([o.x + o.w / 2, rowMid(lane.row), 70]); });
        });
        s.inns.forEach(function (i) { out.push([i.x, rowMid(TOP), 60]); });
        if (s.dead <= 0) out.push([s.p.x, rowMid(s.p.row), 80]);
        return out;
    }

    function drawNight(s, ctx) {
        var nv = s.dark;
        if (!nv) nv = s.dark = { pic: document.createElement('canvas') };
        nv.pic.width = 480; nv.pic.height = 270;
        var g = nv.pic.getContext('2d'), sprite = lightSprite(s);
        g.fillStyle = 'rgba(8,14,32,0.66)'; g.fillRect(0, 0, 480, 270);
        g.globalCompositeOperation = 'destination-out';
        nightLights(s).forEach(function (l) {
            var flick = l[2] * (1 + 0.05 * Math.sin(s.time * 7 + l[0]));
            g.drawImage(sprite, (l[0] - flick) / 2, (l[1] - flick) / 2, flick, flick);
        });
        g.globalCompositeOperation = 'source-over';
        ctx.drawImage(nv.pic, 0, 15, 480, 255, 0, 30, G.W, G.H - 30);
        drawPosts(ctx, s);
    }

    function drawPosts(ctx, s) {
        ctx.fillStyle = C.ver; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        POSTS.forEach(function (p) {
            var sway = Math.sin(s.time * 1.5 + p[0]) * 2, y = rowMid(p[1]) - 10;
            ctx.beginPath(); ctx.ellipse(p[0] + sway, y, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
    }

    // The incense stick: the crossing's clock, burning down in the corner.
    function drawIncense(s, ctx) {
        var k = Math.max(0, s.clock / s.clockMax), x0 = 820, y = 528, len = 120 * k;
        ctx.fillStyle = 'rgba(43,36,32,0.55)'; ctx.fillRect(x0 - 4, y - 5, 132, 10);
        ctx.fillStyle = k < 0.2 ? C.ver : C.gold; ctx.fillRect(x0, y - 2, len, 4);
        ctx.fillStyle = C.ver; ctx.beginPath(); ctx.arc(x0 + len, y, 3, 0, Math.PI * 2); ctx.fill();
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        drawWater(s, ctx);
        s.lanes.forEach(function (lane) { if (lane && lane.river) drawCraft(s, ctx, lane); });
        s.inns.forEach(function (inn) { drawInn(s, ctx, inn); });
        s.lanes.forEach(function (lane) { if (lane && !lane.river) drawRoad(s, ctx, lane); });
        if (s.ronin) drawRonin(s, ctx);
        if (s.dead <= 0) drawTraveller(s, ctx);
        drawDeath(s, ctx);
        if (s.night) drawNight(s, ctx);
        drawPetals(s, ctx);
        drawIncense(s, ctx);
        ctx.fillStyle = C.indigo; ctx.fillRect(0, 0, G.W, G.HUD);
    }

    function hud(s) {
        var n = s.inns.filter(function (i) { return i.filled; }).length;
        return 'INNS ' + n + '/' + s.inns.length + '  TIME ' + Math.max(0, Math.ceil(s.clock));
    }

    // ------------------------------------------------------------------
    // The ending: lanterns rise over Mount Fuji above the woodblock waves.
    // Only e.t drives it.
    // ------------------------------------------------------------------

    function endingFuji(ctx) {
        ctx.fillStyle = 'rgba(31,58,95,0.85)'; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(150, 430); ctx.lineTo(440, 200); ctx.lineTo(520, 200); ctx.lineTo(810, 430); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.foam; ctx.beginPath(); ctx.moveTo(392, 238); ctx.lineTo(440, 200); ctx.lineTo(520, 200); ctx.lineTo(568, 238);
        ctx.lineTo(540, 228); ctx.lineTo(515, 250); ctx.lineTo(492, 228); ctx.lineTo(466, 252); ctx.lineTo(440, 228); ctx.closePath(); ctx.fill();
    }

    function endingWaves(ctx, t) {
        for (var band = 0; band < 3; band++) {
            var base = 482 + band * 22, shift = (t * (30 + band * 14)) % 160;
            ctx.fillStyle = band % 2 ? C.water : C.blue;
            ctx.beginPath(); ctx.moveTo(0, 540);
            for (var x = -160; x <= 1120; x += 160) {
                var cx = x + shift - (band * 50);
                ctx.lineTo(cx, base + 10); ctx.quadraticCurveTo(cx + 60, base - 40, cx + 110, base - 10);
                ctx.quadraticCurveTo(cx + 90, base + 6, cx + 160, base + 10);
            }
            ctx.lineTo(960, 540); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = C.foam; ctx.lineWidth = 3; ctx.stroke();
        }
    }

    function endingLanterns(ctx, t) {
        for (var i = 0; i < 16; i++) {
            var sp = 26 + (i * 37) % 30, x = 60 + (i * 271) % 840 + Math.sin(t * 0.8 + i) * 14;
            var y = 520 - ((t * sp + i * 83) % 560);
            ctx.globalAlpha = Math.min(1, (520 - y) / 80) * 0.9;
            ctx.fillStyle = 'rgba(217,164,65,0.35)';
            ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = i % 3 ? C.ver : C.gold;
            ctx.fillRect(x - 6, y - 9, 12, 18);
            ctx.fillStyle = C.ink; ctx.fillRect(x - 7, y - 10, 14, 2); ctx.fillRect(x - 7, y + 8, 14, 2);
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        ctx.fillStyle = 'rgba(20,36,61,0.55)'; ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = C.ver; ctx.beginPath(); ctx.arc(860, 296, 40, 0, Math.PI * 2); ctx.fill();
        endingFuji(ctx);
        endingLanterns(ctx, e.t);
        endingWaves(ctx, e.t);
    }

    G.register('ukiyoe', {
        title: 'TOKAIDO CROSSING',
        blurb: 'Hop the traveller over the Tokaido road and across the river on drifting boats.',
        controls: [
            '← ↑ → ↓ or the pad: hop one step (hold to keep hopping)',
            'Dodge carts, palanquins and riders; ride boats and logs over the river',
            'Hop into an empty inn at the top: fill them all before the incense burns',
            'Boats in a wave trough sink · the ronin cuts down a traveller in his reach'
        ],
        levelNames: ['Rice Paddies', 'Great Wave', 'Fuji Pass'],
        colors: { bg: C.indigo, fg: C.paper, accent: C.ver, dim: C.dim },
        lives: 5,
        music: {
            bpm: 108, root: 45, scale: 'phrygian', prog: [0, 0, 3, 4, 0, 5, 3, 0],
            bass: 'x.....x.x.......',
            lead: ['7.5.4...3.4.5...', '4.3.1.0-----....', '3.4.5.7.8.7.5...', '7-5-4-3-4-------',
                '0.1.3.4.5.4.3...', '7.8.a.8.7.5.4...', '5.4.3.1.3.4.5.4.', '3-------0-------'],
            arp: '0.3.....0...3...',
            drums: { k: 'x.......x..x....', s: '............x...', h: '..x...x...x...x.' },
            leadWave: 'triangle', bassWave: 'sine', arpWave: 'triangle', leadOct: 2
        },
        touch: { hide: ['a', 'b'], dirs: 4 },
        ending: {
            title: 'SAFE ARRIVAL',
            text: 'Every inn on the Tokaido has a lamp lit for you.',
            colors: [C.ver, C.water, C.paper, C.gold, '#7fa6c9'],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
