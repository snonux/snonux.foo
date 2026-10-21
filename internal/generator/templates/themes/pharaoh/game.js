/*
 * Pyramid Hop — the pharaoh theme's game.
 *
 * A Q*bert-style hop over a pyramid of sandstone blocks under a night
 * desert sky. Every landing turns a stone toward gold; when every stone of
 * the pyramid is gold the level is done. Hopping off an edge is a long
 * fall, unless a winged sun-disc hovers there: it carries the hero back
 * up to the capstone, and whatever was chasing the hero follows it over
 * the edge.
 *
 * Grid: row r (0 = the capstone) holds stones c = 0..r. The four hops are
 * up-left (r-1, c-1), up-right (r-1, c), down-left (r+1, c) and
 * down-right (r+1, c+1). Cells beside the pyramid ((k, -1) and (k, k+1))
 * are where the sun-discs float. Every hop is a real ballistic arc: the
 * hop's launch velocity is solved for its landing spot and then
 * integrated with gravity, so a hop that misses the stones simply keeps
 * falling.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var ROWS = 7, CW = 76, HW = 38, TH = 19, SIDE = 38, RH = 57, AX = 480, AY = 118;
    var HOP_T = 0.3, LAND_T = 0.05, GRAV = 2400, HIT_R = 26;
    var RIDE_T = 1.9, RIDE_Y = AY - 44, DROP_T = 0.42, CRACK_T = 1.0, GONE_T = 3.2, WAKE_T = 1.3;
    var SAND_WARN = 1.8, SAND_POUR = 1.4;
    var C = {
        night: '#070d24', lapis: '#1f3f8f', lapisHi: '#3f6fd8', sand: '#d9b97c', sandLit: '#ead2a0',
        faceL: '#9a7444', faceR: '#6a4c2b', etch: 'rgba(40,24,8,0.45)', gold: '#f2c14e', goldHi: '#fff1b8',
        turq: '#3cc8b4', carn: '#c8442c', cream: '#f6e7c8', ink: '#1a1208', dim: '#b8a27a', torch: '#ff9a3c'
    };
    // Hop directions as [row step, column step], and the arrow that sends each.
    var DIRS = { ur: [-1, 0], ul: [-1, -1], dr: [1, 1], dl: [1, 0] };
    var KEYS = { up: 'ur', right: 'dr', down: 'dl', left: 'ul' };

    // One row per level. two: share of stones that need two hops; crack:
    // cracked stones that crumble under a lingering foot; discs: [row, side]
    // (side -1 floats left of the pyramid, 1 right); discBack: seconds until
    // a used disc returns (0 = never). The spawn fields are first-spawn /
    // repeat seconds; wait fields are the pause between an enemy's hops.
    var LEVELS = [
        // Outer Steps: one hop turns a stone gold; scarab balls and one
        // slow mummy teach the hop and the disc.
        { two: 0, crack: 0, discs: [[4, -1], [2, 1]], discBack: 0, ball: 4.6, ballWait: 0.42, ballMax: 2,
            mummyAt: 9, mummy: 9, mummyWait: 0.6, cursedAt: 0, cursed: 0, cobraAt: 0, cobra: 0, sandAt: 0, sand: 0,
            anubis: false, hint: ['Hop on every stone to turn it gold.', 'Edges are a fall, except onto a sun-disc.'] },
        // Inner Chamber: two-hop stones, a cursed scarab that undoes gold,
        // cracked stones, sand pouring from the apex and the cobra.
        { two: 0.45, crack: 4, discs: [[2, -1], [4, 1]], discBack: 0, ball: 4.4, ballWait: 0.36, ballMax: 2,
            mummyAt: 14, mummy: 11, mummyWait: 0.5, cursedAt: 5, cursed: 9, cobraAt: 9, cobra: 13, sandAt: 6, sand: 11,
            anubis: false, hint: ['Dotted stones need two hops. Catch the turquoise scarab:', 'it turns gold back. Cracked stones crumble, sand pours.'] },
        // Anubis: the god stalks the pyramid and his steps undo gold; lure
        // him over the edge from a sun-disc, then finish the stones.
        { two: 0.25, crack: 3, discs: [[1, -1], [4, -1], [2, 1], [5, 1]], discBack: 9, ball: 5, ballWait: 0.36, ballMax: 2,
            mummyAt: 0, mummy: 0, mummyWait: 0, cursedAt: 0, cursed: 0, cobraAt: 12, cobra: 14, sandAt: 0, sand: 0,
            anubis: true, anubisWait: 0.2, hint: ['Anubis undoes gold. Wait beside a sun-disc, let him come', 'close, then ride it: he follows you over the edge.'] }
    ];

    function cellX(r, c) { return AX + (c - r / 2) * CW; }
    function cellY(r) { return AY + r * RH; }
    function onPyr(r, c) { return r >= 0 && r < ROWS && c >= 0 && c <= r; }
    function stone(s, r, c) { return onPyr(r, c) ? s.stones[r][c] : null; }

    // ------------------------------------------------------------------
    // Level setup
    // ------------------------------------------------------------------

    function discCell(d) { return { r: d.k, c: d.side < 0 ? -1 : d.k + 1 }; }

    // The stone a disc is boarded from: up-left off the left edge, up-right
    // off the right edge.
    function discFoot(d) { return { r: d.k + 1, c: d.side < 0 ? 0 : d.k + 1 }; }

    // Cracked stones stay off the capstone, its neighbours and every disc's
    // boarding stone, where the hero has to wait.
    function placeCracks(s, n, rnd) {
        var feet = s.discs.map(discFoot), tries = 0;
        while (n > 0 && tries++ < 200) {
            var st = s.list[3 + Math.floor(rnd() * (s.list.length - 3))];
            var foot = feet.some(function (f) { return f.r === st.r && f.c === st.c; });
            if (st.crack || foot) continue;
            st.crack = true; n--;
        }
    }

    function buildStones(s, cfg, rnd) {
        s.stones = []; s.list = [];
        for (var r = 0; r < ROWS; r++) {
            s.stones.push([]);
            for (var c = 0; c <= r; c++) {
                var st = { r: r, c: c, v: 0, need: rnd() < cfg.two ? 2 : 1, crack: false, st: 'ok', t: 0, glow: 0 };
                s.stones[r].push(st); s.list.push(st);
            }
        }
        placeCracks(s, cfg.crack, rnd);
    }

    function newPlayer() {
        return { r: 0, c: 0, x: AX, y: AY, vx: 0, vy: 0, state: 'idle', t: 0, dur: 0, tr: 0, tc: 0, face: 1,
            inv: 1.2, behind: false, ride: null, squash: 0, toDisc: false, dropping: false };
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 977 + 31);
        var s = {
            cfg: cfg, level: level, touch: G.isTouch(), time: 0, p: newPlayer(), foes: [], cobra: null, sand: null,
            discs: cfg.discs.map(function (d) { return { k: d[0], side: d[1], used: false, back: 0 }; }),
            chase: { r: 0, c: 0 }, dead: null, winT: 0, won: false, buf: null, held: null, anubisDown: false, msg: null,
            timers: { ball: 2.6, mummy: cfg.mummyAt, cursed: cfg.cursedAt, cobra: cfg.cobraAt, sand: cfg.sandAt, anubis: 2.4 },
            bg: null, bgScale: 0
        };
        buildStones(s, cfg, rnd);
        return s;
    }

    // ------------------------------------------------------------------
    // Sounds: oud plucks for hops and stones, drums for thuds, noise for sand
    // ------------------------------------------------------------------

    function sndHop() { G.tone(392, 0.07, { type: 'triangle', slide: 587, vol: 0.11 }); }
    function sndTurq() { G.tone(659, 0.12, { type: 'triangle', vol: 0.12 }); }
    function sndGold(st) {
        var f = 880 * Math.pow(2, (ROWS - st.r) / 24);
        G.tone(f, 0.09, { type: 'triangle', vol: 0.12 });
        G.tone(f * 1.5, 0.2, { type: 'sine', vol: 0.1, delay: 0.06 });
    }
    function sndBall() { G.tone(170, 0.07, { type: 'square', slide: 110, vol: 0.05 }); }
    function sndThud() { G.tone(110, 0.12, { type: 'sine', slide: 55, vol: 0.2 }); G.noise(0.06, { freq: 500, vol: 0.08 }); }
    function sndRevert() { G.tone(523, 0.22, { type: 'sawtooth', slide: 262, vol: 0.08 }); }
    function sndDisc() {
        G.sfx('power');
        G.tone(440, 0.9, { type: 'sine', slide: 1320, vol: 0.07, attack: 0.1 });
    }
    function sndFall() { G.tone(1100, 0.8, { type: 'sine', slide: 140, vol: 0.12 }); }
    function sndCurse() { G.noise(0.35, { filter: 'bandpass', freq: 900, slide: 200, q: 2, vol: 0.2 }); }
    function sndHiss() { G.noise(0.7, { filter: 'highpass', freq: 4200, slide: 6000, vol: 0.09, attack: 0.05 }); }
    function sndSand(loud) { G.noise(loud ? 1.3 : 0.9, { filter: 'bandpass', freq: loud ? 1400 : 2600, slide: 600, q: 0.8, vol: loud ? 0.16 : 0.06, attack: 0.2 }); }
    function sndCrack() { G.noise(0.16, { filter: 'bandpass', freq: 1100, slide: 400, q: 3, vol: 0.15 }); }
    function sndCollapse() { G.noise(0.5, { freq: 420, slide: 60, vol: 0.22 }); }
    function sndGong() {
        G.tone(98, 1.6, { type: 'sine', vol: 0.24, attack: 0.02 });
        G.tone(147, 1.2, { type: 'triangle', vol: 0.08, delay: 0.02 });
        G.noise(1.2, { freq: 160, vol: 0.12, attack: 0.3 });
    }
    function sndLured() { G.tone(700, 0.7, { type: 'triangle', slide: 120, vol: 0.12 }); }
    function sndFanfare() {
        [64, 65, 68, 69, 71, 76].forEach(function (m, i) {
            G.tone(440 * Math.pow(2, (m - 69) / 12), 0.22, { type: 'triangle', vol: 0.12, delay: i * 0.1 });
        });
    }

    // ------------------------------------------------------------------
    // Hops: a ballistic arc solved for its landing spot, then integrated
    // ------------------------------------------------------------------

    function startHop(e, tr, tc, dur) {
        var bx = cellX(tr, tc), by = cellY(tr);
        e.tr = tr; e.tc = tc; e.state = 'hop'; e.t = 0; e.dur = dur;
        e.vx = (bx - e.x) / dur;
        e.vy = (by - e.y - 0.5 * GRAV * dur * dur) / dur;
        if (bx !== e.x) e.face = bx > e.x ? 1 : -1;
        // A hop toward a higher row that misses ends behind the pyramid.
        e.behind = tr < e.r;
    }

    // Exact for constant gravity, so the arc ends where it was aimed.
    function integrate(e, dt) {
        e.x += e.vx * dt;
        e.y += e.vy * dt + 0.5 * GRAV * dt * dt;
        e.vy += GRAV * dt;
    }

    function stepHop(e, dt) {
        e.t += dt;
        integrate(e, dt);
        if (e.t < e.dur) return false;
        e.x = cellX(e.tr, e.tc); e.y = cellY(e.tr);
        return true;
    }

    // A fall through a crumbled stone drops straight down inside the
    // pyramid; a hop off an edge keeps its arc.
    function startFall(e, hole) {
        e.state = 'fall';
        if (hole) { e.vx = 0; e.vy = 0; e.behind = true; }
    }

    function discAt(s, r, c) {
        for (var i = 0; i < s.discs.length; i++) {
            var d = s.discs[i], dc = discCell(d);
            if (!d.used && dc.r === r && dc.c === c) return d;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // The hero
    // ------------------------------------------------------------------

    // A tap picks the hop toward it: the quarter around the hero it lands in.
    function tapDir(s) {
        var dx = G.mouse.x - s.p.x, dy = G.mouse.y - (s.p.y - 14);
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return null;
        if (dy < 0) return dx >= 0 ? 'ur' : 'ul';
        return dx >= 0 ? 'dr' : 'dl';
    }

    // A press during a hop is kept for a moment and played on landing; a
    // held arrow keeps hopping the same way.
    function readInput(s, dt) {
        var k, d = null;
        for (k in KEYS) if (G.hit[k]) d = KEYS[k];
        if (!d && G.mouse.hit) d = tapDir(s);
        if (d) s.buf = { d: d, t: 0.22 };
        else if (s.buf && (s.buf.t -= dt) <= 0) s.buf = null;
        s.held = null;
        for (k in KEYS) if (G.key[k]) s.held = KEYS[k];
    }

    function idlePlayer(s, p, dt) {
        if (p.t > 0) { p.t -= dt; return; }
        var d = s.buf ? s.buf.d : s.held;
        if (!d) return;
        s.buf = null;
        var tr = p.r + DIRS[d][0], tc = p.c + DIRS[d][1];
        startHop(p, tr, tc, HOP_T);
        // Whatever chases the hero heads for the disc it jumps to.
        p.toDisc = !!discAt(s, tr, tc);
        if (p.toDisc) s.chase = { r: tr, c: tc };
        sndHop();
    }

    function landPlayer(s, p) {
        var d = discAt(s, p.tr, p.tc), st = stone(s, p.tr, p.tc);
        if (d && !p.dropping) { boardDisc(s, p, d); return; }
        if (!st || st.st === 'gone') { startFall(p, !!st); sndFall(); return; }
        p.r = p.tr; p.c = p.tc; p.state = 'idle'; p.t = LAND_T; p.squash = 0.14; p.toDisc = false;
        if (p.dropping) { p.dropping = false; p.inv = 0.5; }
        s.chase = { r: p.r, c: p.c };
        stepStone(s, st);
        if (st.crack && st.st === 'ok') { st.st = 'shake'; st.t = CRACK_T; sndCrack(); }
    }

    function boardDisc(s, p, d) {
        d.used = true; d.back = s.cfg.discBack;
        p.state = 'ride'; p.toDisc = false; p.ride = { t: 0, x0: p.x, y0: p.y };
        G.addScore(50);
        sndDisc();
    }

    // The disc glides up over the capstone; the hero then drops onto it.
    function ridePlayer(s, p, dt) {
        var R = p.ride;
        R.t += dt;
        var e = Math.min(1, R.t / RIDE_T), k = e * e * (3 - 2 * e);
        p.x = G.lerp(R.x0, AX, k);
        p.y = G.lerp(R.y0, RIDE_Y, k) - Math.sin(Math.PI * e) * 46;
        if (e < 1) return;
        p.ride = null; p.r = -1; p.dropping = true;
        startHop(p, 0, 0, DROP_T);
        p.behind = false;
    }

    function fallPlayer(s, p, dt) {
        integrate(p, dt);
        if (p.y > G.H + 60) kill(s, 'fall');
    }

    function updatePlayer(s, dt) {
        var p = s.p;
        if (p.inv > 0) p.inv -= dt;
        if (p.squash > 0) p.squash -= dt;
        if (p.state === 'idle') idlePlayer(s, p, dt);
        else if (p.state === 'hop') { if (stepHop(p, dt)) landPlayer(s, p); }
        else if (p.state === 'ride') ridePlayer(s, p, dt);
        else if (p.state === 'fall') fallPlayer(s, p, dt);
    }

    // ------------------------------------------------------------------
    // Stones
    // ------------------------------------------------------------------

    function doneCount(s) {
        return s.list.filter(function (st) { return st.v >= st.need; }).length;
    }

    function levelDone(s) {
        return doneCount(s) === s.list.length && (!s.cfg.anubis || s.anubisDown);
    }

    function stepStone(s, st) {
        if (st.v >= st.need) return;
        st.v++; st.glow = 1;
        G.addScore(25);
        var x = cellX(st.r, st.c), y = cellY(st.r);
        if (st.v < st.need) { sndTurq(); G.burst(x, y, { n: 6, color: C.turq, speed: 90, life: 0.4, size: 3 }); }
        else { sndGold(st); G.burst(x, y, { n: 10, color: C.gold, speed: 130, life: 0.5, size: 3, gravity: 200 }); }
        if (levelDone(s)) startWin(s);
    }

    function revertStone(s, st) {
        if (st.v <= 0) return;
        st.v--; st.glow = -1;
        sndRevert();
        G.burst(cellX(st.r, st.c), cellY(st.r), { n: 8, color: C.turq, speed: 80, life: 0.5, size: 3 });
    }

    function collapse(s, st) {
        st.st = 'gone'; st.t = GONE_T;
        G.burst(cellX(st.r, st.c), cellY(st.r) + 20, { n: 16, color: C.faceL, speed: 120, gravity: 900, size: 5, life: 0.8 });
        sndCollapse();
        var p = s.p;
        if (p.state === 'idle' && p.r === st.r && p.c === st.c) { startFall(p, true); sndFall(); }
        s.foes.forEach(function (f) {
            if ((f.state === 'idle' || f.state === 'wake') && f.r === st.r && f.c === st.c) { startFall(f, true); foeFalls(s, f); }
        });
    }

    // A crumbled stone comes back after GONE_T, so no stone is ever lost.
    function updateStones(s, dt) {
        s.list.forEach(function (st) {
            if (st.glow > 0) st.glow = Math.max(0, st.glow - dt * 2);
            if (st.glow < 0) st.glow = Math.min(0, st.glow + dt * 2);
            if (st.st === 'ok') return;
            st.t -= dt;
            if (st.t > 0) return;
            if (st.st === 'shake') { collapse(s, st); return; }
            st.st = 'ok';
            G.burst(cellX(st.r, st.c), cellY(st.r), { n: 8, color: C.sand, speed: 60, life: 0.4 });
        });
    }

    // ------------------------------------------------------------------
    // Enemies: scarab balls, sarcophagi that wake as mummies, the cursed
    // scarab and Anubis. Balls roll down at random; mummies and Anubis chase.
    // ------------------------------------------------------------------

    function count(s, kind) {
        return s.foes.filter(function (f) { return f.kind === kind && f.state !== 'fall'; }).length;
    }

    function makeFoe(kind, r, c, y, state) {
        return { kind: kind, r: r, c: c, x: cellX(r, c), y: y, vx: 0, vy: 0, state: state, t: 0, dur: 0, tr: r, tc: c, wait: 0, face: 1, behind: false };
    }

    // Droppers fall out of the sky onto one of the two stones under the
    // capstone, never onto one another.
    function dropFoe(s, kind) {
        var free = [0, 1].filter(function (c) {
            return !s.foes.some(function (f) { return f.state !== 'fall' && f.r <= 1 && (f.c === c || f.r === 0); });
        });
        if (!free.length) return;
        var c = free.length > 1 ? (G.rnd(0, 1) < 0.5 ? 0 : 1) : free[0];
        s.foes.push(makeFoe(kind, 1, c, G.HUD - 20, 'drop'));
    }

    // Anubis rises from the bottom stone farthest from the hero.
    function spawnAnubis(s) {
        var best = 0, bd = -1;
        for (var c = 0; c < ROWS; c++) {
            var d = Math.abs(cellX(ROWS - 1, c) - s.p.x);
            if (d > bd) { bd = d; best = c; }
        }
        var f = makeFoe('anubis', ROWS - 1, best, cellY(ROWS - 1), 'wake');
        f.wake = WAKE_T;
        s.foes.push(f);
        s.msg = { text: 'ANUBIS RISES', t: 2 };
        sndGong();
        G.shake(4, 0.4);
    }

    function spawnFoes(s, dt) {
        var T = s.timers, cfg = s.cfg;
        T.ball -= dt;
        if (T.ball <= 0) { T.ball = cfg.ball; if (count(s, 'ball') < cfg.ballMax) dropFoe(s, 'ball'); }
        if (cfg.mummy && !count(s, 'egg') && !count(s, 'mummy') && (T.mummy -= dt) <= 0) { T.mummy = cfg.mummy; dropFoe(s, 'egg'); }
        if (cfg.cursed && !count(s, 'cursed') && (T.cursed -= dt) <= 0) { T.cursed = cfg.cursed; dropFoe(s, 'cursed'); }
        if (cfg.cobra && !s.cobra && (T.cobra -= dt) <= 0) { T.cobra = cfg.cobra; spawnCobra(s); }
        if (cfg.sand && !s.sand && (T.sand -= dt) <= 0) { T.sand = cfg.sand; spawnSand(s); }
        if (cfg.anubis && !s.anubisDown && !count(s, 'anubis') && (T.anubis -= dt) <= 0) spawnAnubis(s);
    }

    function isChaser(f) { return f.kind === 'mummy' || f.kind === 'anubis'; }

    function waitFor(s, f) {
        if (f.kind === 'mummy') return s.cfg.mummyWait;
        if (f.kind === 'anubis') return s.cfg.anubisWait;
        return s.cfg.ballWait * (f.kind === 'cursed' ? 1.25 : 1);
    }

    function hopFor(f) { return f.kind === 'anubis' ? 0.3 : (isChaser(f) ? 0.34 : 0.3); }

    // A chaser takes the hop that brings it closest to where the hero last
    // stood. It never leaves the pyramid, except into that very spot: so
    // when the hero rides a disc away, the chaser follows it over the edge.
    function chaseStep(s, f) {
        var goal = s.chase, gx = cellX(goal.r, goal.c), gy = cellY(goal.r), best = null, bd = 1e9;
        for (var k in DIRS) {
            var r = f.r + DIRS[k][0], c = f.c + DIRS[k][1], st = stone(s, r, c);
            var ok = (st && st.st !== 'gone') || (r === goal.r && c === goal.c);
            var taken = s.foes.some(function (o) { return o !== f && isChaser(o) && o.state !== 'fall' && o.tr === r && o.tc === c; });
            if (!ok || taken) continue;
            var d = G.dist(cellX(r, c), cellY(r), gx, gy);
            if (d < bd) { bd = d; best = { r: r, c: c }; }
        }
        return best;
    }

    function foeMove(s, f) {
        if (f.kind === 'egg' && f.r === ROWS - 1) { f.state = 'wake'; f.wake = WAKE_T; f.t = 0; sndThud(); return; }
        var to = isChaser(f) ? chaseStep(s, f) : { r: f.r + 1, c: f.c + (G.rnd(0, 1) < 0.5 ? 0 : 1) };
        if (!to) { f.wait = 0.15; return; }
        startHop(f, to.r, to.c, hopFor(f));
        if (f.kind === 'ball') sndBall();
    }

    function foeFalls(s, f) {
        if (f.kind === 'mummy') {
            G.addScore(500); G.popup(f.x, f.y - 50, 'MUMMY LURED 500', C.gold);
            s.timers.mummy = s.cfg.mummy;
            sndLured();
        }
        if (f.kind === 'anubis') anubisFalls(s, f);
    }

    function anubisFalls(s, f) {
        s.anubisDown = true;
        G.addScore(2000);
        G.popup(f.x, f.y - 60, '2000', C.gold);
        G.shake(9, 0.6); G.flash('rgba(242,193,78,0.35)', 0.3);
        G.sfx('bigboom');
        G.tone(196, 1.4, { type: 'sawtooth', slide: 49, vol: 0.14 });
        s.msg = { text: 'ANUBIS FALLS', t: 2.6 };
        s.discs.forEach(function (d) { d.back = 0; });
        if (levelDone(s)) startWin(s);
    }

    function foeLand(s, f) {
        var st = stone(s, f.tr, f.tc);
        if (!st || st.st === 'gone') { startFall(f, !!st); foeFalls(s, f); return; }
        f.r = f.tr; f.c = f.tc; f.state = 'idle'; f.wait = waitFor(s, f);
        if (f.kind === 'cursed' || f.kind === 'anubis') revertStone(s, st);
        if (f.kind === 'anubis') { G.shake(2, 0.1); sndThud(); }
        if (f.kind === 'mummy') G.noise(0.08, { freq: 300, vol: 0.08 });
    }

    function dropStep(s, f, dt) {
        f.y += f.vy * dt + 0.25 * GRAV * dt * dt;
        f.vy += 0.5 * GRAV * dt;
        if (f.y < cellY(f.r)) return;
        f.y = cellY(f.r); f.vy = 0; f.state = 'idle'; f.wait = waitFor(s, f);
        sndThud();
        if (f.kind === 'cursed') revertStone(s, stone(s, f.r, f.c));
    }

    function wakeStep(s, f, dt) {
        f.t += dt;
        if (f.t < f.wake) return;
        if (f.kind === 'egg') { f.kind = 'mummy'; G.noise(0.5, { filter: 'bandpass', freq: 300, vol: 0.14 }); }
        f.state = 'idle'; f.wait = 0.2;
    }

    function updateFoes(s, dt) {
        s.foes.forEach(function (f) {
            if (f.state === 'drop') dropStep(s, f, dt);
            else if (f.state === 'idle') { f.wait -= dt; if (f.wait <= 0) foeMove(s, f); }
            else if (f.state === 'hop') { if (stepHop(f, dt)) foeLand(s, f); }
            else if (f.state === 'wake') wakeStep(s, f, dt);
            else if (f.state === 'fall') { integrate(f, dt); f.out = f.y > G.H + 80; }
        });
        s.foes = s.foes.filter(function (f) { return !f.out; });
    }

    // ------------------------------------------------------------------
    // The cobra slides along one row; the sand pours down from the apex
    // ------------------------------------------------------------------

    function spawnCobra(s) {
        var row = 2 + Math.floor(G.rnd(0, 4.99)), dir = G.rnd(0, 1) < 0.5 ? 1 : -1;
        s.cobra = { row: row, dir: dir, x: cellX(row, dir > 0 ? -1 : row + 1) - dir * 20, y: cellY(row),
            x1: cellX(row, dir > 0 ? row + 1 : -1) + dir * 40, state: 'warn', t: 1.4 };
        sndHiss();
    }

    function updateCobra(s, dt) {
        var k = s.cobra;
        if (!k) return;
        k.t -= dt;
        if (k.state === 'warn') { if (k.t <= 0) { k.state = 'go'; sndHiss(); } return; }
        k.x += k.dir * 118 * dt;
        if ((k.x - k.x1) * k.dir > 0) s.cobra = null;
    }

    function cobraHits(k, p) {
        if (k.state !== 'go' || Math.abs(p.y - k.y) > 22) return false;
        var tail = k.x - k.dir * 46;
        return p.x > Math.min(k.x, tail) - 14 && p.x < Math.max(k.x, tail) + 14;
    }

    function spawnSand(s) {
        var path = [{ r: 0, c: 0 }], c = 0;
        for (var r = 1; r < ROWS; r++) { c += G.rnd(0, 1) < 0.5 ? 0 : 1; path.push({ r: r, c: c }); }
        s.sand = { path: path, state: 'warn', t: SAND_WARN };
        sndSand(false);
    }

    function updateSand(s, dt) {
        var w = s.sand;
        if (!w || (w.t -= dt) > 0) return;
        if (w.state === 'warn') { w.state = 'pour'; w.t = SAND_POUR; sndSand(true); return; }
        s.sand = null;
    }

    function onSand(s, r, c) {
        return !!s.sand && s.sand.path.some(function (q) { return q.r === r && q.c === c; });
    }

    function updateDiscs(s, dt) {
        s.discs.forEach(function (d) {
            if (!d.used || d.back <= 0 || s.anubisDown) return;
            d.back -= dt;
            if (d.back > 0) return;
            d.used = false;
            var q = discCell(d);
            G.burst(cellX(q.r, q.c), cellY(q.r), { n: 12, color: C.gold, speed: 90, life: 0.5 });
            G.tone(988, 0.2, { type: 'sine', vol: 0.08 });
        });
    }

    // ------------------------------------------------------------------
    // Contact, death and the win
    // ------------------------------------------------------------------

    function catchCursed(s, f) {
        f.out = true;
        G.addScore(300);
        G.popup(f.x, f.y - 40, '300', C.turq);
        G.sfx('coin');
        G.burst(f.x, f.y - 10, { n: 14, color: C.turq, speed: 140, life: 0.5 });
    }

    function collide(s) {
        var p = s.p;
        if (p.state === 'ride' || p.state === 'fall' || p.dropping || p.toDisc) return;
        for (var i = 0; i < s.foes.length; i++) {
            var f = s.foes[i];
            if (f.state === 'fall' || f.out || G.dist(p.x, p.y, f.x, f.y) > HIT_R) continue;
            if (f.kind === 'cursed') { catchCursed(s, f); continue; }
            if (p.inv <= 0) { kill(s, f.kind); return; }
        }
        s.foes = s.foes.filter(function (f) { return !f.out; });
        if (p.inv > 0) return;
        if (s.cobra && cobraHits(s.cobra, p)) kill(s, 'cobra');
        else if (s.sand && s.sand.state === 'pour' && p.state === 'idle' && onSand(s, p.r, p.c)) kill(s, 'sand');
    }

    function kill(s, why) {
        if (s.dead || s.winT > 0) return;
        s.dead = { t: why === 'fall' ? 0.6 : 1.4, why: why, x: s.p.x, y: s.p.y, over: false };
        if (why !== 'fall') { G.shake(5, 0.3); sndCurse(); }
        if (why === 'sand') G.burst(s.p.x, s.p.y - 10, { n: 20, color: C.sand, speed: 160, gravity: 600, life: 0.7 });
        s.dead.over = G.loseLife() <= 0;
    }

    // A new life starts on the capstone with the pyramid cleared of
    // enemies (Anubis rises again from the bottom); the stones keep their gold.
    function respawn(s) {
        s.dead = null; s.p = newPlayer(); s.chase = { r: 0, c: 0 }; s.buf = null;
        s.foes = []; s.cobra = null; s.sand = null;
        var T = s.timers;
        T.ball = 1.6;
        T.mummy = Math.max(T.mummy, 5); T.cursed = Math.max(T.cursed, 3);
        T.cobra = Math.max(T.cobra, 5); T.sand = Math.max(T.sand, 4); T.anubis = 2.2;
    }

    function startWin(s) {
        if (s.winT > 0) return;
        s.winT = 1.5;
        sndFanfare();
        G.flash('rgba(255,241,184,0.3)', 0.4);
    }

    function unusedDiscs(s) { return s.discs.filter(function (d) { return !d.used; }).length; }

    function update(s, dt) {
        s.time += dt;
        if (s.msg && (s.msg.t -= dt) <= 0) s.msg = null;
        updateStones(s, dt);
        if (s.winT > 0) {
            s.winT -= dt;
            if (s.winT <= 0 && !s.won) { s.won = true; G.win(1000 * s.level + unusedDiscs(s) * 100 + G.lives * 250); }
            return;
        }
        if (s.dead) {
            if ((s.dead.t -= dt) <= 0 && !s.dead.over) respawn(s);
            return;
        }
        readInput(s, dt);
        updatePlayer(s, dt);
        spawnFoes(s, dt);
        updateFoes(s, dt);
        updateCobra(s, dt);
        updateSand(s, dt);
        updateDiscs(s, dt);
        collide(s);
    }

    // ------------------------------------------------------------------
    // Drawing: the night desert
    // ------------------------------------------------------------------

    function hash(n) {
        var x = Math.sin(n * 127.1 + 3.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // A detached canvas owned by the level state: the sky, the far
    // pyramids, the dunes and the hieroglyph frieze never change.
    function backdropLayer(scale) {
        var pic = document.createElement('canvas');
        pic.width = Math.round(G.W * scale); pic.height = Math.round(G.H * scale);
        var ctx = pic.getContext('2d');
        ctx.scale(scale, scale);
        var g = ctx.createLinearGradient(0, 0, 0, 440);
        g.addColorStop(0, C.night); g.addColorStop(0.6, '#152a5c'); g.addColorStop(0.85, '#3d3352'); g.addColorStop(1, '#7a4a2a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = '#f6efd8';
        for (var i = 0; i < 110; i++) {
            ctx.globalAlpha = 0.25 + hash(i) * 0.6;
            ctx.fillRect(hash(i + 300) * G.W, 30 + hash(i + 600) * 330, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
        drawFarPyramids(ctx);
        drawDunes(ctx);
        drawFrieze(ctx);
        return pic;
    }

    function drawFarPyramids(ctx) {
        [[96, 420, 96], [210, 420, 60], [850, 420, 110]].forEach(function (q) {
            ctx.fillStyle = '#2b2440';
            ctx.beginPath(); ctx.moveTo(q[0] - q[2], q[1]); ctx.lineTo(q[0], q[1] - q[2] * 0.8); ctx.lineTo(q[0] + q[2], q[1]); ctx.fill();
            ctx.fillStyle = '#3e3150';
            ctx.beginPath(); ctx.moveTo(q[0], q[1] - q[2] * 0.8); ctx.lineTo(q[0] + q[2], q[1]); ctx.lineTo(q[0] + q[2] * 0.3, q[1]); ctx.fill();
        });
    }

    function drawDunes(ctx) {
        ctx.fillStyle = '#4a321d';
        ctx.beginPath(); ctx.moveTo(0, 430);
        ctx.quadraticCurveTo(240, 395, 480, 425); ctx.quadraticCurveTo(720, 450, 960, 412);
        ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
        ctx.fillStyle = '#35230f';
        ctx.beginPath(); ctx.moveTo(0, 480); ctx.quadraticCurveTo(300, 455, 560, 488); ctx.quadraticCurveTo(800, 510, 960, 470);
        ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
    }

    // A lapis band along the bottom with gold glyphs: ankh, eye, feather
    // and water, repeated.
    function drawFrieze(ctx) {
        var y = 518;
        ctx.fillStyle = C.lapis; ctx.fillRect(0, y, G.W, 22);
        ctx.fillStyle = C.gold; ctx.fillRect(0, y, G.W, 2); ctx.fillRect(0, G.H - 2, G.W, 2);
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var x = 14, i = 0; x < G.W; x += 34, i++) {
            var cy = y + 11, k = i % 4;
            if (k === 0) { ctx.moveTo(x + 3, cy - 3); ctx.arc(x, cy - 3, 3, 0, 6.3); ctx.moveTo(x, cy); ctx.lineTo(x, cy + 7); ctx.moveTo(x - 4, cy + 1); ctx.lineTo(x + 4, cy + 1); }
            else if (k === 1) { ctx.moveTo(x - 7, cy); ctx.quadraticCurveTo(x, cy - 6, x + 7, cy); ctx.quadraticCurveTo(x, cy + 4, x - 7, cy); ctx.moveTo(x - 2, cy + 3); ctx.lineTo(x - 4, cy + 8); }
            else if (k === 2) { ctx.moveTo(x, cy + 8); ctx.lineTo(x, cy - 7); ctx.quadraticCurveTo(x + 5, cy - 2, x, cy + 4); }
            else { ctx.moveTo(x - 7, cy + 2); for (var j = 0; j < 4; j++) ctx.lineTo(x - 5 + j * 4, cy + (j % 2 ? 2 : -2)); }
        }
        ctx.stroke();
    }

    function drawTorch(ctx, x, y, t, seed) {
        var f = 0.8 + 0.2 * Math.sin(t * 13 + seed) + 0.1 * Math.sin(t * 29 + seed * 3);
        var g = ctx.createRadialGradient(x, y - 16, 2, x, y - 16, 110 * f);
        g.addColorStop(0, 'rgba(255,170,80,0.38)'); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 120, y - 130, 240, 240);
        ctx.fillStyle = '#3a2814'; ctx.fillRect(x - 3, y - 6, 6, 60);
        ctx.fillStyle = C.gold; ctx.fillRect(x - 8, y - 8, 16, 6);
        ctx.fillStyle = C.torch;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.quadraticCurveTo(x - 6, y - 26 * f, x + Math.sin(t * 9 + seed) * 3, y - 38 * f);
        ctx.quadraticCurveTo(x + 6, y - 24 * f, x + 8, y - 8); ctx.fill();
        ctx.fillStyle = C.goldHi;
        ctx.beginPath(); ctx.ellipse(x, y - 14, 3, 7 * f, 0, 0, 6.3); ctx.fill();
    }

    // The moon slowly climbs, a few stars twinkle and sand drifts across
    // the dunes, so the scene is never still.
    function drawSky(s, ctx) {
        var t = s.time, my = 120 - Math.min(40, s.time * 0.4);
        ctx.fillStyle = 'rgba(246,231,200,0.12)';
        ctx.beginPath(); ctx.arc(820, my, 44, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#f3e6c4';
        ctx.beginPath(); ctx.arc(820, my, 26, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#fff';
        for (var i = 0; i < 8; i++) {
            ctx.globalAlpha = Math.max(0, Math.sin(t * (1.3 + hash(i) * 2) + i * 2));
            ctx.fillRect(hash(i + 40) * G.W, 40 + hash(i + 80) * 260, 2.4, 2.4);
        }
        ctx.globalAlpha = 0.5; ctx.fillStyle = C.sandLit;
        for (var k = 0; k < 18; k++) {
            var x = (hash(k + 7) * G.W + t * (30 + hash(k) * 50)) % (G.W + 40) - 20;
            ctx.fillRect(x, 400 + hash(k + 11) * 110 + Math.sin(t * 2 + k) * 6, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    function drawBackdrop(s, ctx) {
        if (typeof document !== 'undefined') {
            var scale = ctx.getTransform ? ctx.getTransform().a : 1;
            if (!s.bg || s.bgScale !== scale) { s.bg = backdropLayer(scale); s.bgScale = scale; }
            ctx.drawImage(s.bg, 0, 0, G.W, G.H);
        }
        drawSky(s, ctx);
        drawTorch(ctx, 150, 440, s.time, 1);
        drawTorch(ctx, 810, 440, s.time, 4);
    }

    // ------------------------------------------------------------------
    // Drawing: the pyramid of stones
    // ------------------------------------------------------------------

    function stoneOffset(st, t) {
        return st.st === 'shake' ? Math.sin(t * 70 + st.c) * 2.5 : 0;
    }

    function topPath(ctx, x, y, inset) {
        var w = HW - inset * 2, h = TH - inset;
        ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x - w, y); ctx.closePath();
    }

    // Faces are batched into one path per colour: the cubes tile exactly,
    // so the drawing order inside a batch does not matter.
    function drawFaces(s, ctx, sts) {
        ctx.fillStyle = C.faceL; ctx.beginPath();
        sts.forEach(function (q) { ctx.moveTo(q.x - HW, q.y); ctx.lineTo(q.x, q.y + TH); ctx.lineTo(q.x, q.y + TH + SIDE); ctx.lineTo(q.x - HW, q.y + SIDE); ctx.closePath(); });
        ctx.fill();
        ctx.fillStyle = C.faceR; ctx.beginPath();
        sts.forEach(function (q) { ctx.moveTo(q.x, q.y + TH); ctx.lineTo(q.x + HW, q.y); ctx.lineTo(q.x + HW, q.y + SIDE); ctx.lineTo(q.x, q.y + TH + SIDE); ctx.closePath(); });
        ctx.fill();
        // Etched courses and glyph ticks on the faces.
        ctx.strokeStyle = C.etch; ctx.lineWidth = 1.2; ctx.beginPath();
        sts.forEach(function (q) {
            ctx.moveTo(q.x - HW + 4, q.y + 19); ctx.lineTo(q.x - 4, q.y + TH + 17);
            ctx.moveTo(q.x + 10, q.y + 30); ctx.lineTo(q.x + 10, q.y + 44); ctx.moveTo(q.x + 22, q.y + 24); ctx.lineTo(q.x + 22, q.y + 38);
        });
        ctx.stroke();
    }

    function topColor(st) {
        if (st.v >= st.need) return C.gold;
        return st.v > 0 ? C.turq : C.sand;
    }

    function drawTops(s, ctx, sts) {
        [C.sand, C.turq, C.gold].forEach(function (col) {
            ctx.fillStyle = col; ctx.beginPath();
            sts.forEach(function (q) { if (topColor(q.st) === col) topPath(ctx, q.x, q.y, 0); });
            ctx.fill();
        });
        // Gold stones carry a lit inlay; a glint sweeps across them.
        ctx.fillStyle = 'rgba(255,241,184,0.45)'; ctx.beginPath();
        sts.forEach(function (q) { if (q.st.v >= q.st.need) topPath(ctx, q.x, q.y, 7); });
        ctx.fill();
        var sweep = (s.time * 0.35) % 1.6 - 0.3;
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath();
        sts.forEach(function (q) {
            var ph = (q.st.r + q.st.c * 0.5) / ROWS;
            if (q.st.v >= q.st.need && Math.abs(ph - sweep) < 0.07) topPath(ctx, q.x, q.y, 11);
        });
        ctx.fill();
        ctx.strokeStyle = 'rgba(26,18,8,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
        sts.forEach(function (q) { topPath(ctx, q.x, q.y, 0); });
        ctx.stroke();
    }

    // Two-hop stones show their missing hops as lapis dots, cracked stones
    // a dark crack, and a stone that just changed glows.
    function drawMarks(s, ctx, sts) {
        ctx.fillStyle = C.lapis; ctx.beginPath();
        sts.forEach(function (q) {
            var left = q.st.need - q.st.v;
            if (q.st.need < 2 || left <= 0) return;
            for (var i = 0; i < left; i++) { var dx = (i - (left - 1) / 2) * 12; ctx.moveTo(q.x + dx + 4, q.y); ctx.arc(q.x + dx, q.y, 4, 0, 6.3); }
        });
        ctx.fill();
        ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2; ctx.beginPath();
        sts.forEach(function (q) {
            if (!q.st.crack) return;
            ctx.moveTo(q.x - 22, q.y - 2); ctx.lineTo(q.x - 8, q.y + 4); ctx.lineTo(q.x + 2, q.y - 6); ctx.lineTo(q.x + 18, q.y + 3);
            ctx.moveTo(q.x - 8, q.y + 4); ctx.lineTo(q.x - 4, q.y + 13);
        });
        ctx.stroke();
        sts.forEach(function (q) {
            if (!q.st.glow) return;
            ctx.globalAlpha = Math.abs(q.st.glow) * 0.7;
            ctx.fillStyle = q.st.glow > 0 ? C.goldHi : C.carn;
            ctx.beginPath(); topPath(ctx, q.x, q.y, 0); ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawPyramid(s, ctx) {
        var sts = [];
        s.list.forEach(function (st) {
            if (st.st !== 'gone') sts.push({ st: st, x: cellX(st.r, st.c) + stoneOffset(st, s.time), y: cellY(st.r) });
        });
        drawFaces(s, ctx, sts);
        drawTops(s, ctx, sts);
        drawMarks(s, ctx, sts);
        if (s.winT > 0) {
            ctx.globalAlpha = 0.25 + 0.25 * Math.sin(s.time * 20);
            ctx.fillStyle = C.goldHi; ctx.beginPath();
            sts.forEach(function (q) { topPath(ctx, q.x, q.y, 0); });
            ctx.fill(); ctx.globalAlpha = 1;
        }
    }

    // ------------------------------------------------------------------
    // Drawing: discs, sand and the cobra
    // ------------------------------------------------------------------

    // A winged sun-disc: gold disc, carnelian core, lapis and turquoise wings.
    function drawDisc(ctx, x, y, t) {
        var flap = Math.sin(t * 6) * 3;
        ctx.fillStyle = C.lapisHi;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 2); ctx.quadraticCurveTo(x - 30, y - 14 - flap, x - 42, y - 6 - flap); ctx.lineTo(x - 30, y + 2); ctx.lineTo(x - 8, y + 5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 8, y - 2); ctx.quadraticCurveTo(x + 30, y - 14 - flap, x + 42, y - 6 - flap); ctx.lineTo(x + 30, y + 2); ctx.lineTo(x + 8, y + 5); ctx.fill();
        ctx.strokeStyle = C.turq; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x - 12, y + 1); ctx.lineTo(x - 34, y - 4 - flap); ctx.moveTo(x + 12, y + 1); ctx.lineTo(x + 34, y - 4 - flap);
        ctx.stroke();
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.carn; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.3); ctx.fill();
    }

    function drawDiscs(s, ctx) {
        s.discs.forEach(function (d, i) {
            if (d.used) return;
            var q = discCell(d);
            drawDisc(ctx, cellX(q.r, q.c), cellY(q.r) + Math.sin(s.time * 2 + i) * 4, s.time + i);
        });
        if (s.p.state === 'ride') drawDisc(ctx, s.p.x, s.p.y + 6, s.time);
    }

    // Warning: a trickle from the sky and pulsing sand on the path. Pour: a
    // sand river down the whole path.
    function drawSand(s, ctx) {
        var w = s.sand;
        if (!w) return;
        var pour = w.state === 'pour', pts = w.path.map(function (q) { return { x: cellX(q.r, q.c), y: cellY(q.r) }; });
        ctx.fillStyle = C.sandLit;
        ctx.fillRect(AX - (pour ? 7 : 1.5), G.HUD, pour ? 14 : 3, AY - G.HUD);
        if (!pour) {
            ctx.globalAlpha = 0.45 + 0.35 * Math.sin(s.time * 12);
            ctx.fillStyle = C.sandLit; ctx.beginPath();
            pts.forEach(function (q) { ctx.moveTo(q.x + 14, q.y); ctx.ellipse(q.x, q.y, 14, 7, 0, 0, 6.3); });
            ctx.fill(); ctx.globalAlpha = 1;
            return;
        }
        ctx.strokeStyle = 'rgba(234,210,160,0.9)'; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        pts.forEach(function (q) { ctx.lineTo(q.x, q.y); });
        ctx.lineTo(pts[pts.length - 1].x, G.H); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = '#a8864e';
        for (var i = 0; i < 24; i++) {
            var f = (s.time * 1.6 + i / 24) % 1, seg = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1)));
            var u = f * (pts.length - 1) - seg, a = pts[seg], b = pts[seg + 1];
            ctx.fillRect(G.lerp(a.x, b.x, u) + (hash(i) - 0.5) * 14, G.lerp(a.y, b.y, u) + (hash(i + 5) - 0.5) * 8, 3, 3);
        }
    }

    function drawCobra(s, ctx) {
        var k = s.cobra;
        if (!k) return;
        var rear = k.state === 'warn', d = k.dir, y = k.y, x = k.x, t = s.time;
        ctx.strokeStyle = '#2f7a52'; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - d * 50, y - 2);
        for (var i = 1; i <= 6; i++) ctx.lineTo(x - d * (50 - i * 7), y - 3 + Math.sin(t * 12 + i) * (rear ? 1 : 4));
        ctx.lineTo(x, y - (rear ? 30 : 18)); ctx.stroke(); ctx.lineCap = 'butt';
        var hy = y - (rear ? 34 : 22), flare = rear ? 1 + 0.15 * Math.sin(t * 14) : 0.8;
        ctx.fillStyle = '#3e9a66';
        ctx.beginPath(); ctx.ellipse(x, hy, 9 * flare, 13, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.gold;
        ctx.beginPath(); ctx.ellipse(x, hy + 2, 4 * flare, 8, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.carn; ctx.fillRect(x + d * 2 - 1.5, hy - 9, 3, 3);
        if (rear) G.text('!', x, hy - 22, { size: 22, bold: true, color: C.carn, align: 'center' });
    }

    // ------------------------------------------------------------------
    // Drawing: the hero and the enemies (feet at 0,0, facing right)
    // ------------------------------------------------------------------

    // The hero: a little pharaoh in a lapis-and-gold striped nemes.
    function drawHero(ctx, sq) {
        ctx.scale(1 + sq, 1 - sq);
        ctx.fillStyle = C.cream;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-7, -14); ctx.lineTo(7, -14); ctx.lineTo(10, 0); ctx.fill();
        ctx.fillStyle = '#c98b52';
        ctx.beginPath(); ctx.arc(0, -19, 7, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.gold;
        ctx.beginPath(); ctx.moveTo(-13, -18); ctx.lineTo(-10, -38); ctx.lineTo(8, -40); ctx.lineTo(12, -22); ctx.lineTo(4, -24); ctx.lineTo(-4, -22); ctx.fill();
        ctx.fillStyle = C.lapis;
        ctx.fillRect(-12, -26, 5, 3); ctx.fillRect(-11, -33, 6, 3); ctx.fillRect(-4, -39, 3, 8);
        ctx.fillStyle = '#c98b52';
        ctx.beginPath(); ctx.arc(4, -29, 7, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.ink; ctx.fillRect(6, -31, 3, 3);
        ctx.fillStyle = C.lapis; ctx.fillRect(4, -23, 3, 6);
    }

    function drawBall(ctx, col, t) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, -11, 11, 0, 6.3); ctx.fill();
        ctx.strokeStyle = 'rgba(20,10,4,0.75)'; ctx.lineWidth = 1.6; ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(0, 0); ctx.moveTo(-11, -14); ctx.lineTo(11, -14);
        for (var i = -1; i <= 1; i += 2) { ctx.moveTo(-9, -8 + i * 3 + Math.sin(t * 20) * 1.5); ctx.lineTo(-15, -6 + i * 4); ctx.moveTo(9, -8 + i * 3); ctx.lineTo(15, -6 + i * 4); }
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-4, -16, 3, 0, 6.3); ctx.fill();
    }

    function drawEgg(ctx) {
        ctx.fillStyle = C.lapis;
        ctx.beginPath(); ctx.ellipse(0, -16, 10, 16, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.gold;
        ctx.beginPath(); ctx.ellipse(0, -22, 6, 7, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = C.ink; ctx.fillRect(-3, -24, 2, 2); ctx.fillRect(2, -24, 2, 2);
        ctx.fillStyle = C.turq; ctx.fillRect(-8, -12, 16, 3);
    }

    function drawMummy(ctx, t, rise) {
        ctx.scale(1, rise);
        ctx.fillStyle = '#e6dbbf';
        ctx.fillRect(-9, -36, 18, 36);
        ctx.beginPath(); ctx.arc(0, -36, 9, 0, 6.3); ctx.fill();
        ctx.fillRect(4, -26 + Math.sin(t * 8) * 2, 16, 6);
        ctx.strokeStyle = 'rgba(110,90,60,0.8)'; ctx.lineWidth = 1.4; ctx.beginPath();
        for (var i = 0; i < 6; i++) { ctx.moveTo(-9, -6 - i * 6); ctx.lineTo(9, -10 - i * 6); }
        ctx.stroke();
        ctx.fillStyle = C.carn; ctx.fillRect(1, -39, 3, 3); ctx.fillRect(6, -39, 3, 3);
    }

    // Anubis: black jackal head with tall ears, gold collar and kilt.
    function drawAnubis(ctx, t, rise) {
        ctx.scale(1.15, 1.15 * rise);
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-9, -16); ctx.lineTo(9, -16); ctx.lineTo(11, 0); ctx.fill();
        ctx.fillStyle = '#16110c'; ctx.fillRect(-8, -36, 16, 21);
        ctx.fillRect(6, -32 + Math.sin(t * 6) * 2, 12, 5);
        ctx.fillStyle = C.turq; ctx.fillRect(-9, -36, 18, 4);
        ctx.fillStyle = C.gold; ctx.fillRect(-9, -33, 18, 3);
        ctx.fillStyle = '#16110c';
        ctx.beginPath(); ctx.moveTo(-6, -36); ctx.lineTo(-7, -50); ctx.lineTo(-3, -66); ctx.lineTo(0, -52); ctx.lineTo(3, -64); ctx.lineTo(6, -50);
        ctx.lineTo(20, -46); ctx.lineTo(20, -42); ctx.lineTo(6, -40); ctx.lineTo(4, -36); ctx.fill();
        ctx.fillStyle = C.gold; ctx.fillRect(5, -51, 4, 3);
    }

    function drawFoe(s, ctx, f) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.face < 0 ? -1.1 : 1.1, 1.1);
        var rise = f.state === 'wake' ? Math.min(1, 0.2 + f.t / f.wake) : 1;
        if (f.kind === 'ball') drawBall(ctx, C.carn, s.time);
        else if (f.kind === 'cursed') {
            ctx.fillStyle = 'rgba(60,200,180,0.25)'; ctx.beginPath(); ctx.arc(0, -11, 17 + Math.sin(s.time * 8) * 2, 0, 6.3); ctx.fill();
            drawBall(ctx, C.turq, s.time);
        } else if (f.kind === 'egg' && f.state !== 'wake') drawEgg(ctx);
        else if (f.kind === 'anubis') drawAnubis(ctx, s.time, rise);
        else drawMummy(ctx, s.time, rise);
        ctx.restore();
    }

    function drawPlayer(s, ctx) {
        var p = s.p;
        if (s.dead && s.dead.why === 'fall') return;
        if (p.inv > 0 && p.state === 'idle' && Math.floor(s.time * 12) % 2) return;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.face < 0 ? -1.25 : 1.25, 1.25);
        drawHero(ctx, Math.max(0, p.squash));
        ctx.restore();
    }

    // Anything that fell off an upper edge or into a hole is drawn behind
    // the stones; everything else in front, the lower on screen the later.
    function drawActors(s, ctx, behind) {
        var list = s.foes.filter(function (f) { return (f.state === 'fall' && f.behind) === behind; });
        list.sort(function (a, b) { return a.y - b.y; });
        list.forEach(function (f) { drawFoe(s, ctx, f); });
        if ((s.p.state === 'fall' && s.p.behind) === behind) drawPlayer(s, ctx);
    }

    // ------------------------------------------------------------------
    // Drawing: overlays
    // ------------------------------------------------------------------

    // The arrows hop diagonally; this rose in the corner shows which way.
    function drawCompass(s, ctx) {
        var x = 74, y = 462, r = 26, size = s.touch ? 22 : 16;
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath();
        [[1, -1], [1, 1], [-1, 1], [-1, -1]].forEach(function (d) {
            ctx.moveTo(x, y); ctx.lineTo(x + d[0] * r, y + d[1] * r * 0.6);
            ctx.lineTo(x + d[0] * (r - 8), y + d[1] * r * 0.6 - d[1] * 1); ctx.moveTo(x + d[0] * r, y + d[1] * r * 0.6); ctx.lineTo(x + d[0] * r, y + d[1] * (r * 0.6 - 7));
        });
        ctx.stroke();
        G.text('↑', x + r + 10, y - r * 0.6 + 6, { size: size, color: C.cream, align: 'center', bold: true });
        G.text('→', x + r + 12, y + r * 0.6 + 12, { size: size, color: C.cream, align: 'center', bold: true });
        G.text('↓', x - r - 10, y + r * 0.6 + 12, { size: size, color: C.cream, align: 'center', bold: true });
        G.text('←', x - r - 12, y - r * 0.6 + 6, { size: size, color: C.cream, align: 'center', bold: true });
    }

    function drawHint(s, ctx) {
        var lure = s.cfg.anubis && !s.anubisDown && s.time > 9;
        var a = s.time < 8 ? 1 : (lure ? 0.75 : Math.max(0, 1 - (s.time - 8)));
        if (a <= 0) return;
        ctx.globalAlpha = a;
        var size = s.touch ? 22 : 17;
        s.cfg.hint.forEach(function (line, i) {
            G.text(line, 16, 56 + i * (size + 6), { size: size, color: C.cream, glow: C.ink, max: 400 });
        });
        ctx.globalAlpha = 1;
    }

    function drawOverlay(s, ctx) {
        if (s.msg) {
            ctx.globalAlpha = Math.min(1, s.msg.t * 2);
            G.text(s.msg.text, AX, 300, { size: 44, bold: true, color: C.gold, glow: C.carn, align: 'center' });
            ctx.globalAlpha = 1;
        }
        var d = s.dead;
        if (d && d.why !== 'fall') {
            var bx = G.clamp(d.x + 18, 20, G.W - 120), by = Math.max(G.HUD + 8, d.y - 92);
            ctx.fillStyle = C.cream;
            ctx.beginPath(); ctx.ellipse(bx + 48, by + 22, 52, 22, 0, 0, 6.3); ctx.moveTo(bx + 18, by + 36); ctx.lineTo(d.x + 4, d.y - 42); ctx.lineTo(bx + 34, by + 40); ctx.fill();
            G.text('#@!?', bx + 48, by + 31, { size: 24, bold: true, color: C.carn, align: 'center' });
        }
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, G.HUD, G.W, G.H - G.HUD); ctx.clip();
        drawActors(s, ctx, true);
        drawPyramid(s, ctx);
        drawSand(s, ctx);
        drawDiscs(s, ctx);
        drawCobra(s, ctx);
        drawActors(s, ctx, false);
        drawOverlay(s, ctx);
        ctx.restore();
        drawCompass(s, ctx);
        drawHint(s, ctx);
    }

    function hud(s) {
        var txt = 'GOLD ' + doneCount(s) + '/' + s.list.length;
        if (s.cfg.anubis) txt += s.anubisDown ? '  ANUBIS FALLEN' : '  ANUBIS STALKS';
        return txt;
    }

    // ------------------------------------------------------------------
    // The ending: sunrise over the sealed pyramid, its capstone ablaze
    // ------------------------------------------------------------------

    var HORIZON = 372;

    function drawEndingSun(ctx, t) {
        var sy = HORIZON + 40 - Math.min(1, t / 5) * 120;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 200, G.W, HORIZON - 200); ctx.clip();
        var g = ctx.createLinearGradient(0, 200, 0, HORIZON);
        g.addColorStop(0, 'rgba(31,63,143,0)'); g.addColorStop(1, 'rgba(242,140,60,0.6)');
        ctx.fillStyle = g; ctx.fillRect(0, 200, G.W, HORIZON - 200);
        ctx.fillStyle = 'rgba(255,190,90,0.25)';
        ctx.beginPath(); ctx.arc(640, sy, 80, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#ffb54a';
        ctx.beginPath(); ctx.arc(640, sy, 50, 0, 6.3); ctx.fill();
        ctx.restore();
    }

    function drawEndingPyramid(ctx, t) {
        var top = 232, half = 190;
        ctx.fillStyle = '#5a3f22';
        ctx.beginPath(); ctx.moveTo(AX - half, HORIZON); ctx.lineTo(AX, top); ctx.lineTo(AX, HORIZON); ctx.fill();
        ctx.fillStyle = '#b8894e';
        ctx.beginPath(); ctx.moveTo(AX, top); ctx.lineTo(AX + half, HORIZON); ctx.lineTo(AX, HORIZON); ctx.fill();
        ctx.strokeStyle = 'rgba(40,24,8,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
        for (var y = top + 22; y < HORIZON; y += 18) { var w = (y - top) / (HORIZON - top) * half; ctx.moveTo(AX - w, y); ctx.lineTo(AX + w, y); }
        ctx.stroke();
        ctx.fillStyle = C.gold;
        ctx.beginPath(); ctx.moveTo(AX, top); ctx.lineTo(AX + 22, top + 22); ctx.lineTo(AX - 22, top + 22); ctx.fill();
        ctx.fillStyle = '#35230f'; ctx.fillRect(0, HORIZON, G.W, 6);
        // The capstone's glint: a turning four-point star.
        var r = 26 + Math.sin(t * 3) * 8, a = t * 0.8;
        ctx.fillStyle = C.goldHi; ctx.beginPath();
        for (var i = 0; i < 8; i++) {
            var rr = i % 2 ? 5 : r, ang = a + i * Math.PI / 4;
            ctx.lineTo(AX + Math.cos(ang) * rr, top + 4 + Math.sin(ang) * rr);
        }
        ctx.fill();
    }

    function drawEnding(e, ctx) {
        drawEndingSun(ctx, e.t);
        drawEndingPyramid(ctx, e.t);
        drawTorch(ctx, AX - 240, HORIZON, e.t, 2);
        drawTorch(ctx, AX + 240, HORIZON, e.t, 5);
    }

    G.register('pharaoh', {
        title: 'PYRAMID HOP',
        blurb: 'Hop every stone of the pyramid to gold. Do not let the mummies catch you.',
        controls: [
            'Arrows hop diagonally: ↑ up-right · → down-right · ↓ down-left · ← up-left',
            'Touch: the same four arrows, or tap the board on the side you want to hop',
            'Off an edge you fall, except onto a winged sun-disc: it flies you to the top',
            'Dodge scarab balls, mummies, the cobra and sand; catch the turquoise scarab'
        ],
        levelNames: ['Outer Steps', 'Inner Chamber', 'Anubis'],
        colors: { bg: C.night, fg: C.cream, accent: C.gold, dim: C.dim },
        lives: 4,
        music: {
            bpm: 112, root: 45, scale: 'harmonic', prog: [4, 4, 5, 4, 4, 3, 5, 4],
            bass: 'x..x..x.x.o.x...',
            lead: ['4.5.6-5.4---3.4.', '5.6.7-6.5-4.....', '7.8.9-8.7.6.5.6.', '4-------....2.3.',
                'b.a.9.8.7-6-5-4-', '6.7.6.5.4.5.6.7.', '9-8-7-6-5.6.5.4.', '4-----..........'],
            arp: '0..2..1.0..3..2.', drums: { k: 'x.......x..x....', s: '..x...x.....x...', h: 'x.xxx.x.x.xxx.x.' },
            leadWave: 'triangle', bassWave: 'triangle', arpWave: 'sawtooth', leadOct: 1
        },
        touch: { hide: ['a', 'b'], dirs: 4 },
        ending: {
            title: 'TOMB SEALED',
            text: 'Sunrise finds the capstone gold. The pharaoh sleeps.',
            colors: [C.gold, C.lapisHi, C.turq, C.goldHi],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
