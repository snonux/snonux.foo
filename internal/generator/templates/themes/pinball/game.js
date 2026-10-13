/*
 * Electro Ball — the pinball theme's game.
 *
 * A real table in the middle of the screen: the ball falls under gravity and
 * bounces off line segments and circles, two flippers pass their swing on to
 * it, and a spring plunger serves it up the lane on the right. Every level is
 * a mission on a rebuilt table (ring the bumpers, light the lanes, drop the
 * targets, lock two balls for multiball ...) plus a points target. Four balls
 * per level; the mission's progress survives a lost ball, but not game over.
 *
 * On a phone (coarse pointer) the pad's ◀ ▶ are one stick under one thumb, so
 * they cannot both be held. PLUNGE (A) therefore doubles as the right flipper
 * and NUDGE (B) stands in for ↓; a finger on the left or right half of the
 * picture flips that side as well (the right half also works the plunger).
 */
(function () {
    'use strict';
    var G = window.SnoGame;

    // The playfield spans XL..XR, the plunger lane XR..LANE_R. Everything left
    // of the lane is mirrored around CX.
    var XL = 300, XR = 632, LANE_R = 660, TOP = 38, CX = (XL + XR) / 2, LANE_X = (XR + LANE_R) / 2;
    var BALL_R = 7, GRAV = 620, MAX_V = 1250, PLUNGER_Y = 527;
    // Eight sub-steps per tick keep both the ball and a flipper tip under 3px
    // of travel per step, so neither can tunnel through the other.
    var SUB = 8;
    // The flippers are long enough to leave only 30 px between their resting
    // tips, about two balls: a ball dropping straight down the middle is the
    // exception, not the rule.
    var FLIP = { len: 72, r: 6, rest: 0.45, up: -0.5, y: 478, dx: 80, upSpeed: 14, downSpeed: 9 };
    // Flipper coils: a flip while no ball is below `reach` is a wasted one
    // and adds 1 to the heat, which cools by `cool` a second. At `warn` the
    // table says so, at `trip` the flippers rest until the heat is back
    // under `reset`. Timed flips never heat anything, so this only stops a
    // player who flaps non-stop from keeping the ball alive by luck.
    var HEAT = { reach: 330, cool: 0.7, warn: 5, trip: 8, reset: 4, max: 10 };
    var COL = {
        field: '#071d24', glow: '#163b40', cabinet: '#101218', chrome: '#dce9ed', cyan: '#20e7f2',
        red: '#ff3d4e', yellow: '#ffd43b', ink: '#f8fbf2', muted: '#a9bdc0', dark: '#0a2a33'
    };

    // One entry per level: the mission (goal kind, how many, points target;
    // the targets are sized so that a mission played to the end has usually
    // made the points on the way),
    // up to three short lines of briefing (short, so that they fit the card in
    // type a phone can show), and the fixtures bolted onto the bare table.
    var LEVELS = [
        { goal: 'bumper', need: 12, target: 1500, brief: ['Wake the table up:', 'ring the pop bumpers.'],
            bumpers: [[416, 170], [516, 170], [466, 236]] },
        { goal: 'lane', need: 3, target: 1700, brief: ['Flip the ball up the', 'top lanes and light', 'all three.'],
            lanes: true, bumpers: [[366, 235], [566, 235]] },
        { goal: 'target', need: 6, target: 2700, brief: ['Knock down both banks', 'of drop targets.'],
            banks: true, bumpers: [[466, 175]] },
        { goal: 'spin', need: 27, target: 4000, brief: ['Crank the dynamo: shoot', 'through the spinner.'],
            spinner: [466, 150], lanes: true, bumpers: [[384, 225], [548, 225]] },
        { goal: 'lock', need: 2, target: 5000, brief: ['Lock two balls in the', 'saucers for multiball.'],
            saucers: [[317, 170], [615, 170]], locks: true, bumpers: [[430, 205], [502, 205]] },
        { goal: 'rover', need: 7, target: 4500, brief: ['Chase the Rover: hit', 'the bumper that will', 'not sit still.'],
            rover: 190, centre: [118, 3], bumpers: [[362, 265], [570, 265]] },
        { goal: 'zap', need: 3, target: 3400, brief: ['Feed the coils: flip', 'the ball into a live', 'magnet.'],
            magnets: [[400, 255], [532, 255]], lanes: true, bumpers: [[466, 165]] },
        { goal: 'hot', need: 7, target: 5200, brief: ['Only the flashing', 'targets are live.', 'Hit those.'],
            hot: true, spinner: [466, 160], bumpers: [[420, 228], [512, 228]] },
        { goal: 'saucer', need: 5, target: 4500, brief: ['Blackout! Each saucer', 'is a fuse: every one', 'widens the light.'],
            dark: true, saucers: [[317, 170], [615, 170], [466, 125]], bumpers: [[416, 228], [516, 228]] },
        { goal: 'wizard', need: 20, target: 15500, brief: ['Drop the targets, lock', 'two balls, then ring', 'bumpers in multiball.'],
            banks: true, saucers: [[317, 170], [615, 170]], locks: true, rover: 135, magnets: [[466, 305]],
            bumpers: [[400, 222], [532, 222]] }
    ];
    var LABEL = { bumper: 'BUMPERS', lane: 'LANES', target: 'TARGETS', spin: 'SPINS', lock: 'LOCKS',
        rover: 'ROVER HITS', zap: 'ZAPS', hot: 'LIVE WIRES', saucer: 'FUSES' };
    var PHONE_BRIEF = [
        ['Ring the pop', 'bumpers.'], ['Light 3 lanes', 'at the top.'], ['Drop 2 banks', 'of targets.'],
        ['Shoot through', 'the spinner.'], ['Lock 2 balls', 'for multiball.'], ['Hit the moving', 'Rover bumper.'],
        ['Flip into a', 'live magnet.'], ['Hit flashing', 'live targets.'], ['Hit saucers to', 'widen light.'],
        ['Drop targets,', 'lock 2 balls,', 'hit bumpers.']
    ];

    // Bells, chimes and the knocker: an electro-mechanical table is all
    // solenoids and struck metal, so most sounds are a click plus a sine.
    var SND = {
        flip: function () { G.noise(0.04, { freq: 420, vol: 0.22 }); G.tone(95, 0.05, { vol: 0.08 }); },
        // The 2.76 partial is what makes a sine read as a struck bell.
        bell: function (f) { G.tone(f, 0.26, { type: 'sine', vol: 0.2 }); G.tone(f * 2.76, 0.12, { type: 'sine', vol: 0.06 }); },
        chime: function (f) {
            G.tone(f, 0.3, { type: 'triangle', vol: 0.16 });
            G.tone(f * 1.5, 0.34, { type: 'triangle', vol: 0.13, delay: 0.09 });
        },
        knock: function () { G.noise(0.05, { freq: 260, vol: 0.5 }); G.tone(70, 0.08, { vol: 0.22 }); },
        sling: function () { G.noise(0.05, { freq: 2600, vol: 0.16 }); G.tone(310, 0.05, { vol: 0.09, slide: 180 }); },
        thunk: function () { G.tone(520, 0.1, { type: 'triangle', vol: 0.2, slide: 150 }); G.noise(0.04, { freq: 700, vol: 0.2 }); },
        dud: function () { G.tone(160, 0.06, { type: 'triangle', vol: 0.14 }); },
        tick: function (f) { G.tone(f, 0.025, { type: 'triangle', vol: 0.1 }); },
        launch: function () {
            G.noise(0.14, { filter: 'bandpass', freq: 700, slide: 3200, vol: 0.2 });
            G.tone(110, 0.2, { type: 'triangle', vol: 0.2, slide: 520 });
        },
        drain: function () { G.tone(330, 0.5, { type: 'sine', vol: 0.2, slide: 70 }); },
        tilt: function () { G.tone(82, 0.7, { type: 'sawtooth', vol: 0.25 }); G.tone(87, 0.7, { type: 'sawtooth', vol: 0.2 }); },
        zap: function () {
            G.noise(0.18, { filter: 'highpass', freq: 3500, slide: 900, vol: 0.2 });
            G.tone(1400, 0.16, { type: 'sawtooth', vol: 0.1, slide: 200 });
        },
        hum: function () { G.tone(100, 0.5, { type: 'sawtooth', vol: 0.05, attack: 0.2 }); },
        saucer: function () {
            [660, 880, 1109].forEach(function (f, i) { G.tone(f, 0.14, { type: 'sine', vol: 0.18, delay: i * 0.07 }); });
        },
        eject: function () { G.noise(0.05, { freq: 900, vol: 0.3 }); G.tone(240, 0.08, { vol: 0.1, slide: 480 }); },
        multiball: function () {
            for (var i = 0; i < 8; i++) G.tone(520 + (i % 4) * 180, 0.1, { type: 'triangle', vol: 0.18, delay: i * 0.08 });
        },
        thunder: function () { G.noise(0.9, { freq: 500, slide: 50, vol: 0.3 }); }
    };

    // ------------------------------------------------------------------
    // Building the table
    // ------------------------------------------------------------------

    // A wall is a line segment with thickness r and restitution e. The
    // padded bounding box lets the collision loop skip far-away walls.
    function seg(s, ax, ay, bx, by, o) {
        var w = { ax: ax, ay: ay, bx: bx, by: by, e: 0.45, r: 0, flash: 0 };
        for (var k in o) w[k] = o[k];
        var pad = BALL_R + w.r + 1;
        w.x0 = Math.min(ax, bx) - pad; w.x1 = Math.max(ax, bx) + pad;
        w.y0 = Math.min(ay, by) - pad; w.y1 = Math.max(ay, by) + pad;
        s.walls.push(w);
        return w;
    }

    function arc(s, cx, cy, r, a0, a1) {
        for (var i = 0; i < 8; i++) {
            var a = G.lerp(a0, a1, i / 8), b = G.lerp(a0, a1, (i + 1) / 8);
            seg(s, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r);
        }
    }

    // A slingshot is a triangle whose long edge kicks the ball away.
    function addSling(s, m) {
        var p = [[m(XL + 46), 348], [m(XL + 46), 402], [m(XL + 90), 440]];
        seg(s, p[0][0], p[0][1], p[1][0], p[1][1], { hide: true, e: 0.2 });
        seg(s, p[1][0], p[1][1], p[2][0], p[2][1], { hide: true });
        s.slings.push({ pts: p, edge: seg(s, p[2][0], p[2][1], p[0][0], p[0][1], { sling: true, hide: true, e: 0.6 }) });
    }

    // One side of the lower playfield; m mirrors x for the right-hand copy.
    // The bump in the side wall throws a ball that rolls down the wall (as
    // every hard plunge does) out onto the slingshot; without it that ball
    // would fall straight into the outlane below.
    function buildSide(s, m) {
        seg(s, m(XL), TOP + 60, m(XL), 288);
        seg(s, m(XL), 288, m(XL + 26), 322, { e: 0.3 });
        seg(s, m(XL + 26), 322, m(XL), 332);
        // The wall runs on behind the bump: on the right that pocket would
        // otherwise be open to the plunger lane.
        seg(s, m(XL), 288, m(XL), G.H + 30);
        seg(s, m(XL + 24), 398, m(XL + 24), 420);
        seg(s, m(XL + 24), 420, m(CX - FLIP.dx - 2), FLIP.y - 6, { e: 0.2 });
        addSling(s, m);
    }

    function buildFrame(s) {
        arc(s, XL + 60, TOP + 60, 60, Math.PI, Math.PI * 1.5);
        seg(s, XL + 60, TOP, LANE_R - 60, TOP);
        arc(s, LANE_R - 60, TOP + 60, 60, Math.PI * 1.5, Math.PI * 2);
        seg(s, LANE_R, TOP + 60, LANE_R, G.H + 30);
        seg(s, XR, PLUNGER_Y, LANE_R, PLUNGER_Y, { e: 0.1, hide: true });
        // One-way gate: a served ball passes, a ball in play bounces off.
        seg(s, XR, 47, XR, TOP + 60, { gate: true, hide: true });
        buildSide(s, function (x) { return x; });
        buildSide(s, function (x) { return XL + XR - x; });
    }

    function newFlipper(side) {
        var rest = side < 0 ? FLIP.rest : Math.PI - FLIP.rest;
        return { px: CX + side * FLIP.dx, py: FLIP.y, rest: rest, up: side < 0 ? FLIP.up : Math.PI - FLIP.up, a: rest, av: 0 };
    }

    function addBumpers(s, list) {
        list.forEach(function (p) { s.bumpers.push({ x: p[0], y: p[1], r: 18, vx: 0, flash: 0, rover: false }); });
    }

    function addLanes(s) {
        for (var i = 0; i < 4; i++) seg(s, 391 + i * 50, 59, 391 + i * 50, 100, { r: 3, e: 0.5 });
        for (var j = 0; j < 3; j++) s.lanes.push({ x: 416 + j * 50, lit: false });
    }

    function addTarget(s, ax, ay, bx, by, standup) {
        s.targets.push({ ax: ax, ay: ay, bx: bx, by: by, standup: standup, live: false, down: false, flash: 0 });
    }

    // Targets on both side walls: three drop targets, or two standups.
    function addBanks(s, standup) {
        (standup ? [208, 252] : [200, 228, 256]).forEach(function (y) {
            addTarget(s, XL + 11, y, XL + 11, y + 22, standup);
            addTarget(s, XR - 11, y, XR - 11, y + 22, standup);
        });
    }

    function addCentre(s, y, n, standup) {
        var x = CX - (n * 26 - 4) / 2;
        for (var i = 0; i < n; i++) addTarget(s, x + i * 26, y, x + i * 26 + 22, y, standup);
    }

    function addSpinner(s, p) {
        s.spinner = { x: p[0], y: p[1], hw: 20, ang: 0, vel: 0 };
        seg(s, p[0] - 23, p[1], p[0] - 23, p[1], { r: 4, e: 0.6 });
        seg(s, p[0] + 23, p[1], p[0] + 23, p[1], { r: 4, e: 0.6 });
    }

    function buildFixtures(s, cfg) {
        addBumpers(s, cfg.bumpers);
        if (cfg.rover) s.bumpers.push({ x: CX, y: cfg.rover, r: 18, vx: 0, flash: 0, rover: true });
        if (cfg.lanes) addLanes(s);
        if (cfg.banks) addBanks(s, false);
        if (cfg.hot) {
            addBanks(s, true); addCentre(s, 108, 3, true);
            [0, 3, 5].forEach(function (i) { s.targets[i].live = true; });
        }
        if (cfg.centre) addCentre(s, cfg.centre[0], cfg.centre[1], false);
        if (cfg.spinner) addSpinner(s, cfg.spinner);
        (cfg.saucers || []).forEach(function (p) { s.saucers.push({ x: p[0], y: p[1], ball: null, t: 0, cool: 0 }); });
        (cfg.magnets || []).forEach(function (p) { s.magnets.push({ x: p[0], y: p[1], r: 84, on: false, cool: 0 }); });
    }

    // Puts a ball on the plunger. An automatic serve launches itself; a
    // manual one arms the ball saver for when it leaves the lane.
    function serve(s, auto) {
        s.balls.push({ x: LANE_X, y: PLUNGER_Y - BALL_R, vx: 0, vy: 0, nx: 0, ny: -1, inLane: true, held: false, locked: false, shot: false, lane: -1, still: 0, kicks: 0, kx: 0, ky: 0 });
        s.autoT = auto ? 0.7 : 0;
        s.saveArmed = !auto;
    }

    function coarse() {
        return G.isTouch();
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 131), s = {
            cfg: cfg, level: level, time: 0, need: cfg.need, done: 0, pts: 0,
            walls: [], slings: [], bumpers: [], targets: [], lanes: [], saucers: [], magnets: [], spinner: null,
            flippers: [newFlipper(-1), newFlipper(1)], balls: [], lights: [],
            charge: 0, laneIdle: 0, autoT: 0, save: 0, saveArmed: true, tilt: 0, tilted: false, nudgeT: 0, heat: 0, hot: false,
            multiball: false, locked: 0, lockLit: !!cfg.locks && cfg.goal !== 'wizard',
            hotT: 10, resetT: 0, laneFlash: 0, bolt: 0, boltT: 3, msg: '', msgT: 0, clickT: 0,
            touch: coarse(), ctl: { left: false, right: false, plunge: false, hitL: false, hitR: false, nudge: false }
        };
        buildFrame(s);
        buildFixtures(s, cfg);
        // Playfield insert lamps: decoration only, but seeded so a level
        // looks the same on every visit.
        for (var i = 0; i < 16; i++) s.lights.push({ x: XL + 30 + rnd() * (XR - XL - 60), y: 120 + rnd() * 320, ph: rnd() * 6.3 });
        serve(s, false);
        return s;
    }

    // ------------------------------------------------------------------
    // Scoring and the mission
    // ------------------------------------------------------------------

    function say(s, text) { s.msg = text; s.msgT = 2.4; }

    // Level points and the run score move together; multiball pays double.
    function score(s, n, x, y) {
        n *= s.multiball ? 2 : 1;
        s.pts += n;
        G.addScore(n);
        if (x) G.popup(x, y, '+' + n, COL.yellow);
    }

    // What the mission counts right now. The last level walks through three
    // phases, each capped so that one cannot spill into the next.
    function wanted(s) {
        if (s.cfg.goal !== 'wizard') return { kind: s.cfg.goal, cap: s.need };
        if (s.done < 6) return { kind: 'target', cap: 6 };
        if (s.done < 8) return { kind: 'lock', cap: 8 };
        return { kind: s.multiball ? 'bumper' : '', cap: s.need };
    }

    // Clearing the targets on the last level lights the locks and, as the
    // mission is a long one, pays an extra ball (never above four).
    function openLocks(s) {
        s.lockLit = true;
        G.addLife(4);
        say(s, 'LOCKS LIT + EXTRA BALL');
        SND.knock();
    }

    function progress(s, kind) {
        var w = wanted(s);
        if (kind === 'rover' && w.kind === 'bumper') kind = 'bumper';
        if (kind !== w.kind || s.done >= s.need) return;
        s.done = Math.min(w.cap, s.done + 1);
        if (s.cfg.goal === 'wizard' && s.done === 6) openLocks(s);
        if (s.done < s.need) return;
        say(s, s.pts >= s.cfg.target ? 'MISSION COMPLETE' : 'NOW MAKE THE POINTS');
        SND.knock();
        G.flash(COL.yellow, 0.2);
    }

    // What the mission card shows: on the last level the count of the phase
    // in play, not the sum over all three.
    function goalView(s) {
        if (s.cfg.goal !== 'wizard') return { label: LABEL[s.cfg.goal], done: s.done, need: s.need };
        if (s.done < 6) return { label: 'TARGETS', done: s.done, need: 6 };
        if (s.done < 8) return { label: 'LOCKS', done: s.done - 6, need: 2 };
        return { label: 'JACKPOTS', done: s.done - 8, need: s.need - 8 };
    }

    // Jackpots only count during multiball: once it has ended early the
    // way back is to lock two balls again, so that is what is shown.
    function mustRelock(s) {
        return s.cfg.goal === 'wizard' && s.done >= 8 && s.done < s.need && !s.multiball;
    }

    function goalText(s) {
        if (mustRelock(s)) return 'RE-LOCK 2 BALLS ' + s.locked + '/2';
        var v = goalView(s);
        return v.label + ' ' + v.done + '/' + v.need;
    }

    // Whether lanes or magnets are what the mission counts right now. They
    // only count a ball the player has flipped, so that ball is marked.
    function needsShot(s) {
        var kind = wanted(s).kind;
        return (kind === 'lane' || kind === 'zap') && s.done < s.need;
    }

    // ------------------------------------------------------------------
    // Collision
    // ------------------------------------------------------------------

    // Resolves the ball against a round obstacle of radius rad at (cx, cy)
    // whose surface moves at (svx, svy): pushes the ball out and reflects the
    // closing velocity. Returns the closing speed (0 when not approaching).
    function bounce(b, cx, cy, rad, e, svx, svy) {
        var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= rad * rad) return 0;
        var d = Math.sqrt(d2), nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
        b.x = cx + nx * rad; b.y = cy + ny * rad;
        var vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
        if (vn >= 0) return 0;
        // A slow contact is absorbed, so a resting ball settles instead of
        // buzzing on the surface.
        var k = vn > -40 ? 1 : 1 + e;
        b.vx -= k * vn * nx; b.vy -= k * vn * ny;
        b.nx = nx; b.ny = ny;
        return -vn;
    }

    // The kick varies in strength and direction like a worn rubber does;
    // without that a ball can ping-pong between the two slings for ever.
    function kickSling(s, b, w) {
        var a = Math.atan2(b.ny, b.nx) + G.rnd(-0.3, 0.3), kick = G.rnd(230, 370);
        b.vx += Math.cos(a) * kick; b.vy += Math.sin(a) * kick;
        w.flash = 0.15;
        score(s, 10);
        SND.sling();
    }

    // Hard knocks against plain walls click, rate-limited so a ball rattling
    // in a corner does not machine-gun the speaker.
    function wallClick(s, hit) {
        if (s.clickT > 0) return;
        s.clickT = 0.07;
        G.tone(170 + hit * 0.3, 0.03, { type: 'triangle', vol: Math.min(0.12, hit / 5000) });
    }

    function hitWalls(s, b) {
        for (var i = 0; i < s.walls.length; i++) {
            var w = s.walls[i];
            if (b.x < w.x0 || b.x > w.x1 || b.y < w.y0 || b.y > w.y1 || (w.gate && b.inLane)) continue;
            var c = G.closestOnSeg(b.x, b.y, w.ax, w.ay, w.bx, w.by);
            var hit = bounce(b, c.x, c.y, BALL_R + w.r, w.e, 0, 0);
            if (w.sling && hit > 90) kickSling(s, b, w);
            else if (hit > 260) wallClick(s, hit);
        }
    }

    // The flipper is a capsule turning around its pivot; the contact point's
    // own velocity is what adds momentum to the ball when the flipper swings.
    function hitFlipper(b, f) {
        var tx = f.px + Math.cos(f.a) * FLIP.len, ty = f.py + Math.sin(f.a) * FLIP.len;
        if (Math.abs(b.x - f.px) > FLIP.len + 20 || Math.abs(b.y - f.py) > FLIP.len + 20) return;
        var c = G.closestOnSeg(b.x, b.y, f.px, f.py, tx, ty);
        var hit = bounce(b, c.x, c.y, BALL_R + FLIP.r, 0.3, -f.av * (c.y - f.py), f.av * (c.x - f.px));
        // Only a ball struck by a rising flipper is a shot the player made;
        // lanes and magnets count nothing else toward a mission.
        if (hit > 0 && f.av * (f.up - f.rest) > 0) b.shot = true;
    }

    function popBumper(s, bp) {
        bp.flash = 0.18;
        score(s, 100);
        SND.bell(bp.rover ? 1320 : 880 + (bp.x - CX) * 1.2);
        G.burst(bp.x, bp.y, { n: 5, color: bp.rover ? COL.yellow : COL.red, speed: 170, life: 0.3 });
        progress(s, bp.rover ? 'rover' : 'bumper');
    }

    // A pop bumper always throws the ball out at a minimum speed, however
    // gently it was touched.
    function hitBumpers(s, b) {
        for (var i = 0; i < s.bumpers.length; i++) {
            var bp = s.bumpers[i];
            if (bounce(b, bp.x, bp.y, BALL_R + bp.r, 0.6, bp.vx, 0) <= 0) continue;
            var out = b.vx * b.nx + b.vy * b.ny;
            if (out < 380) { b.vx += (380 - out) * b.nx; b.vy += (380 - out) * b.ny; }
            popBumper(s, bp);
        }
    }

    // Hands the current to a dead target, so three are live at all times.
    function relight(s, skip) {
        var dead = s.targets.filter(function (t) { return !t.live && t !== skip; });
        if (dead.length) G.pick(dead).live = true;
        s.hotT = 10;
    }

    function wanderHot(s) {
        var t = G.pick(s.targets.filter(function (o) { return o.live; }));
        t.live = false;
        relight(s, t);
    }

    function hitStandup(s, t) {
        if (!t.live) { score(s, 40); SND.dud(); return; }
        t.live = false;
        relight(s, t);
        score(s, 500, (t.ax + t.bx) / 2, t.ay - 12);
        SND.zap();
        G.burst((t.ax + t.bx) / 2, (t.ay + t.by) / 2, { n: 14, color: COL.cyan, speed: 220, life: 0.4 });
        progress(s, 'hot');
    }

    function hitTarget(s, t) {
        t.flash = 0.2;
        if (t.standup) { hitStandup(s, t); return; }
        t.down = true;
        score(s, 250, (t.ax + t.bx) / 2, t.ay - 12);
        SND.thunk();
        progress(s, 'target');
        if (!s.targets.every(function (o) { return o.down; })) return;
        // A cleared bank pays a bonus and pops back up after a moment.
        score(s, 1000, CX, 300);
        SND.chime(784);
        s.resetT = 1.5;
    }

    function hitTargets(s, b) {
        for (var i = 0; i < s.targets.length; i++) {
            var t = s.targets[i];
            if (t.down || Math.abs(b.x - t.ax) > 40 || Math.abs(b.y - t.ay) > 40) continue;
            var c = G.closestOnSeg(b.x, b.y, t.ax, t.ay, t.bx, t.by);
            if (bounce(b, c.x, c.y, BALL_R + 3, 0.4, 0, 0) > 40) hitTarget(s, t);
        }
    }

    // The spinner is not solid: a ball crossing its axis sets it turning at a
    // rate that follows the ball's speed, and pays for it with a little drag.
    function crossSpinner(s, b, py) {
        var sp = s.spinner;
        if (!sp || Math.abs(b.x - sp.x) > sp.hw || (py - sp.y) * (b.y - sp.y) > 0) return;
        // A slow ball dribbling back must not brake a fast spin.
        var v = G.clamp(b.vy * 0.1, -60, 60);
        if (Math.abs(v) > Math.abs(sp.vel)) sp.vel = v;
        b.vy *= 0.9;
    }

    // A live magnet drags the ball toward its core, harder the closer it is.
    function pullMagnets(s, b, h) {
        for (var i = 0; i < s.magnets.length; i++) {
            var mg = s.magnets[i];
            if (!mg.on || mg.cool > 0) continue;
            var dx = mg.x - b.x, dy = mg.y - b.y, d = Math.hypot(dx, dy);
            if (d > mg.r || d < 1) continue;
            var a = (900 + 2200 * (1 - d / mg.r)) * h / d;
            b.vx += dx * a; b.vy += dy * a;
        }
    }

    // Equal masses: two free balls swap their velocities along the line
    // between them. A ball about to be kicked out of a saucer acts as a fixed
    // post; a locked one sits down in its hole and is rolled over, or a ball
    // coming down the wall beside it would wedge on it.
    function collidePair(a, b) {
        if (a.locked || b.locked || (a.held && b.held)) return;
        if (a.held) { bounce(b, a.x, a.y, BALL_R * 2, 0.5, 0, 0); return; }
        if (b.held) { bounce(a, b.x, b.y, BALL_R * 2, 0.5, 0, 0); return; }
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= BALL_R * 2 || d < 1e-6) return;
        var nx = dx / d, ny = dy / d, push = (BALL_R * 2 - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel >= 0) return;
        a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny;
    }

    // ------------------------------------------------------------------
    // Simulation
    // ------------------------------------------------------------------

    function moveFlipper(f, on, h) {
        var speed = (on ? FLIP.upSpeed : FLIP.downSpeed) * h;
        var step = G.clamp((on ? f.up : f.rest) - f.a, -speed, speed);
        f.a += step;
        f.av = step / h;
    }

    // The saver starts counting only once the ball is really on the table.
    // It is long on the early tables (19 s) and still 10 s on the last, so a
    // ball that drains before the player has had a real go at it comes back.
    function leaveLane(s, b) {
        b.inLane = false;
        if (!s.saveArmed) return;
        s.saveArmed = false;
        s.save = 20 - s.level;
    }

    // MAX_V is a hard limit: it is what the sub-step count is sized for, so
    // it is enforced before the move and again after the kicks of this step.
    function limitSpeed(b) {
        var sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
    }

    function stepBall(s, b, h) {
        var py = b.y;
        b.vy += GRAV * h;
        pullMagnets(s, b, h);
        limitSpeed(b);
        b.x += b.vx * h; b.y += b.vy * h;
        hitWalls(s, b);
        hitFlipper(b, s.flippers[0]);
        hitFlipper(b, s.flippers[1]);
        hitBumpers(s, b);
        hitTargets(s, b);
        crossSpinner(s, b, py);
        limitSpeed(b);
        // Whatever is right of the lane wall is in the lane, however it got
        // there, so the plunger will always serve it again.
        if (b.x > XR) b.inLane = true;
        else if (b.inLane && b.x < XR - BALL_R - 1) leaveLane(s, b);
    }

    function substep(s, h) {
        var live = !s.tilted && !s.hot;
        moveFlipper(s.flippers[0], live && s.ctl.left, h);
        moveFlipper(s.flippers[1], live && s.ctl.right, h);
        var i, j, n = s.balls.length;
        for (i = 0; i < n; i++) if (!s.balls[i].held) stepBall(s, s.balls[i], h);
        for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) collidePair(s.balls[i], s.balls[j]);
    }

    function restingBall(s) {
        for (var i = 0; i < s.balls.length; i++) {
            var b = s.balls[i];
            if (b.inLane && b.y > PLUNGER_Y - BALL_R - 8 && Math.abs(b.vy) < 40) return b;
        }
        return null;
    }

    function launch(s, b, power) {
        b.vy = -(860 + 380 * power);
        b.vx = 0;
        s.charge = 0; s.laneIdle = 0;
        SND.launch();
    }

    // Hold to compress the spring, release to fire. A ball nobody plunges
    // serves itself after a while, as a real table's auto-launcher would.
    function updatePlunger(s, dt) {
        var b = restingBall(s);
        if (!b) { s.charge = 0; s.laneIdle = 0; return; }
        s.laneIdle += dt;
        if (s.autoT > 0) {
            s.autoT -= dt;
            if (s.autoT <= 0) launch(s, b, G.rnd(0.55, 1));
            return;
        }
        if (s.ctl.plunge) { s.charge = Math.min(1, s.charge + dt * 1.1); return; }
        if (s.charge > 0) launch(s, b, s.charge);
        else if (s.laneIdle > 6) launch(s, b, G.rnd(0.5, 1));
    }

    // The top-lane lights move with the flippers, so a player can steer an
    // unlit lane under a falling ball.
    function shiftLanes(s, dir) {
        var lit = s.lanes.map(function (l) { return l.lit; }), n = lit.length;
        s.lanes.forEach(function (l, i) { l.lit = lit[(i - dir + n) % n]; });
    }

    // A nudge shoves every ball in play. The tilt meter drains slowly, so
    // the thresholds sit a little under 2 and 3: the second nudge in quick
    // succession warns, the third kills the flippers for this ball.
    function nudge(s) {
        s.nudgeT = 0.3; s.tilt += 1;
        G.shake(5, 0.15);
        SND.dud();
        s.balls.forEach(function (b) {
            if (b.held || b.inLane) return;
            b.vy -= 150; b.vx += G.rnd(-110, 110);
        });
        if (s.tilt < 1.5) return;
        if (s.tilt < 2.3) { say(s, 'DANGER'); G.sfx('alarm'); return; }
        s.tilted = true; s.save = 0;
        say(s, 'TILT');
        SND.tilt();
    }

    // Turns keys, pad and (on a phone) a finger on the picture into the
    // table's controls, with one press edge per flipper however it is held.
    // Only the phone gets the extras: there the pad's ◀ ▶ share one thumb, so
    // A is the right flipper as well as the plunger, B nudges, and a touch on
    // the left or right half of the canvas works that side.
    function readInput(s) {
        var c = s.ctl, side = s.touch && G.mouse.down ? (G.mouse.x < G.W / 2 ? -1 : 1) : 0;
        var left = G.key.left || side < 0, right = G.key.right || side > 0 || (s.touch && G.key.a);
        c.hitL = left && !c.left; c.hitR = right && !c.right;
        c.left = left; c.right = right;
        c.plunge = G.key.a || side > 0;
        c.nudge = G.hit.down || (s.touch && G.hit.b);
    }

    // A flip is wasted when no ball is in the lower playfield to be hit by
    // it. Wasted flips go on heating resting coils, so flapping on through
    // the rest keeps the flippers off.
    function heatCoils(s) {
        var near = s.balls.some(function (b) { return !b.held && !b.inLane && b.y > HEAT.reach; });
        if (near) return;
        s.heat = Math.min(HEAT.max, s.heat + 1);
        if (s.hot || s.heat < HEAT.warn) return;
        if (s.heat < HEAT.trip) { say(s, 'COILS WARM: FLIP AT THE BALL'); return; }
        s.hot = true;
        say(s, 'COILS HOT: FLIPPERS REST');
        SND.tilt();
    }

    function flipPressed(s, dir) {
        heatCoils(s);
        if (s.hot) { SND.dud(); return; }
        SND.flip();
        shiftLanes(s, dir);
    }

    function readControls(s) {
        readInput(s);
        if (s.tilted) return;
        if (s.ctl.hitL) flipPressed(s, -1);
        if (s.ctl.hitR) flipPressed(s, 1);
        if (s.ctl.nudge && s.nudgeT <= 0) nudge(s);
    }

    function fade(list, dt) {
        for (var i = 0; i < list.length; i++) if (list[i].flash > 0) list[i].flash -= dt;
    }

    function tickTimers(s, dt) {
        ['save', 'msgT', 'clickT', 'nudgeT', 'laneFlash', 'bolt'].forEach(function (k) { s[k] = Math.max(0, s[k] - dt); });
        s.tilt = Math.max(0, s.tilt - dt * 0.4);
        s.heat = Math.max(0, s.heat - dt * HEAT.cool);
        if (s.hot && s.heat < HEAT.reset) { s.hot = false; say(s, 'FLIPPERS BACK'); }
        fade(s.bumpers, dt); fade(s.targets, dt); fade(s.walls, dt);
        if (s.resetT > 0 && (s.resetT -= dt) <= 0) {
            s.targets.forEach(function (t) { t.down = false; });
            SND.tick(700);
        }
        // An unclaimed live wire wanders on, so no target stays safe to ignore.
        if (s.cfg.hot && (s.hotT -= dt) <= 0) wanderHot(s);
        if (s.cfg.dark && (s.boltT -= dt) <= 0) { s.bolt = 0.35; s.boltT = G.rnd(4, 7); SND.thunder(); }
    }

    function moveRover(s, dt) {
        s.bumpers.forEach(function (bp) {
            if (!bp.rover) return;
            var nx = CX + 112 * Math.sin(s.time * 0.8);
            bp.vx = (nx - bp.x) / dt;
            bp.x = nx;
        });
    }

    // A lane lights only for a ball the player has flipped: the plunge drops
    // every ball through the lanes, and that alone must not do the mission.
    function rollLane(s, l, b) {
        if (!l.lit && !b.shot && s.cfg.goal === 'lane') say(s, 'NOT FLIPPED: NO LANE');
        if (l.lit || !b.shot) { score(s, 20); SND.tick(900); return; }
        l.lit = true;
        score(s, 150, l.x, 120);
        SND.chime(660);
        progress(s, 'lane');
        if (!s.lanes.every(function (o) { return o.lit; })) return;
        score(s, 1000, CX, 140);
        s.lanes.forEach(function (o) { o.lit = false; });
        s.laneFlash = 0.8;
        G.sfx('power');
    }

    // A lane pays once per pass: b.lane remembers which one the ball is in.
    function updateLanes(s) {
        if (!s.lanes.length) return;
        s.balls.forEach(function (b) {
            var idx = -1;
            if (b.y > 60 && b.y < 98) s.lanes.forEach(function (l, i) { if (Math.abs(b.x - l.x) < 19) idx = i; });
            if (idx >= 0 && b.lane !== idx) rollLane(s, s.lanes[idx], b);
            b.lane = idx;
        });
    }

    function updateSpinner(s, dt) {
        var sp = s.spinner;
        if (!sp || !sp.vel) return;
        var before = Math.floor(sp.ang / Math.PI);
        sp.ang += sp.vel * dt;
        sp.vel *= Math.exp(-1.3 * dt);
        if (Math.abs(sp.vel) < 1.2) sp.vel = 0;
        var turns = Math.abs(Math.floor(sp.ang / Math.PI) - before);
        for (var i = 0; i < turns; i++) { score(s, 30); progress(s, 'spin'); }
        if (turns) SND.tick(1300 + Math.abs(sp.vel) * 12);
    }

    function freeBalls(s) {
        return s.balls.filter(function (b) { return !b.locked; }).length;
    }

    // Both locked balls are kicked out one after the other and a third is
    // served, so three are in play.
    function startMultiball(s) {
        var delay = 0.4;
        s.multiball = true; s.lockLit = false; s.locked = 0;
        s.saucers.forEach(function (sc) {
            if (!sc.ball || !sc.ball.locked) return;
            sc.ball.locked = false; sc.t = delay; delay += 0.5;
        });
        serve(s, true);
        say(s, 'MULTIBALL  x2');
        SND.multiball();
        G.flash(COL.cyan, 0.3);
    }

    // The locks come back once multiball is over, so it can be earned again.
    function endMultiball(s) {
        s.multiball = false;
        s.lockLit = !!s.cfg.locks && (s.cfg.goal !== 'wizard' || s.done >= 6);
        if (mustRelock(s)) say(s, 'RE-LOCK 2 BALLS');
    }

    function capture(s, sc, b) {
        sc.ball = b; sc.t = 0.9;
        b.held = true; b.x = sc.x; b.y = sc.y; b.vx = 0; b.vy = 0;
        score(s, 500, sc.x, sc.y - 20);
        SND.saucer();
        G.burst(sc.x, sc.y, { n: 12, color: COL.cyan, speed: 150, life: 0.4 });
        if (!s.lockLit) { progress(s, 'saucer'); return; }
        b.locked = true; s.locked++;
        progress(s, 'lock');
        if (s.locked >= 2) { startMultiball(s); return; }
        say(s, 'BALL LOCKED');
        if (!freeBalls(s)) serve(s, false);
    }

    // Kicks the ball back toward the middle of the table.
    function eject(s, sc) {
        var b = sc.ball, a = Math.atan2(150, CX - sc.x) + G.rnd(-0.3, 0.3);
        if (sc.x === CX) a = Math.PI / 2 + G.rnd(-0.8, 0.8);
        b.held = false;
        b.vx = Math.cos(a) * 380; b.vy = Math.sin(a) * 380;
        sc.ball = null; sc.cool = 0.6;
        SND.eject();
    }

    function updateSaucer(s, sc, dt) {
        if (sc.cool > 0) sc.cool -= dt;
        if (sc.ball) {
            if (!sc.ball.locked && (sc.t -= dt) <= 0) eject(s, sc);
            return;
        }
        if (sc.cool > 0) return;
        for (var i = 0; i < s.balls.length; i++) {
            var b = s.balls[i];
            if (b.held || b.inLane || G.dist(b.x, b.y, sc.x, sc.y) > 11 || Math.hypot(b.vx, b.vy) > 750) continue;
            capture(s, sc, b);
            return;
        }
    }

    // A ball that reaches the core of a live magnet is charged and flung
    // back up the table; the coil then needs a moment to recover.
    function zap(s, mg, b) {
        var a = -Math.PI / 2 + G.rnd(-1, 1);
        b.vx = Math.cos(a) * 680; b.vy = Math.sin(a) * 680;
        mg.cool = 1.5;
        score(s, 300, mg.x, mg.y - 20);
        SND.zap();
        G.burst(mg.x, mg.y, { n: 16, color: COL.cyan, speed: 260, life: 0.45 });
        // Magnets catch plenty of balls on their own, so the mission only
        // counts a ball the player has flipped since its last zap.
        if (b.shot) progress(s, 'zap');
        else if (s.cfg.goal === 'zap' && s.done < s.need) say(s, 'NOT FLIPPED: NO ZAP');
        b.shot = false;
    }

    // Magnets take turns: each is live for 2.8 of every 5 seconds.
    function updateMagnet(s, mg, i, dt) {
        var on = (s.time + i * 2.5) % 5 < 2.8;
        if (on && !mg.on) SND.hum();
        mg.on = on;
        if (mg.cool > 0) { mg.cool -= dt; return; }
        if (!on) return;
        for (var k = 0; k < s.balls.length; k++) {
            var b = s.balls[k];
            if (!b.held && !b.inLane && G.dist(b.x, b.y, mg.x, mg.y) < 13) { zap(s, mg, b); return; }
        }
    }

    function onTable(b) {
        return b.held || (b.y < G.H + 14 && b.y > 0 && b.x > XL - 20 && b.x < LANE_R + 20);
    }

    // Balls that fell past the flippers are gone. The last free ball costs a
    // life unless the saver is still lit; locked balls stay where they are.
    function drainBalls(s) {
        var before = s.balls.length;
        s.balls = s.balls.filter(onTable);
        if (s.balls.length === before) return;
        SND.drain();
        var free = freeBalls(s);
        if (s.multiball && free <= 1) endMultiball(s);
        if (free > 0) return;
        if (s.save > 0 && !s.tilted) {
            s.save = 0;
            serve(s, true);
            say(s, 'BALL SAVED');
            SND.knock();
            return;
        }
        s.tilted = false; s.tilt = 0;
        if (G.loseLife() > 0) { serve(s, false); say(s, 'NEXT BALL'); }
    }

    function cradled(s, b) {
        return s.flippers.some(function (f) {
            return Math.abs(f.a - f.rest) > 0.1 && G.dist(b.x, b.y, f.px, f.py) < FLIP.len + 24;
        });
    }

    // The last resort of ball search: a ball that three kicks could not move
    // from its spot is taken off the table and served again, so no wedge the
    // table might still hide can cost the player the game.
    function rescue(s, b) {
        b.x = LANE_X; b.y = PLUNGER_Y - BALL_R; b.vx = 0; b.vy = 0;
        b.inLane = true; b.kicks = 0;
        s.autoT = 0.7;
        say(s, 'BALL SEARCH');
    }

    // Ball search: a ball lying dead on the table is kicked loose, unless
    // it is that ball the player is cradling on a raised flipper.
    function searchStuck(s, dt) {
        s.balls.forEach(function (b) {
            var dead = !b.held && !b.inLane && Math.abs(b.vx) + Math.abs(b.vy) < 25;
            b.still = dead && !cradled(s, b) ? b.still + dt : 0;
            if (b.still < 2.5) return;
            b.still = 0;
            b.kicks = G.dist(b.x, b.y, b.kx, b.ky) < 30 ? b.kicks + 1 : 1;
            b.kx = b.x; b.ky = b.y;
            SND.knock();
            if (b.kicks >= 3) { rescue(s, b); return; }
            b.vx = G.rnd(-160, 160); b.vy = -320;
        });
    }

    function update(s, dt) {
        s.time += dt;
        tickTimers(s, dt);
        readControls(s);
        updatePlunger(s, dt);
        moveRover(s, dt);
        for (var i = 0; i < SUB; i++) substep(s, dt / SUB);
        updateLanes(s);
        updateSpinner(s, dt);
        s.saucers.forEach(function (sc) { updateSaucer(s, sc, dt); });
        s.magnets.forEach(function (mg, k) { updateMagnet(s, mg, k, dt); });
        drainBalls(s);
        searchStuck(s, dt);
        if (s.done >= s.need && s.pts >= s.cfg.target) G.win(1000 + G.lives * 500);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    function disc(ctx, x, y, r, color) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    function line(ctx, ax, ay, bx, by, width, color) {
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    function fieldPath(ctx) {
        ctx.beginPath();
        ctx.moveTo(XL, G.H); ctx.lineTo(XL, TOP + 60);
        ctx.arc(XL + 60, TOP + 60, 60, Math.PI, Math.PI * 1.5);
        ctx.lineTo(LANE_R - 60, TOP);
        ctx.arc(LANE_R - 60, TOP + 60, 60, Math.PI * 1.5, Math.PI * 2);
        ctx.lineTo(LANE_R, G.H);
        ctx.closePath();
    }

    // The cabinet, with a column of chase lamps on either side of the table:
    // they run all the time, so the screen is never still.
    function drawCabinet(s, ctx) {
        ctx.fillStyle = COL.cabinet;
        ctx.fillRect(0, 0, G.W, G.H);
        var head = Math.floor(s.time * 9);
        for (var i = 0; i < 15; i++) {
            var on = (i + head) % 4 === 0;
            disc(ctx, XL - 10, 104 + i * 30, 3.5, on ? COL.yellow : '#3b3320');
            disc(ctx, LANE_R + 10, 104 + (14 - i) * 30, 3.5, on ? COL.yellow : '#3b3320');
        }
    }

    function drawField(s, ctx) {
        var g = ctx.createRadialGradient(CX, 170, 20, CX, 260, 330);
        g.addColorStop(0, COL.glow); g.addColorStop(1, COL.field);
        ctx.save();
        fieldPath(ctx);
        ctx.fillStyle = g; ctx.fill();
        ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(XR, TOP, LANE_R - XR, G.H);
        // Playfield art: slowly turning dashed rings around the centre.
        ctx.setLineDash([10, 14]);
        for (var i = 1; i <= 3; i++) {
            ctx.lineDashOffset = s.time * 12 * (i % 2 ? 1 : -1);
            ctx.strokeStyle = 'rgba(32,231,242,0.10)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(CX, 250, i * 58, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
        s.lights.forEach(function (l) {
            ctx.globalAlpha = 0.18 + 0.16 * Math.sin(s.time * 3 + l.ph);
            disc(ctx, l.x, l.y, 4, COL.yellow);
        });
        ctx.restore();
    }

    function drawMagnets(s, ctx) {
        s.magnets.forEach(function (mg) {
            var live = mg.on && mg.cool <= 0;
            ctx.lineWidth = 2;
            for (var i = 0; i < 3; i++) {
                // Rings collapse into the core while the coil is live.
                var f = live ? ((i + 1 - (s.time * 1.6) % 1) / 3) : (i + 1) / 3;
                ctx.strokeStyle = live ? 'rgba(32,231,242,' + (0.75 - f * 0.55) + ')' : 'rgba(169,189,192,0.16)';
                ctx.beginPath(); ctx.arc(mg.x, mg.y, Math.max(2, mg.r * f), 0, Math.PI * 2); ctx.stroke();
            }
            disc(ctx, mg.x, mg.y, 9, live ? COL.cyan : '#28444b');
            disc(ctx, mg.x, mg.y, 4, COL.cabinet);
        });
    }

    function drawLanes(s, ctx) {
        s.lanes.forEach(function (l) {
            var lit = s.laneFlash > 0 ? Math.sin(s.time * 40) > 0 : l.lit;
            if (lit) { ctx.shadowColor = COL.yellow; ctx.shadowBlur = 12; }
            disc(ctx, l.x, 82, 8, lit ? COL.yellow : COL.dark);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = COL.muted; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(l.x, 82, 8, 0, Math.PI * 2); ctx.stroke();
        });
    }

    function drawSaucers(s, ctx) {
        s.saucers.forEach(function (sc) {
            var blink = s.lockLit && Math.sin(s.time * 8) > 0;
            disc(ctx, sc.x, sc.y, 15, blink ? COL.cyan : COL.chrome);
            disc(ctx, sc.x, sc.y, 12, '#02090b');
        });
    }

    // The spinner plate is seen edge-on, so turning shows as its height
    // swelling and shrinking, with the two faces in different colours.
    function drawSpinner(s, ctx) {
        var sp = s.spinner;
        if (!sp) return;
        var c = Math.cos(sp.ang), h = 2 + Math.abs(c) * 10;
        ctx.fillStyle = c > 0 ? COL.red : COL.chrome;
        ctx.fillRect(sp.x - sp.hw, sp.y - h / 2, sp.hw * 2, h);
        line(ctx, sp.x - sp.hw, sp.y, sp.x + sp.hw, sp.y, 1, COL.cabinet);
    }

    function drawTargets(s, ctx) {
        ctx.lineCap = 'butt';
        s.targets.forEach(function (t) {
            var color = t.standup ? '#2c7f8c' : COL.yellow;
            if (t.live) color = Math.sin(s.time * 14) > 0 ? COL.red : COL.ink;
            if (t.flash > 0) color = '#fff';
            if (t.down) line(ctx, t.ax, t.ay, t.bx, t.by, 2, '#35505a');
            else line(ctx, t.ax, t.ay, t.bx, t.by, 7, color);
        });
    }

    function drawBumpers(s, ctx) {
        s.bumpers.forEach(function (bp) {
            var lit = bp.flash > 0, r = bp.r + (lit ? 3 : 0);
            // During the last level's multiball every bumper is a jackpot.
            if (s.multiball && s.cfg.goal === 'wizard') { ctx.shadowColor = COL.cyan; ctx.shadowBlur = 10 + 8 * Math.sin(s.time * 10); }
            disc(ctx, bp.x, bp.y, r + 3, COL.chrome);
            ctx.shadowBlur = 0;
            disc(ctx, bp.x, bp.y, r - 1, lit ? '#fff' : (bp.rover ? COL.yellow : COL.red));
            disc(ctx, bp.x, bp.y, r * 0.5, COL.cabinet);
            disc(ctx, bp.x, bp.y, r * 0.22, lit ? COL.yellow : COL.muted);
        });
    }

    function drawSlings(s, ctx) {
        s.slings.forEach(function (sl) {
            var p = sl.pts;
            ctx.beginPath();
            ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]);
            ctx.closePath();
            ctx.fillStyle = sl.edge.flash > 0 ? COL.red : '#3a1420';
            ctx.fill();
            ctx.strokeStyle = COL.yellow; ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    function drawWalls(s, ctx) {
        ctx.lineCap = 'round';
        s.walls.forEach(function (w) {
            if (!w.hide) line(ctx, w.ax, w.ay, w.bx, w.by, Math.max(3, w.r * 2), w.r ? COL.cyan : COL.chrome);
        });
        ctx.setLineDash([4, 5]);
        line(ctx, XR, 47, XR, TOP + 60, 2, COL.cyan);
        ctx.setLineDash([]);
    }

    function drawFlippers(s, ctx) {
        ctx.lineCap = 'round';
        s.flippers.forEach(function (f) {
            var tx = f.px + Math.cos(f.a) * FLIP.len, ty = f.py + Math.sin(f.a) * FLIP.len;
            line(ctx, f.px, f.py, tx, ty, FLIP.r * 2 + 3, COL.chrome);
            line(ctx, f.px, f.py, tx, ty, FLIP.r * 2 - 1, s.tilted || s.hot ? '#5a2a30' : COL.red);
            disc(ctx, f.px, f.py, 4, COL.chrome);
        });
    }

    // The spring shortens as it is charged, and a bar up the lane's edge
    // shows how hard the shot will be.
    function drawPlunger(s, ctx) {
        var top = PLUNGER_Y + s.charge * 8;
        ctx.fillStyle = COL.chrome;
        ctx.fillRect(LANE_X - 8, top, 16, 4);
        ctx.strokeStyle = COL.muted; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(LANE_X - 5, top + 4);
        for (var i = 1; i <= 4; i++) ctx.lineTo(LANE_X + (i % 2 ? 5 : -5), top + 4 + (G.H - top - 4) * i / 4);
        ctx.stroke();
        ctx.fillStyle = s.charge > 0.85 ? COL.red : COL.yellow;
        ctx.fillRect(LANE_R - 6, 500 - s.charge * 150, 3, s.charge * 150);
    }

    // The blackout level: only a pool of light around the ball, wider with
    // every fuse replaced. Lightning shows the whole table for a moment.
    function drawDarkness(s, ctx) {
        var b = s.balls[0] || { x: LANE_X, y: 500 };
        var r = 85 + s.done * 26, alpha = 0.95 * (1 - 0.85 * s.bolt / 0.35);
        var g = ctx.createRadialGradient(b.x, b.y, r * 0.35, b.x, b.y, r);
        g.addColorStop(0, 'rgba(2,8,10,0)'); g.addColorStop(1, 'rgba(2,8,10,' + alpha.toFixed(3) + ')');
        ctx.save();
        fieldPath(ctx); ctx.clip();
        ctx.fillStyle = g;
        ctx.fillRect(XL, TOP, LANE_R - XL, G.H - TOP);
        ctx.restore();
        // Pilot lamps mark the fuses, so the goal can be found in the dark.
        s.saucers.forEach(function (sc, i) {
            ctx.globalAlpha = 0.35 + 0.35 * Math.sin(s.time * 5 + i * 2);
            disc(ctx, sc.x, sc.y, 3, COL.cyan);
        });
        ctx.globalAlpha = 1;
    }

    // A ball the player has flipped wears a cyan ring while lanes or magnets
    // are the mission: it shows which ball will count, and that a zap spends
    // the charge. On a phone every ball gets a halo, as it is only a few
    // pixels wide there.
    function drawBalls(s, ctx) {
        var mark = needsShot(s);
        s.balls.forEach(function (b) {
            var g = ctx.createRadialGradient(b.x - 2.5, b.y - 2.5, 0.5, b.x, b.y, BALL_R);
            g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#9daeb2'); g.addColorStop(1, '#30383b');
            if (s.touch) disc(ctx, b.x, b.y, BALL_R + 5, 'rgba(255,255,255,0.22)');
            ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
            disc(ctx, b.x, b.y, BALL_R, g);
            ctx.shadowBlur = 0;
            if (!mark || !b.shot) return;
            ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R + 3, 0, Math.PI * 2); ctx.stroke();
        });
    }

    function drawSigns(s, ctx) {
        if (s.save > 0 && Math.sin(s.time * 10) > -0.3) {
            G.text('SAVE', CX, 530, { size: 20, bold: true, color: COL.cyan, align: 'center', glow: COL.cyan });
        }
        if (s.tilted) G.text('TILT', CX, 330, { size: 54, bold: true, color: COL.red, align: 'center', glow: COL.red });
    }

    function bar(ctx, x, y, w, frac, color) {
        ctx.fillStyle = COL.dark;
        ctx.fillRect(x, y, w, 10);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w * G.clamp(frac, 0, 1), 10);
        ctx.strokeStyle = COL.muted; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, 10);
    }

    function lamp(ctx, x, y, text, on) {
        disc(ctx, x + 7, y - 7, 7, on ? COL.cyan : COL.dark);
        G.text(text, x + 24, y, { size: 20, bold: on, color: on ? COL.ink : '#5d767b' });
    }

    // The three reminders at the foot of the card name the keys, or on a
    // phone the pad's own labels.
    function helpLines(s) {
        if (s.touch) return ['◀ flips left', 'PLUNGE flips ▶', 'Hold / let go', 'NUDGE: 3 = tilt'];
        return ['← →  flippers', 'SPACE  plunger (hold)', '↓  nudge (3 = tilt)'];
    }

    // Left of the table: the mission card with both progress bars and the
    // state lamps. Everything is set in 20px type or more: on a phone the
    // canvas is drawn at about half size.
    function drawMission(s, ctx) {
        if (s.touch) { drawPhoneMission(s, ctx); return; }
        var x = 16, w = 262, v = goalView(s), y = 276;
        G.text('MISSION ' + s.level, x, 62, { size: 20, bold: true, color: COL.yellow });
        s.cfg.brief.forEach(function (text, i) { G.text(text, x, 88 + i * 24, { size: 20, color: COL.ink, max: w }); });
        G.text(goalText(s), x, 178, { size: 20, bold: true, color: COL.cyan, max: w });
        bar(ctx, x, 186, w, v.done / v.need, COL.cyan);
        G.text('POINTS ' + s.pts + ' / ' + s.cfg.target, x, 226, { size: 20, bold: true, color: COL.yellow, max: w });
        bar(ctx, x, 234, w, s.pts / s.cfg.target, COL.yellow);
        lamp(ctx, x, y, 'BALL SAVER', s.save > 0);
        // The lock lamps only exist on the two tables that have locks.
        if (s.cfg.locks) {
            lamp(ctx, x, y += 28, s.locked ? 'LOCKED ' + s.locked + ' / 2' : 'LOCKS LIT', s.lockLit);
            lamp(ctx, x, y += 28, 'MULTIBALL x2', s.multiball);
        }
        G.text('TILT', x, y + 34, { size: 20, color: COL.muted });
        for (var i = 0; i < 3; i++) disc(ctx, x + 76 + i * 22, y + 27, 7, s.tilted || s.tilt > i + 0.05 ? COL.red : COL.dark);
        var help = helpLines(s);
        help.forEach(function (text, k) { G.text(text, x, 520 - (help.length - 1 - k) * 24, { size: 20, color: COL.muted, max: w }); });
    }

    // Phone text gets its own spacing instead of shrinking long lines to
    // fit the desktop card. The physical table stays exactly the same.
    function drawPhoneMission(s, ctx) {
        var x = 16, w = 262, v = goalView(s), y = 280;
        G.text('MISSION ' + s.level, x, 64, { size: 24, bold: true, color: COL.yellow });
        PHONE_BRIEF[s.level - 1].forEach(function (text, i) { G.text(text, x, 96 + i * 28, { size: 24, color: COL.ink }); });
        var goal = mustRelock(s) ? 'RE-LOCK ' + s.locked + '/2' : goalText(s);
        G.text(goal, x, 190, { size: 24, bold: true, color: COL.cyan });
        bar(ctx, x, 200, w, v.done / v.need, COL.cyan);
        G.text(s.pts + '/' + s.cfg.target + ' PTS', x, 246, { size: 24, bold: true, color: COL.yellow, max: w });
        bar(ctx, x, 256, w, s.pts / s.cfg.target, COL.yellow);
        G.text(s.save > 0 ? 'BALL SAVER ON' : 'BALL SAVER OFF', x, y + 22, { size: 24, color: s.save > 0 ? COL.cyan : COL.muted });
        if (s.cfg.locks) {
            G.text(s.locked ? 'LOCKED ' + s.locked + '/2' : (s.lockLit ? 'LOCKS LIT' : 'LOCKS UNLIT'), x, y += 54, { size: 24, color: s.lockLit ? COL.cyan : COL.muted });
            G.text(s.multiball ? 'MULTIBALL x2' : 'MULTIBALL OFF', x, y + 30, { size: 24, color: s.multiball ? COL.cyan : COL.muted });
        }
        helpLines(s).forEach(function (text, i) { G.text(text, x, 436 + i * 28, { size: 24, color: COL.muted }); });
    }

    // A flickering arc between two electrodes on the backglass.
    function drawArc(s, ctx, x, y0, y1) {
        ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2;
        ctx.shadowColor = COL.cyan; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, y0);
        for (var i = 1; i < 10; i++) {
            ctx.lineTo(x + Math.sin(s.time * 17 + i * 2.3) * 12 + Math.sin(s.time * 31 + i * 5.1) * 7, G.lerp(y0, y1, i / 10));
        }
        ctx.lineTo(x, y1); ctx.stroke();
        ctx.shadowBlur = 0;
        disc(ctx, x, y0, 7, COL.chrome);
        disc(ctx, x, y1, 7, COL.chrome);
    }

    function backglassHint(s) {
        if (s.msgT > 0) return s.msg;
        if (restingBall(s) && s.autoT <= 0) return s.touch ? 'HOLD PLUNGE, LET GO' : 'HOLD SPACE TO PLUNGE';
        return s.done >= s.need ? 'MAKE THE POINTS' : goalText(s);
    }

    // Right of the table: the backglass with the marquee, the level's score
    // reel and the latest call-out.
    function drawBackglass(s, ctx) {
        var x = 692, w = 244, mid = x + w / 2, head = Math.floor(s.time * 8);
        ctx.fillStyle = COL.field;
        ctx.fillRect(x, 48, w, 190);
        ctx.strokeStyle = COL.chrome; ctx.lineWidth = 2;
        ctx.strokeRect(x, 48, w, 190);
        for (var i = 0; i < 13; i++) {
            var on = (i + head) % 3 === 0;
            disc(ctx, x + 2 + i * 20, 48, 3.5, on ? COL.yellow : '#3b3320');
            disc(ctx, x + 2 + (12 - i) * 20, 238, 3.5, on ? COL.yellow : '#3b3320');
        }
        G.text('ELECTRO', mid + 2, 102, { size: 40, bold: true, color: COL.red, align: 'center' });
        G.text('ELECTRO', mid, 100, { size: 40, bold: true, color: COL.yellow, align: 'center' });
        G.text('BALL', mid, 138, { size: 30, bold: true, color: COL.cyan, align: 'center', glow: COL.cyan });
        ctx.fillStyle = '#02090b';
        ctx.fillRect(x + 22, 154, w - 44, 46);
        G.text(('0000000' + s.pts).slice(-7), mid, 189, { size: 32, bold: true, color: COL.yellow, align: 'center' });
        if (s.touch) drawPhoneStatus(s, ctx, x, w);
        else {
            G.text(backglassHint(s), mid, 229, { size: 20, bold: true, color: COL.ink, align: 'center', max: w - 16 });
            drawArc(s, ctx, mid, 290, 470);
        }
    }

    // A call-out cannot hide the coil and tilt warnings. Wrapping preserves
    // the type size, including when both warnings and a mission event fire.
    function drawPhoneStatus(s, ctx, x, w) {
        var words = backglassHint(s).split(' '), lines = [], line = '';
        ctx.font = G.font(24, true);
        words.forEach(function (word) {
            var next = line ? line + ' ' + word : word;
            if (line && ctx.measureText(next).width > w - 16) { lines.push(line); line = word; }
            else line = next;
        });
        lines.push(line);
        lines.forEach(function (text, i) { G.text(text, x + 8, 274 + i * 28, { size: 24, bold: true, color: COL.ink }); });
        var color = s.hot || s.heat >= HEAT.warn ? COL.red : COL.cyan;
        G.text(s.hot ? 'COILS HOT' : (s.heat >= HEAT.warn ? 'COILS WARM' : 'COILS READY'), x + 8, 402, { size: 24, bold: true, color: color });
        bar(ctx, x + 8, 414, w - 16, s.heat / HEAT.trip, color);
        G.text(s.tilted ? 'TILT: REST' : (s.tilt >= 1.5 ? 'NUDGE DANGER' : 'NUDGE / TILT'), x + 8, 464, { size: 24, bold: true, color: s.tilted || s.tilt >= 1.5 ? COL.red : COL.muted });
        for (var i = 0; i < 3; i++) disc(ctx, x + 22 + i * 36, 486, 10, s.tilted || s.tilt > i + 0.05 ? COL.red : COL.dark);
    }

    function draw(s, ctx) {
        drawCabinet(s, ctx);
        drawField(s, ctx);
        drawMagnets(s, ctx);
        drawLanes(s, ctx);
        drawSaucers(s, ctx);
        drawSpinner(s, ctx);
        drawTargets(s, ctx);
        drawSlings(s, ctx);
        drawBumpers(s, ctx);
        drawWalls(s, ctx);
        drawPlunger(s, ctx);
        if (s.cfg.dark) drawDarkness(s, ctx);
        // Flippers and balls are drawn over the darkness: the blackout hides
        // the table, not the player's own tools.
        drawFlippers(s, ctx);
        drawBalls(s, ctx);
        drawSigns(s, ctx);
        drawMission(s, ctx);
        drawBackglass(s, ctx);
    }

    // Kept short: the engine sets this right of the score, and a longer
    // line runs into it. The card beside the table has the full wording.
    function hud(s) {
        var v = goalView(s);
        return (mustRelock(s) ? 'RE-LOCK ' + s.locked + '/2' : v.label + ' ' + v.done + '/' + v.need) + '  ' + s.pts + '/' + s.cfg.target;
    }

    G.register('pinball', {
        title: 'ELECTRO BALL',
        blurb: 'Keep the ball alive, finish the mission and make the points.',
        controls: [
            '← → flippers (shift the lane lights) · wild flapping overheats them',
            'SPACE / PLUNGE: hold to charge the plunger, release to serve',
            '↓ / NUDGE nudge the table — three in quick succession and it tilts',
            'Phone: tap a side to flip; PLUNGE is the right flipper too'
        ],
        levelNames: ['First Spark', 'Lane Change', 'Drop Zone', 'Dynamo', 'Lock & Load', 'Rover', 'Magneto', 'Hot Wire', 'Blackout', 'Overload'],
        colors: { bg: COL.cabinet, fg: COL.ink, accent: COL.yellow, dim: COL.muted },
        lives: 4,
        // A ragtime-flavoured stride: oom-pah bass on root, octave and fifth,
        // off-beat chord stabs, and a syncopated lead over I-I-IV-IV-I-vi-ii-V.
        music: {
            bpm: 118, root: 43, scale: 'major', prog: [0, 0, 3, 3, 0, 5, 1, 4],
            bass: 'x...o...5...o...',
            lead: [
                '7.9b.9b.c.b.9.7.', '9.b7.b9.7---4.5.', 'a.ca.c7.a.c.e.c.', 'c.a.7.a.c---b.a.',
                '9.b9.7.9b.9.7.4.', 'c.9c.7.9c.7.5.7.', '8.a8.c.a8.a.c.a.', 'b.8b.6.4b.8.6.4.'
            ],
            arp: '..2...3...2...1.',
            drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.xxx.x.' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOct: 1
        },
        init: init, update: update, draw: draw, hud: hud,
        // ◀ ▶ alone make the widest buttons and leave the most canvas; A and B
        // take the plunger and the nudge (see readInput for A's second job).
        touch: { a: 'PLUNGE', b: 'NUDGE', hide: ['up', 'down'] }
    });
})();
