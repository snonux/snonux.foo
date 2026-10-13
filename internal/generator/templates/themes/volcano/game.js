/*
 * Magma Rising — the volcano theme's game.
 *
 * A climber is trapped at the bottom of a volcanic shaft and the lava never
 * stops rising. Run, jump and wall-kick from ledge to ledge up to the crater
 * rim. Ledges may be solid, crumbling (they fall and re-form) or drifting;
 * steam geysers carry the climber up through gaps too tall to jump. Lava
 * bombs and fire bats only knock the climber about — the one thing that
 * kills is lava itself, whether the rising lake or a lava-fall column.
 *
 * World coordinates: y = 0 is the shaft floor and y grows downward, so the
 * climb goes toward negative y. Each shaft is one chain of ledges built from
 * a seed, every link of which is reachable from the one below it.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var WL = 180, WR = 780, SHAFT = WR - WL;                 // inner faces of the shaft walls
    var PW = 20, PH = 30, LEDGE_H = 14, PHONE_X_SCALE = 1.35;
    var GRAV = 1800, RUN = 280, JUMP = 700, KICK = 640, KICK_VX = 340, SLIDE = 110, MAX_FALL = 900;
    // The lava never trails the highest ledge reached by more than this:
    // five or six ledges, so a missed jump that ends on a ledge further down
    // can still be climbed out of.
    var LEASH = 440;
    var STEAM_H = 300, STEAM_LIFT = 620, REFORM = 2.2;
    // Seconds a crumbling ledge holds once stood on: long enough to land,
    // look for the next ledge and still jump.
    var CRUMBLE = 1.2;
    // The lava starts this far under the shaft floor: about ten seconds on
    // level 1 for a newcomer to find the keys before it comes through.
    var LAVA_START = 340, CAM_FLOOR = -480;
    // The climber's height on the screen: normally low (CAM_LEAD) to show the
    // climb ahead, higher (CAM_NEAR) while that brings close lava into view.
    var CAM_LEAD = 320, CAM_NEAR = 250, LAVA_VIEW = G.H - 24;
    // A lava-fall is 24 px wide and the climber overhangs a ledge by up to
    // 16 px, so a ledge this far from a column's middle is safe to stand on.
    var FALL_CLEAR = 34, SURGE = 70;
    var C = {
        bg: '#0d0802', rock: '#1d1008', rockLit: '#3a2010', ledge: '#4a2c18', crumble: '#74502f',
        slab: '#2c2a33', lava: '#ff4400', ember: '#ff8c00', hot: '#ffcc00', cream: '#ffe8cc', dim: '#a8744a'
    };

    // One row per level: shaft height, lava speed (px/s), share of crumbling
    // and drifting ledges, number of geysers / wall-kick gaps / bats /
    // lava-falls, seconds between bombs, quakes and lava surges (0 = none).
    // Every geyser, wall-kick gap and lava-fall listed is really built: the
    // upper shafts are crowded and end up to 10% higher than `h` for it.
    // The lava stops getting faster at level 6: from there on the climb gets
    // longer and busier instead, and a climber who hesitates on every other
    // ledge and misjudges landings still gets up level 10 in about two
    // tries of three with the four lives.
    var LEVELS = [
        { h: 2800, lava: 32, cr: 0, mv: 0, gey: 0, wall: 0, bomb: 0, bats: 0, quake: 0, falls: 0, surge: 0 },
        { h: 3000, lava: 35, cr: 0.28, mv: 0, gey: 0, wall: 2, bomb: 0, bats: 0, quake: 0, falls: 0, surge: 0 },
        { h: 3200, lava: 38, cr: 0.25, mv: 0.22, gey: 0, wall: 2, bomb: 0, bats: 0, quake: 0, falls: 0, surge: 0 },
        { h: 3400, lava: 41, cr: 0.3, mv: 0.2, gey: 3, wall: 2, bomb: 0, bats: 0, quake: 0, falls: 0, surge: 0 },
        { h: 3600, lava: 41, cr: 0.3, mv: 0.2, gey: 3, wall: 3, bomb: 2.4, bats: 0, quake: 0, falls: 0, surge: 0 },
        { h: 3800, lava: 42, cr: 0.3, mv: 0.22, gey: 3, wall: 3, bomb: 2.4, bats: 5, quake: 0, falls: 0, surge: 0 },
        { h: 4000, lava: 42, cr: 0.32, mv: 0.22, gey: 4, wall: 3, bomb: 2.3, bats: 5, quake: 10, falls: 0, surge: 0 },
        { h: 4300, lava: 42, cr: 0.34, mv: 0.25, gey: 3, wall: 3, bomb: 2.2, bats: 6, quake: 10, falls: 5, surge: 0 },
        { h: 4600, lava: 42, cr: 0.34, mv: 0.25, gey: 4, wall: 3, bomb: 2.2, bats: 7, quake: 10, falls: 5, surge: 12 },
        { h: 5200, lava: 42, cr: 0.36, mv: 0.25, gey: 4, wall: 3, bomb: 2.0, bats: 8, quake: 9, falls: 6, surge: 13 }
    ];

    // Cheap repeatable noise for decoration that needs no stored state.
    function hash(n) {
        var x = Math.sin(n * 127.1 + 3.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // ------------------------------------------------------------------
    // Shaft generation
    // ------------------------------------------------------------------

    function makeLedge(x, y, w, kind) {
        return { x: x, y: y, w: w, kind: kind, bx: x, amp: 0, sp: 0, ph: 0, dx: 0, state: 'idle', t: 0, vent: null, hint: 0, i: 0 };
    }

    function push(b, l) {
        l.i = b.ledges.length;
        b.ledges.push(l);
        return l;
    }

    function ledgeWidth(b) {
        return 126 - b.level * 5 + b.rnd() * 40;
    }

    // A drifting ledge never follows another one or a special step: jumping
    // between two moving targets would turn a timing puzzle into luck.
    function pickKind(b, prev) {
        var r = b.rnd(), c = b.cfg;
        if (b.ledges.length < 3) return 'solid';
        if (r < c.mv && prev.kind !== 'move' && b.since > 0) return 'move';
        return r < c.mv + c.cr ? 'crumble' : 'solid';
    }

    // The ordinary link: 58-96 px up and at most an 80 px gap sideways, well
    // inside one jump (136 px high, about 140 px far). `seek` (-1/1) forces
    // the chain toward that wall so a wall-kick gap can be built there.
    function stepNormal(b, prev, seek) {
        var rnd = b.rnd, kind = pickKind(b, prev), slow = kind === 'move' || prev.kind === 'move';
        var w = ledgeWidth(b), dy = slow ? 58 + rnd() * 22 : 62 + rnd() * 34;
        var gap = seek ? 20 + rnd() * 50 : -30 + rnd() * (slow ? 70 : 110);
        var amp = kind === 'move' ? 40 + rnd() * 22 : 0;
        if (seek) b.dir = seek; else if (rnd() < 0.4) b.dir = -b.dir;
        var want = prev.bx + prev.w / 2 + b.dir * (prev.w / 2 + w / 2 + gap) - w / 2;
        if (prev.floor) want = WL + rnd() * (SHAFT - w);
        if (b.guardN > 0 && amp) { kind = 'solid'; amp = 0; }
        var room = b.guardN > 0 ? guardRoom(b.guard, w) : { lo: WL + amp, hi: WR - w - amp, w: w };
        var x = G.clamp(want, room.lo, room.hi);
        if (x !== want) b.dir = -b.dir;          // ran into a wall: zigzag back
        var l = push(b, makeLedge(x, prev.y - dy, room.w, kind));
        if (amp) { l.amp = amp; l.sp = 1.1 + rnd() * 0.7; l.ph = rnd() * 6.28; }
        b.since++;
        b.guardN = Math.max(0, b.guardN - 1);
    }

    // The two ledges after a lava-fall reach up past the column's top, so
    // they are kept on its far side (narrowed if need be) and do not drift:
    // neither standing on them nor jumping between them may cross the column.
    function guardRoom(f, w) {
        var lo = f.side > 0 ? f.x + FALL_CLEAR : WL, hi = f.side > 0 ? WR : f.x - FALL_CLEAR;
        w = Math.min(w, hi - lo);
        return { lo: lo, hi: hi - w, w: w };
    }

    // A gap of about 175 px is beyond any jump: the only way up is to jump
    // beside the wall and kick off it. Returns false (and asks the next
    // ordinary step to head for the wall) while the chain is too far away.
    function stepWall(b, prev) {
        if (prev.kind === 'move') return false;
        var rnd = b.rnd, dl = prev.x - WL, dr = WR - prev.x - prev.w, side = dl < dr ? -1 : 1, wk = 110, wt = 130;
        if (Math.min(dl, dr) - wk > 70) { b.seek = side; return false; }
        var base = push(b, makeLedge(side < 0 ? WL : WR - wk, prev.y - 62 - rnd() * 20, wk, 'solid'));
        var off = 45 + rnd() * 25;
        base.hint = side;
        push(b, makeLedge(side < 0 ? WL + off : WR - wt - off, base.y - 168 - rnd() * 14, wt, 'solid'));
        return true;
    }

    // A vent in the middle of the previous ledge; the next ledge sits
    // 235-280 px higher and to one side, so the climber rides the steam up
    // and steers off it.
    function stepGeyser(b, prev) {
        if (prev.kind === 'move' || prev.floor) return false;
        var rnd = b.rnd, vx = prev.x + prev.w / 2, w = 130, off = 34 + rnd() * 40;
        var fitsR = vx + off + w <= WR, fitsL = vx - off - w >= WL;
        var dir = (b.dir > 0 ? fitsR : !fitsL) ? 1 : -1;
        prev.kind = 'solid';
        prev.vent = { x: vx, period: 2.6, on: 1.1, ph: rnd() * 2.6, was: false };
        var l = push(b, makeLedge(dir > 0 ? vx + off : vx - off - w, prev.y - 235 - rnd() * 45, w, 'solid'));
        b.gems.push({ x: vx, y: prev.y - 110, got: false }, { x: vx, y: l.y - 20, got: false });
        return true;
    }

    // Whether a geyser on ledge `l` could throw the climber into a column at
    // `fx` whose foot is at `y1`: the ride ends up to about 440 px above the
    // vent, anywhere between the vent and the ledge it leads to.
    function geyserReaches(b, l, fx, y1) {
        if (!l.vent || l.y - 480 > y1) return false;
        var to = b.ledges[l.i + 1];
        return fx > Math.min(l.vent.x, to.x) - 60 && fx < Math.max(l.vent.x, to.x + to.w) + 60;
    }

    // The outermost edge, toward `dir`, of every ledge (over its whole
    // drift) from which a jump reaches the foot of a column at height y1:
    // 170 px is a full jump plus the climber's own height.
    function reachEdge(b, dir, y1) {
        return b.ledges.reduce(function (far, l) {
            if (l.y - 170 > y1) return far;
            return dir > 0 ? Math.max(far, l.bx + l.w + l.amp) : Math.min(far, l.bx - l.amp);
        }, dir > 0 ? WL : WR);
    }

    // Where a lava-fall of the sizes in `f` fits on the `dir` side of
    // `prev`. The ledge to wait on (at `ax`) reaches at least as far that
    // way as every ledge below it, so no jump on the way up passes under the
    // column (at `fx`); the ledge to jump to starts at `bx`. Returns null if
    // the waiting ledge would be out of reach from `prev`, the far ledge
    // would not fit before the wall, or a geyser could throw the climber
    // into the column.
    function fallSite(b, prev, dir, f) {
        var far = reachEdge(b, dir, f.y + 30);
        far = dir > 0 ? Math.max(far, WL + f.wa) : Math.min(far, WR - f.wa);
        var ax = dir > 0 ? far - f.wa : far, fx = far + dir * f.gap / 2;
        var hop = dir > 0 ? ax - prev.x - prev.w : prev.x - ax - f.wa;
        var fits = dir > 0 ? far + f.gap + f.wb <= WR : far - f.gap - f.wb >= WL;
        if (hop > 80 || !fits) return null;
        if (b.ledges.some(function (l) { return geyserReaches(b, l, fx, f.y + 30); })) return null;
        return { dir: dir, ax: ax, fx: fx, bx: dir > 0 ? far + f.gap : far - f.gap - f.wb };
    }

    // A lava-fall is a set piece of two ledges: one to wait on and, past a
    // wide gap with the column in its middle, the one to jump to. The column
    // switches on and off, so the jump has to be timed. Both ledges are
    // solid: a crumbling one to wait on would drop the climber before the
    // fall stops, and a crumbling one to jump to can be shaken loose by a
    // quake for longer than the lava leaves the climber to wait. Returns
    // false while it fits on neither side; it is then tried from the next
    // ledge.
    function stepFall(b, prev) {
        if (prev.kind === 'move' || prev.vent || prev.floor) return false;
        var rnd = b.rnd, f = { wa: ledgeWidth(b), wb: ledgeWidth(b), gap: 76 + rnd() * 10, y: prev.y - 62 - rnd() * 34 };
        var site = fallSite(b, prev, b.dir, f) || fallSite(b, prev, -b.dir, f);
        if (!site) return false;
        push(b, makeLedge(site.ax, f.y, f.wa, 'solid'));
        var next = push(b, makeLedge(site.bx, f.y - 60 - rnd() * 20, f.wb, 'solid'));
        // `side` is the side of the column the climb goes on: stepNormal
        // keeps the next two ledges there.
        b.guard = {
            x: site.fx, w: 24, side: site.dir,
            y0: next.y - 110, y1: f.y + 30, period: 3.4, on: 1.4, ph: rnd() * 3.4, was: false
        };
        b.falls.push(b.guard);
        b.guardN = 2;
        b.dir = site.dir;
        return true;
    }

    // Spreads the level's special steps over the shaft's height, leaving the
    // first 150 px and the last stretch below the rim plain.
    function planEvents(cfg, rnd) {
        var events = [];
        [['wall', cfg.wall], ['geyser', cfg.gey], ['fall', cfg.falls]].forEach(function (e) {
            for (var k = 0; k < e[1]; k++) {
                events.push({ type: e[0], at: 150 + (cfg.h - 650) * (k + 0.3 + rnd() * 0.4) / e[1] });
            }
        });
        return events.sort(function (a, c) { return a.at - c.at; });
    }

    var SPECIAL = { wall: stepWall, geyser: stepGeyser, fall: stepFall };

    function topLedge(b) { return b.ledges[b.ledges.length - 1]; }

    // Two plain steps between specials keep each one readable on its own.
    // A special that is due but does not fit on this ledge waits for a later
    // one, and must not hold up the specials planned after it: otherwise the
    // upper shaft would run out before all of them were built.
    function addStep(b) {
        var prev = topLedge(b), ev = b.events;
        b.seek = 0;
        for (var k = 0; b.since >= 2 && k < ev.length && ev[k].at <= -prev.y; k++) {
            if (!SPECIAL[ev[k].type](b, prev)) continue;
            ev.splice(k, 1);
            b.since = 0;
            return;
        }
        stepNormal(b, prev, b.seek);
    }

    function placeExtras(b) {
        var n = b.ledges.length, rnd = b.rnd, k, l;
        for (k = 2; k < n - 1; k++) {
            l = b.ledges[k];
            if (l.kind !== 'move' && !l.vent && rnd() < 0.4) b.gems.push({ x: l.x + l.w / 2, y: l.y - 22, got: false });
        }
        // Bats patrol above head height of a ledge, so standing is safe and
        // only a badly timed jump meets them.
        for (k = 0; k < b.cfg.bats; k++) {
            l = b.ledges[2 + Math.floor((k + 0.5) / b.cfg.bats * (n - 5))];
            b.bats.push({ x: WL + 40 + rnd() * (SHAFT - 80), y0: l.y - 74, y: l.y - 74, dir: rnd() < 0.5 ? -1 : 1, sp: 105 + rnd() * 50, ph: rnd() * 6 });
        }
    }

    // The shaft ends at the level's height, but not before every planned
    // special step is built (a crowded shaft may grow by up to 600 px for
    // that) and not on a ledge that is still being kept clear of a
    // lava-fall: the rim spans the whole shaft, column included.
    function shaftDone(b) {
        var y = -topLedge(b).y;
        if (b.guardN > 0) return false;
        return y >= b.cfg.h - 150 && (!b.events.length || y >= b.cfg.h + 600);
    }

    function buildShaft(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 7919 + 101);
        var floor = makeLedge(WL, 0, SHAFT, 'solid');
        floor.floor = true;
        var b = { level: level, cfg: cfg, rnd: rnd, ledges: [floor], falls: [], gems: [], bats: [], dir: 1, since: 0, seek: 0, guard: null, guardN: 0, events: planEvents(cfg, rnd) };
        while (!shaftDone(b)) addStep(b);
        var rim = push(b, makeLedge(WL, topLedge(b).y - 78, SHAFT, 'solid'));
        rim.rim = true;
        placeExtras(b);
        return b;
    }

    function init(level) {
        var b = buildShaft(level), rim = b.ledges[b.ledges.length - 1];
        var s = {
            cfg: b.cfg, ledges: b.ledges, falls: b.falls, gems: b.gems, bats: b.bats, bombs: [], rimY: rim.y,
            p: {
                x: G.W / 2 - PW / 2, y: -PH, vx: 0, vy: 0, ground: true, on: b.ledges[0], wall: 0, wallUsed: 0,
                coy: 0, buf: 0, cut: false, stun: 0, inv: 0, face: 1, run: 0
            },
            touch: G.isTouch(), lavaY: LAVA_START, bestY: 0, camY: CAM_FLOOR, time: 0, top: 0, gemsGot: 0,
            bombT: b.cfg.bomb, quakeT: b.cfg.quake, quakeWarn: false,
            surgeT: b.cfg.surge, surgeLeft: 0, surgeWarn: false, rumbleT: 0.4, slideT: 0
        };
        G.cam.y = s.camY;
        return s;
    }

    // ------------------------------------------------------------------
    // Sounds
    // ------------------------------------------------------------------

    function sndJump() { G.tone(290, 0.13, { type: 'triangle', slide: 560, vol: 0.15 }); }
    function sndKick() {
        G.tone(430, 0.11, { slide: 920, vol: 0.11 });
        G.noise(0.07, { freq: 2200, vol: 0.1 });
    }
    function sndLand() { G.noise(0.07, { freq: 320, vol: 0.14 }); }
    function sndCrack() { G.noise(0.2, { filter: 'bandpass', freq: 950, slide: 300, q: 3, vol: 0.2 }); }
    function sndCollapse() { G.noise(0.45, { freq: 520, slide: 70, vol: 0.24 }); }
    function sndSteam() { G.noise(0.9, { filter: 'highpass', freq: 2400, slide: 5200, vol: 0.09, attack: 0.12 }); }
    function sndWhistle() { G.tone(1250, 0.55, { type: 'sine', slide: 380, vol: 0.05 }); }
    function sndGem() {
        G.tone(1175, 0.06, { type: 'triangle', vol: 0.14 });
        G.tone(1760, 0.16, { type: 'triangle', vol: 0.12, delay: 0.06 });
    }
    function sndKnock() {
        G.tone(190, 0.22, { type: 'sawtooth', slide: 70, vol: 0.2 });
        G.noise(0.12, { freq: 800, vol: 0.18 });
    }
    function sndQuake() {
        G.noise(1.5, { freq: 130, vol: 0.4, attack: 0.3 });
        G.tone(52, 1.3, { type: 'sine', slide: 38, vol: 0.32, attack: 0.2 });
    }
    function sndLavaFall() { G.noise(0.5, { filter: 'bandpass', freq: 650, slide: 240, vol: 0.13, attack: 0.08 }); }
    function sndBurn() {
        G.noise(0.8, { filter: 'bandpass', freq: 3200, slide: 350, vol: 0.32 });
        G.tone(210, 0.6, { type: 'sawtooth', slide: 45, vol: 0.2 });
    }

    function viewX(s, x) { return s.touch ? G.W / 2 + (x - G.W / 2) * PHONE_X_SCALE : x; }

    // Engine particles are painted after draw(), outside the world's scale.
    function burst(s, x, y, options) { G.burst(viewX(s, x), y, options); }

    function onScreen(s, y) { return y > s.camY - 30 && y < s.camY + G.H + 30; }

    // The rumbling bed: one long low noise burst every 1.5 s (never per
    // tick), louder the closer the lava is to the climber's feet.
    function ambience(s, dt) {
        s.rumbleT -= dt;
        if (s.rumbleT > 0) return;
        s.rumbleT = 1.5;
        var close = G.clamp(1 - (s.lavaY - s.p.y - PH) / LEASH, 0, 1);
        G.noise(1.9, { freq: 70 + close * 90, vol: 0.05 + close * 0.14, attack: 0.5 });
    }

    // ------------------------------------------------------------------
    // Ledges, geysers and lava-falls
    // ------------------------------------------------------------------

    // Geysers and lava-falls share one on/off clock shape.
    function cycle(o, time) { return (time + o.ph) % o.period; }
    function isOn(o, time) { return cycle(o, time) < o.on; }
    function isWarning(o, time) { return cycle(o, time) > o.period - 0.7; }

    // True on the tick the source switches on, so its sound plays once.
    function switchedOn(o, time) {
        var on = isOn(o, time), edge = on && !o.was;
        o.was = on;
        return edge;
    }

    function startCrumble(l, delay) {
        if (l.kind !== 'crumble' || l.state !== 'idle') return;
        l.state = 'shake'; l.t = delay;
    }

    // A crumbled ledge re-forms after REFORM seconds: without that, one fall
    // back down the shaft could leave the climb impossible.
    function tickCrumble(s, l, dt) {
        if (l.state === 'idle') return;
        l.t -= dt;
        if (l.t > 0) return;
        if (l.state === 'shake') {
            l.state = 'gone'; l.t = REFORM;
            burst(s, l.x + l.w / 2, l.y + 6, { n: 14, color: C.crumble, speed: 120, gravity: 900, size: 5, life: 0.8 });
            if (onScreen(s, l.y)) sndCollapse();
        } else {
            l.state = 'idle';
            burst(s, l.x + l.w / 2, l.y + 6, { n: 8, color: C.ember, speed: 60, life: 0.4 });
        }
    }

    function updateLedges(s, dt) {
        s.ledges.forEach(function (l) {
            if (l.amp) {
                var nx = l.bx + Math.sin(s.time * l.sp + l.ph) * l.amp;
                l.dx = nx - l.x; l.x = nx;
            }
            tickCrumble(s, l, dt);
            if (l.vent && switchedOn(l.vent, s.time) && onScreen(s, l.y)) sndSteam();
        });
    }

    // Steam carries the climber up at a steady speed for as long as the vent
    // blows and the climber stays inside the column.
    function steamLift(s, p, dt) {
        var feet = p.y + PH, cx = p.x + PW / 2;
        s.ledges.forEach(function (l) {
            var v = l.vent;
            if (!v || !isOn(v, s.time) || Math.abs(cx - v.x) > 26) return;
            if (feet > l.y + 1 || feet < l.y - STEAM_H) return;
            p.vy = Math.max(-STEAM_LIFT, p.vy - 5200 * dt);
            p.cut = false;
        });
    }

    function updateFalls(s) {
        var p = s.p, dead = false;
        s.falls.forEach(function (f) {
            if (switchedOn(f, s.time) && onScreen(s, f.y1)) sndLavaFall();
            if (!isOn(f, s.time)) return;
            if (G.aabb({ x: p.x, y: p.y, w: PW, h: PH }, { x: f.x - f.w / 2, y: f.y0, w: f.w, h: f.y1 - f.y0 })) dead = true;
        });
        return dead;
    }

    // ------------------------------------------------------------------
    // The climber
    // ------------------------------------------------------------------

    // Running has inertia: quick on a ledge, looser in the air.
    function steer(p, dt) {
        var dir = p.stun > 0 ? 0 : (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        var rate = (dir ? (p.ground ? 2600 : 1700) : (p.ground ? 2400 : 400)) * dt;
        p.vx += G.clamp(dir * RUN - p.vx, -rate, rate);
        if (dir) p.face = dir;
        if (p.ground && dir) p.run += dt * 16;
        return dir;
    }

    // A press is remembered for a moment (buffer) and a ledge just left
    // still counts (coyote time), which makes edge jumps feel fair. Each
    // wall grants one kick until the climber touches a ledge again.
    function tryJump(s, p) {
        if (G.hit.a) p.buf = 0.15;
        if (p.buf <= 0 || p.stun > 0) return;
        if (p.coy > 0) {
            p.vy = -JUMP; p.coy = 0; p.buf = 0; p.cut = true;
            sndJump();
        } else if (p.wall && p.wallUsed !== p.wall) {
            p.vy = -KICK; p.vx = -p.wall * KICK_VX; p.wallUsed = p.wall; p.buf = 0; p.cut = false; p.face = -p.wall;
            sndKick();
            burst(s, p.wall < 0 ? WL : WR, p.y + PH, { n: 8, color: C.dim, speed: 140, angle: p.wall < 0 ? 0 : Math.PI, spread: 1.6, life: 0.35 });
        }
    }

    function ledgeUnder(s, p, feetBefore) {
        var feet = p.y + PH;
        for (var i = 0; i < s.ledges.length; i++) {
            var l = s.ledges[i];
            if (l.state === 'gone' || feetBefore > l.y + 0.5 || feet < l.y) continue;
            if (p.x + PW - 4 > l.x && p.x + 4 < l.x + l.w) return l;
        }
        return null;
    }

    function landOn(s, p, l, wasGround, impact) {
        p.y = l.y - PH; p.vy = 0; p.coy = 0.12; p.wallUsed = 0;
        if (!wasGround && impact > 350) {
            sndLand();
            burst(s, p.x + PW / 2, l.y, { n: 5, color: C.dim, speed: 70, angle: -Math.PI / 2, spread: 2.4, life: 0.3 });
        }
        if (l.i > s.top) { G.addScore((l.i - s.top) * 10 * G.level); s.top = l.i; s.bestY = l.y; }
        if (l.kind === 'crumble' && l.state === 'idle') { startCrumble(l, CRUMBLE); sndCrack(); }
    }

    // Ledges are one-way: the climber passes up through them and lands only
    // when the feet cross a ledge top while falling.
    function movePlayer(s, p, dt, dir) {
        var feet = p.y + PH, wasGround = p.ground;
        if (p.cut && !G.key.a && p.vy < -260) { p.vy = -260; p.cut = false; }   // short hop on a short press
        p.vy = Math.min(MAX_FALL, p.vy + GRAV * dt);
        if (p.wall && dir === p.wall && p.vy > SLIDE) p.vy = SLIDE;              // wall slide
        if (p.on) p.x += p.on.dx;                                               // ride a drifting ledge
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.wall = p.x <= WL + 3 ? -1 : (p.x >= WR - PW - 3 ? 1 : 0);
        if (p.x < WL) { p.x = WL; p.vx = Math.max(0, p.vx); }
        if (p.x > WR - PW) { p.x = WR - PW; p.vx = Math.min(0, p.vx); }
        var l = p.vy >= 0 ? ledgeUnder(s, p, feet) : null, impact = p.vy;
        p.ground = !!l; p.on = l;
        if (l) landOn(s, p, l, wasGround, impact); else p.coy -= dt;
    }

    function updatePlayer(s, dt) {
        var p = s.p;
        p.buf -= dt; p.stun -= dt; p.inv -= dt;
        var dir = steer(p, dt);
        tryJump(s, p);
        steamLift(s, p, dt);
        movePlayer(s, p, dt, dir);
        // Wall-slide dust, gated so it is a trickle and not a tick-rate spray.
        s.slideT -= dt;
        if (p.wall && !p.ground && p.vy === SLIDE && s.slideT <= 0) {
            s.slideT = 0.12;
            burst(s, p.wall < 0 ? WL : WR, p.y + 8, { n: 2, color: C.dim, speed: 40, life: 0.3 });
        }
    }

    // Bombs and bats never kill: they stun the climber and throw them off
    // balance, and the lava does the rest.
    function knock(s, fromX) {
        var p = s.p;
        if (p.inv > 0) return;
        // The hit pops the climber up as well as sideways, which leaves just
        // enough air time after the stun to steer back onto a ledge.
        p.stun = 0.2; p.inv = 1.4; p.cut = false;
        p.vx = (p.x + PW / 2 < fromX ? -1 : 1) * 120; p.vy = -320;
        sndKnock();
        G.shake(5, 0.2);
        burst(s, p.x + PW / 2, p.y + PH / 2, { n: 12, color: C.hot, speed: 200, life: 0.4 });
    }

    // ------------------------------------------------------------------
    // Lava, bombs, bats, quakes
    // ------------------------------------------------------------------

    function surge(s, dt) {
        s.surgeT -= dt;
        if (s.surgeT < 1.5 && !s.surgeWarn) { s.surgeWarn = true; G.sfx('alarm'); }
        if (s.surgeT <= 0) {
            s.surgeT = s.cfg.surge; s.surgeWarn = false; s.surgeLeft = SURGE;
            G.shake(4, 0.5);
            G.noise(0.7, { freq: 300, slide: 900, vol: 0.25, attack: 0.1 });
        }
        var d = Math.min(s.surgeLeft, 260 * dt);
        s.lavaY -= d; s.surgeLeft -= d;
    }

    // The lava rises at the level's speed, and catches up fast (but visibly,
    // not by teleporting) whenever the climber gets more than LEASH ahead —
    // so being quick never buys a long rest. The leash is measured from the
    // highest ledge stood on (s.bestY), not from the peak of a jump: a
    // geyser throws the climber far above the next ledge, and lava following
    // that peak would swallow the very ledge they are about to land on.
    function updateLava(s, dt) {
        s.lavaY -= s.cfg.lava * dt;
        if (s.cfg.surge) surge(s, dt);
        if (s.lavaY > s.bestY + LEASH) s.lavaY = Math.max(s.bestY + LEASH, s.lavaY - 500 * dt);
    }

    // A bomb first shows as a blinking marker at the top of the view for
    // 0.9 s, then drops.
    function spawnBomb(s, x) {
        s.bombs.push({ x: G.clamp(x, WL + 14, WR - 14), y: s.camY + 12, vy: 110, warn: 0.9, r: 9 });
    }

    // A bomb bursts on the first ledge it meets (or in the lava). It does not
    // break ledges: at eruption rates that would keep the next cracked ledge
    // permanently gone and stall the climb through no fault of the player.
    function bombLands(s, b, before) {
        for (var i = 0; i < s.ledges.length; i++) {
            var l = s.ledges[i];
            if (l.state === 'gone' || b.x < l.x || b.x > l.x + l.w) continue;
            if (before + b.r <= l.y + 2 && b.y + b.r >= l.y) return true;
        }
        return b.y > s.lavaY;
    }

    function tickBomb(s, b, dt) {
        var p = s.p, before = b.y;
        if (b.warn > 0) {
            b.warn -= dt; b.y = s.camY + 12;
            if (b.warn <= 0) sndWhistle();
            return true;
        }
        b.vy = Math.min(450, b.vy + 520 * dt);
        b.y += b.vy * dt;
        if (G.circRect(b.x, b.y, b.r, p.x, p.y, PW, PH)) knock(s, b.x);
        else if (!bombLands(s, b, before)) return b.y < s.camY + G.H + 60;
        burst(s, b.x, b.y, { n: 14, color: C.ember, speed: 190, gravity: 500, life: 0.5 });
        if (onScreen(s, b.y)) G.sfx('boom');
        return false;
    }

    function updateBombs(s, dt) {
        if (s.cfg.bomb) {
            s.bombT -= dt;
            if (s.bombT <= 0) {
                s.bombT = s.cfg.bomb * G.rnd(0.7, 1.3);
                spawnBomb(s, s.p.x + G.rnd(-170, 190));
            }
        }
        s.bombs = s.bombs.filter(function (b) { return tickBomb(s, b, dt); });
    }

    function updateBats(s, dt) {
        var p = s.p;
        s.bats.forEach(function (b) {
            b.x += b.dir * b.sp * dt;
            if (b.x < WL + 14) { b.x = WL + 14; b.dir = 1; }
            if (b.x > WR - 14) { b.x = WR - 14; b.dir = -1; }
            b.y = b.y0 + Math.sin(s.time * 5 + b.ph) * 12;
            if (p.inv <= 0 && G.circRect(b.x, b.y, 10, p.x, p.y, PW, PH)) {
                knock(s, b.x);
                G.tone(1900, 0.18, { type: 'sawtooth', slide: 900, vol: 0.08 });
            }
        });
    }

    // A quake rumbles for 1.2 s as a warning, then shakes every crumbling
    // ledge in view loose (each holds for another second or so: time to
    // jump off one) and brings three rocks down.
    function updateQuake(s, dt) {
        if (!s.cfg.quake) return;
        s.quakeT -= dt;
        if (s.quakeT < 1.2 && !s.quakeWarn) { s.quakeWarn = true; sndQuake(); G.shake(3, 1.2); }
        if (s.quakeT > 0) return;
        s.quakeT = s.cfg.quake; s.quakeWarn = false;
        G.shake(10, 0.6);
        G.sfx('bigboom');
        s.ledges.forEach(function (l) { if (onScreen(s, l.y)) startCrumble(l, G.rnd(1.0, 1.5)); });
        for (var k = 0; k < 3; k++) spawnBomb(s, WL + G.rnd(30, SHAFT - 30));
    }

    function collectGems(s) {
        var p = s.p;
        s.gems.forEach(function (g) {
            if (g.got || Math.abs(g.x - p.x - PW / 2) > 18 || Math.abs(g.y - p.y - PH / 2) > 24) return;
            g.got = true; s.gemsGot++;
            G.addScore(50);
            G.popup(viewX(s, g.x), g.y - 10, '+50', C.hot);
            burst(s, g.x, g.y, { n: 8, color: C.hot, speed: 110, life: 0.4 });
            sndGem();
        });
    }

    function burn(s) {
        var p = s.p;
        sndBurn();
        G.flash(C.lava, 0.3);
        burst(s, p.x + PW / 2, p.y + PH, { n: 30, color: C.hot, speed: 300, gravity: 600, angle: -Math.PI / 2, spread: 2.2, life: 0.9 });
        G.die();
    }

    // The view leads upward and never shows below the shaft floor. Lava that
    // is close but still under the bottom edge pulls the view down (by at
    // most CAM_LEAD - CAM_NEAR) until its surface shows; `gap` is the lava's
    // distance below the climber's head, and the pull fades out again where
    // the lava is too far down to be brought into view.
    function followCamera(s, dt) {
        var gap = s.lavaY - s.p.y, span = CAM_LEAD - CAM_NEAR;
        var pull = G.clamp(Math.min(gap - (LAVA_VIEW - CAM_LEAD), LAVA_VIEW - CAM_NEAR + span - gap), 0, span);
        s.camY += (Math.min(s.p.y - CAM_LEAD + pull, CAM_FLOOR) - s.camY) * Math.min(1, dt * 7);
        G.cam.y = s.camY;
    }

    function update(s, dt) {
        var p = s.p;
        s.time += dt;
        updateLedges(s, dt);
        updatePlayer(s, dt);
        updateLava(s, dt);
        updateBombs(s, dt);
        updateBats(s, dt);
        updateQuake(s, dt);
        collectGems(s);
        ambience(s, dt);
        followCamera(s, dt);
        if (p.on && p.on.rim) { G.win(500 + G.lives * 250 + s.gemsGot * 10); return; }
        if (updateFalls(s) || p.y + PH > s.lavaY + 6) burn(s);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // Back wall of the shaft: strata bands at half parallax, the night sky
    // above the rim, and a red glow that deepens toward the lava.
    function drawBackdrop(s, ctx) {
        var cam = s.camY, rim = s.rimY - cam, k;
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, G.W, G.H);
        for (k = Math.floor(cam * 0.5 / 70) - 1; k < (cam * 0.5 + G.H) / 70 + 1; k++) {
            ctx.fillStyle = 'rgba(255,110,30,' + (0.025 + hash(k) * 0.05) + ')';
            ctx.fillRect(WL, k * 70 - cam * 0.5 + hash(k + 40) * 30, SHAFT, 14 + hash(k + 80) * 30);
        }
        if (rim > 0) {
            var sky = ctx.createLinearGradient(0, rim - 400, 0, rim);
            sky.addColorStop(0, '#120a1e'); sky.addColorStop(1, '#4a1d12');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, G.W, rim);
            ctx.fillStyle = C.cream;
            for (k = 0; k < 30; k++) {
                ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(s.time * (1 + hash(k)) + k));
                ctx.fillRect(hash(k + 7) * G.W, rim - 30 - hash(k + 19) * 380, 2, 2);
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawWalls(s, ctx) {
        var cam = s.camY, top = Math.max(0, s.rimY - cam), k;
        ctx.fillStyle = C.rock;
        ctx.fillRect(0, top, WL, G.H - top);
        ctx.fillRect(WR, top, G.W - WR, G.H - top);
        // Cracks and blocks scroll with the world so the climb reads as motion.
        for (k = Math.floor(cam / 46) - 1; k < (cam + G.H) / 46 + 1; k++) {
            var y = k * 46 - cam;
            if (y < top) continue;
            ctx.fillStyle = hash(k) < 0.5 ? C.rockLit : '#150b05';
            ctx.fillRect(WL - 20 - hash(k + 3) * 130, y, 20 + hash(k + 5) * 60, 4);
            ctx.fillRect(WR + hash(k + 11) * 110, y + 20, 20 + hash(k + 13) * 60, 4);
        }
        ctx.fillStyle = C.rockLit;
        ctx.fillRect(WL - 4, top, 4, G.H - top);
        ctx.fillRect(WR, top, 4, G.H - top);
        s.ledges.forEach(function (l) { drawHint(s, ctx, l); });
    }

    // Arrows on the wall above a wall-kick ledge: the gap there cannot be
    // jumped, and the arrows say how to pass it.
    function drawHint(s, ctx, l) {
        var x = l.hint < 0 ? WL - 22 : WR + 22, y = l.y - s.camY;
        if (!l.hint || y < -20 || y > G.H + 160) return;
        ctx.strokeStyle = C.hot; ctx.lineWidth = 3;
        for (var k = 0; k < 3; k++) {
            var yy = y - 50 - k * 34 - (s.time * 30) % 34;
            ctx.globalAlpha = 0.25 + 0.2 * k;
            ctx.beginPath();
            ctx.moveTo(x - 9, yy + 9); ctx.lineTo(x, yy); ctx.lineTo(x + 9, yy + 9);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawSlab(ctx, l, x, y) {
        if (l.kind === 'move') {
            ctx.fillStyle = C.slab; ctx.fillRect(x, y, l.w, LEDGE_H);
            ctx.fillStyle = C.hot; ctx.fillRect(x, y, l.w, 2);
            ctx.fillRect(x + 4, y + 6, 8, 3); ctx.fillRect(x + l.w - 12, y + 6, 8, 3);
            return;
        }
        ctx.fillStyle = l.kind === 'crumble' ? C.crumble : C.ledge;
        ctx.fillRect(x, y, l.w, l.floor ? 80 : LEDGE_H);
        ctx.fillStyle = l.kind === 'crumble' ? C.cream : C.ember;
        ctx.fillRect(x, y, l.w, l.rim ? 4 : 2);
        if (l.kind !== 'crumble') return;
        // Dark cracks mark a ledge that will not hold for long.
        ctx.fillStyle = C.bg;
        for (var k = 14; k < l.w - 6; k += 22) ctx.fillRect(x + k, y + 2, 2, 5 + hash(l.i * 9 + k) * 7);
    }

    function drawLedges(s, ctx) {
        s.ledges.forEach(function (l) {
            var y = l.y - s.camY;
            if (y < -60 || y > G.H + 20) return;
            if (l.state === 'gone') {
                // A faint outline shows where the ledge will re-form.
                ctx.strokeStyle = 'rgba(255,140,0,0.3)'; ctx.lineWidth = 1;
                ctx.strokeRect(l.x + 0.5, y + 0.5, l.w * (1 - l.t / REFORM), LEDGE_H);
                return;
            }
            drawSlab(ctx, l, l.x + (l.state === 'shake' ? Math.sin(s.time * 70) * 2 : 0), y);
            if (l.rim) G.text('CRATER RIM', G.W / 2, y - 70, { size: 22, bold: true, color: C.hot, align: 'center' });
        });
    }

    // Steam is drawn as puffs whose positions come from the clock alone: a
    // full column while the vent blows, a few wisps as a warning before.
    function drawVents(s, ctx) {
        s.ledges.forEach(function (l) {
            var v = l.vent, y = l.y - s.camY;
            if (!v || y < -20 || y > G.H + STEAM_H) return;
            ctx.fillStyle = C.rockLit;
            ctx.beginPath();
            ctx.moveTo(v.x - 16, y); ctx.lineTo(v.x - 7, y - 8); ctx.lineTo(v.x + 7, y - 8); ctx.lineTo(v.x + 16, y);
            ctx.fill();
            var on = isOn(v, s.time), n = on ? 16 : (isWarning(v, s.time) ? 4 : 0), reach = on ? STEAM_H : 50;
            ctx.fillStyle = C.cream;
            for (var k = 0; k < n; k++) {
                var f = (s.time * (on ? 2.2 : 1) + k / n) % 1;
                ctx.globalAlpha = 0.34 * (1 - f);
                ctx.beginPath();
                ctx.arc(v.x + Math.sin(k * 2.4 + s.time * 6) * (5 + f * 14), y - 8 - f * reach, 6 + f * 12, 0, 6.3);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        });
    }

    function drawFalls(s, ctx) {
        s.falls.forEach(function (f) {
            var y0 = f.y0 - s.camY, y1 = f.y1 - s.camY, k;
            if (y1 < 0 || y0 > G.H) return;
            ctx.fillStyle = C.rockLit;                       // the spout it pours from
            ctx.fillRect(f.x - 20, y0 - 10, 40, 10);
            if (isOn(f, s.time)) {
                ctx.fillStyle = C.lava; ctx.fillRect(f.x - f.w / 2, y0, f.w, y1 - y0);
                ctx.fillStyle = C.hot;
                for (k = 0; k < 6; k++) ctx.fillRect(f.x - 8 + hash(k) * 12, y0 + ((s.time * 420 + k * 61) % (y1 - y0 - 30)), 4, 30);
                return;
            }
            // The lane glows faintly while the fall is off, so the climber
            // sees where it will pour; it brightens and drips just before.
            var warn = isWarning(f, s.time);
            ctx.fillStyle = 'rgba(255,68,0,' + (warn ? 0.32 : 0.1) + ')';
            ctx.fillRect(f.x - f.w / 2, y0, f.w, y1 - y0);
            if (!warn) return;
            ctx.fillStyle = C.hot;
            for (k = 0; k < 4; k++) ctx.fillRect(f.x - 8 + k * 5, y0 + ((s.time * 260 + k * 47) % (y1 - y0 - 12)), 4, 12);
        });
    }

    function drawGemsAndBats(s, ctx) {
        s.gems.forEach(function (g) {
            var y = g.y - s.camY + Math.sin(s.time * 4 + g.x) * 3;
            if (g.got || y < 0 || y > G.H) return;
            ctx.fillStyle = C.hot;
            ctx.beginPath();
            ctx.moveTo(g.x, y - 8); ctx.lineTo(g.x + 6, y); ctx.lineTo(g.x, y + 8); ctx.lineTo(g.x - 6, y);
            ctx.fill();
            ctx.fillStyle = C.cream; ctx.fillRect(g.x - 1, y - 4, 2, 4);
        });
        s.bats.forEach(function (b) {
            var y = b.y - s.camY, flap = Math.sin(s.time * 18 + b.ph) * 8;
            if (y < -20 || y > G.H + 20) return;
            ctx.fillStyle = C.lava;
            ctx.beginPath();
            ctx.moveTo(b.x - 18, y - flap); ctx.lineTo(b.x - 6, y + 2); ctx.lineTo(b.x, y - 3);
            ctx.lineTo(b.x + 6, y + 2); ctx.lineTo(b.x + 18, y - flap); ctx.lineTo(b.x, y + 9);
            ctx.fill();
            ctx.fillStyle = C.hot; ctx.fillRect(b.x - 4, y, 2, 2); ctx.fillRect(b.x + 2, y, 2, 2);
        });
    }

    function drawBombs(s, ctx) {
        s.bombs.forEach(function (b) {
            var y = b.y - s.camY;
            if (b.warn > 0) {
                if (Math.floor(s.time * 12) % 2) return;
                ctx.fillStyle = C.hot;
                ctx.beginPath();
                ctx.moveTo(b.x - 9, G.HUD + 6); ctx.lineTo(b.x + 9, G.HUD + 6); ctx.lineTo(b.x, G.HUD + 20);
                ctx.fill();
                return;
            }
            ctx.fillStyle = 'rgba(255,140,0,0.35)'; ctx.fillRect(b.x - 3, y - 34, 6, 30);   // trail
            ctx.fillStyle = C.lava;
            ctx.beginPath(); ctx.arc(b.x, y, b.r, 0, 6.3); ctx.fill();
            ctx.fillStyle = C.hot;
            ctx.beginPath(); ctx.arc(b.x - 2, y - 2, b.r * 0.45, 0, 6.3); ctx.fill();
        });
    }

    // Cream suit and a yellow helmet on a dark outline, so the climber
    // stays readable against both black rock and orange lava glow.
    function drawPlayer(s, ctx) {
        var p = s.p, x = Math.round(p.x), y = Math.round(p.y - s.camY);
        if (p.inv > 0 && Math.floor(s.time * 20) % 2) return;
        // Keep the feet on the collision plane while making the helmet and
        // suit readable in the phone's small playfield.
        ctx.save();
        if (s.touch) { ctx.translate(0, y + PH); ctx.scale(1, 1.25); ctx.translate(0, -y - PH); }
        var stride = p.ground ? Math.sin(p.run) * 3 : 3;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y - 1, PW, PH + 1);
        ctx.fillStyle = p.stun > 0 ? C.ember : C.cream;
        ctx.fillRect(x + 3, y + 10, PW - 6, 12);
        ctx.fillRect(x + 4 + stride, y + 22, 5, 8);
        ctx.fillRect(x + PW - 9 - stride, y + 22, 5, 8);
        ctx.fillStyle = C.hot;
        ctx.fillRect(x + 2, y, PW - 4, 10);
        ctx.fillStyle = C.bg;
        ctx.fillRect(p.face > 0 ? x + 10 : x + 3, y + 4, 7, 4);
        ctx.restore();
    }

    // Lava under the bottom edge still shows as heat pulsing up from below,
    // brighter the closer it is: a brisk climber keeps it out of view, and
    // must still be able to tell that it is right behind.
    function drawHeat(s, ctx, ly) {
        var near = G.clamp(1 - (ly - G.H) / 220, 0.3, 1), pulse = 0.42 + 0.1 * Math.sin(s.time * 6);
        var band = ctx.createLinearGradient(0, G.H - 80, 0, G.H);
        band.addColorStop(0, 'rgba(255,68,0,0)');
        band.addColorStop(1, 'rgba(255,140,0,' + (near * pulse).toFixed(3) + ')');
        ctx.fillStyle = band;
        ctx.fillRect(WL, G.H - 80, SHAFT, 80);
    }

    function drawLava(s, ctx) {
        var ly = s.lavaY - s.camY, t = s.time, hot = s.surgeWarn && Math.floor(t * 8) % 2;
        var glow = ctx.createLinearGradient(0, ly - 220, 0, ly);
        glow.addColorStop(0, 'rgba(255,68,0,0)'); glow.addColorStop(1, 'rgba(255,68,0,0.38)');
        ctx.fillStyle = glow;
        ctx.fillRect(WL, ly - 220, SHAFT, 220);
        if (ly > G.H + 12) { drawHeat(s, ctx, ly); return; }
        var body = ctx.createLinearGradient(0, ly, 0, ly + 220);
        body.addColorStop(0, hot ? C.cream : C.hot); body.addColorStop(0.1, C.ember);
        body.addColorStop(0.4, C.lava); body.addColorStop(1, '#7a1500');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(WL, G.H + 20);
        for (var x = WL; x <= WR; x += 20) ctx.lineTo(x, ly + Math.sin(x * 0.03 + t * 2) * 4 + Math.sin(x * 0.071 - t * 3.1) * 2);
        ctx.lineTo(WR, G.H + 20);
        ctx.fill();
        ctx.fillStyle = C.hot;
        for (var k = 0; k < 7; k++) {
            var f = (t * (0.5 + hash(k) * 0.6) + hash(k + 4)) % 1;
            ctx.globalAlpha = 1 - f;
            ctx.beginPath(); ctx.arc(WL + 30 + hash(k + 8) * (SHAFT - 60), ly + 14 + hash(k + 2) * 40, 2 + f * 7, 0, 6.3); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // Sparks drifting up the shaft; they depend on the clock only and keep
    // the picture alive even when nothing else moves.
    function drawEmbers(s, ctx) {
        ctx.fillStyle = C.ember;
        for (var k = 0; k < (s.touch ? 18 : 34); k++) {
            var y = G.H - ((s.time * (30 + hash(k + 50) * 70) + hash(k + 9) * G.H) % G.H);
            ctx.globalAlpha = 0.25 + hash(k + 21) * 0.5;
            ctx.fillRect(WL + hash(k) * SHAFT + Math.sin(s.time * 2 + k) * 8, y, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    // The height meter in the left rock wall: lava fills it from below, the
    // tick is the climber, the top is the crater rim.
    function drawMeter(s, ctx) {
        var x = s.touch ? 36 : 82, y0 = 76, len = 420, span = -s.rimY;
        var at = function (wy) { return y0 + len * (1 - G.clamp(-wy / span, 0, 1)); };
        ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y0 - 2, 16, len + 4);
        ctx.fillStyle = C.rockLit; ctx.fillRect(x, y0, 12, len);
        ctx.fillStyle = C.lava; ctx.fillRect(x, at(s.lavaY), 12, y0 + len - at(s.lavaY));
        ctx.fillStyle = C.cream; ctx.fillRect(x - 6, at(s.p.y + PH) - 2, 24, 4);
        G.text('RIM', x + 6, y0 - 12, { size: s.touch ? 26 : 18, bold: true, color: C.hot, align: 'center' });
        // The surge warning blinks in the middle of the shaft, large enough
        // to read on a phone: the lava it warns of is often out of view.
        if (s.surgeWarn && Math.floor(s.time * 6) % 2) {
            G.text('LAVA SURGE!', G.W / 2, G.H - 96, { size: 28, bold: true, color: C.cream, align: 'center', glow: C.lava });
        }
    }

    function draw(s, ctx) {
        ctx.save();
        // Magnify across the shaft, trimming only decorative wall margins.
        // Keep vertical scale and camera unchanged: steam and wall-kick
        // targets must stay visible above the climber on both phone layouts.
        if (s.touch) { ctx.translate(G.W / 2, 0); ctx.scale(PHONE_X_SCALE, 1); ctx.translate(-G.W / 2, 0); }
        drawBackdrop(s, ctx);
        // Everything in the world scrolls, so it is clipped below the HUD
        // strip instead of each sprite checking for it.
        ctx.save();
        ctx.beginPath(); ctx.rect(0, G.HUD, G.W, G.H - G.HUD); ctx.clip();
        drawFalls(s, ctx);
        drawLedges(s, ctx);
        drawVents(s, ctx);
        drawGemsAndBats(s, ctx);
        drawBombs(s, ctx);
        drawPlayer(s, ctx);
        drawLava(s, ctx);
        drawEmbers(s, ctx);
        drawWalls(s, ctx);
        ctx.restore();
        ctx.restore();
        drawMeter(s, ctx);
    }

    function hud(s) {
        var feet = s.p.y + PH;
        return 'RIM ' + Math.max(0, Math.ceil((feet - s.rimY) / 20)) + 'm  LAVA ' + Math.max(0, Math.floor((s.lavaY - feet) / 20)) + 'm';
    }

    G.register('volcano', {
        title: 'MAGMA RISING',
        blurb: 'The lava never stops. Climb to the crater rim.',
        controls: [
            '← → run · SPACE / JUMP jump (hold for a higher jump)',
            'Jump against a shaft wall and press JUMP again to kick off it',
            'Stand on a vent to ride the steam · cracked ledges fall · only lava kills'
        ],
        levelNames: ['First Ascent', 'Brittle Rock', 'Drifting Slabs', 'Steam Vents', 'Lava Bombs', 'Fire Bats', 'Tremors', 'Lava Falls', 'Surge', 'Eruption'],
        colors: { bg: C.bg, fg: C.cream, accent: C.ember, dim: C.dim },
        lives: 4,
        music: {
            bpm: 152, root: 40, scale: 'phrygian', prog: [0, 0, 1, 0, 0, 5, 1, 0],
            bass: 'x.xx.xx.x.xxo.x.',
            lead: ['7.7.8.7.5.4.5...', '7.7.8.7.a.8.7...', '8.8.7.5.4.5.7.5.', '4---1---0---....',
                '7.9.8.7.5.7.8...', 'a.a.8.7.8.7.5...', '8.7.5.4.5.4.1.0.', '1---0-------....'],
            arp: '0.2.1.3.', drums: { k: 'x..x..x.x..x..x.', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' },
            leadWave: 'sawtooth', bassWave: 'sawtooth', arpWave: 'square'
        },
        init: init, update: update, draw: draw, hud: hud,
        // Running and one jump button are all the game reads.
        touch: { a: 'JUMP', hide: ['up', 'down', 'b'] }
    });
})();
