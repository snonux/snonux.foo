/*
 * Island Hopper — the tropicale theme's game: a classic jump'n'run.
 *
 * Run and jump across a chain of islands to the tiki totem before the tide
 * comes in. Crabs and gulls can be stomped (a monkey too, by whoever gets
 * above its palm); urchins, coconuts and stalactites cannot. Palm-leaf
 * springs, rafts, moving, lifting and crumbling platforms carry the player
 * over water. Every level is built from a seeded chunk generator whose chunks
 * are each clearable on their own, so any sequence of them is clearable too.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 32, NONE = 99, WATER = 488, LOW = 13;
    var GRAV = 1900, JUMP = 640, CUT = 240, RUN = 230, SPRING = 880, NUT_G = 1000;
    // Forgiveness for a jump pressed a little late (COYOTE: seconds after
    // running off a ledge in which a jump still counts) or a little early
    // (BUFFER: seconds a press is remembered before the feet touch down). At
    // running speed 0.13s is 30px, about one body width past the edge.
    var COYOTE = 0.13, BUFFER = 0.15;
    // One tide surge cycle on the storm level: low, rising, high, falling.
    var TIDE = { period: 12, rise: 6, high: 8, fall: 10.5, lift: 96 };
    var DIVE = 1.5;         // seconds a gull's swoop takes, down and back up
    var WARN = 0.45;        // seconds, at least, between a gull's squawk and its swoop
    // The tide clock: every level starts with CLOCK seconds and each flag
    // adds FLAG_TIME, so a player who keeps going has plenty and one who
    // stands still is flooded out within about a minute.
    var CLOCK = 75, FLAG_TIME = 45;
    // How far below a platform's top the feet may be and still step onto it:
    // enough to walk onto a lift that has just left the ground.
    var STEP_UP = 14;
    // Crumbling slabs: their width (the water between two of them is the
    // rest of four tiles) and how long one shakes under the feet before it
    // drops. Wide and patient enough to land on with a misjudged jump and
    // still line up the next one.
    var SLAB_W = 80, SLAB_HOLD = 0.6;
    var STOMPABLE = { crab: true, gull: true, monkey: true };

    var SETS = {
        beach: { sky0: '#38c9d8', sky1: '#fef9e7', hill: '#8fdccb', soil: '#e8c97a', deep: '#cfa855', cap: '#fef9e7' },
        cave: { sky0: '#0a1e2e', sky1: '#123a52', hill: '#0d2c40', soil: '#4a6276', deep: '#384c5e', cap: '#8fb4c8' },
        storm: { sky0: '#2b4f66', sky1: '#a9c7cf', hill: '#3d6f80', soil: '#d6b96e', deep: '#b89a55', cap: '#f1e6c0' }
    };

    // lo/hi: highest and lowest ground row a level may use (the cave keeps
    // headroom under its ceiling; the storm level keeps ordinary ground above
    // the surge; no level goes above row 7, which leaves a gull room to
    // cruise out of jumping reach below the HUD). gap: widest plain water gap
    // in tiles. red: fast crabs among the slow ones; dense: two crabs to a
    // long beach, longer urchin fields and a quicker monkey. Each level's
    // chunk list adds something the levels before it did not have.
    var LEVELS = [
        // Introduction: crabs, gaps, springs and a raft across a lagoon.
        { set: 'beach', len: 220, lo: 8, hi: 13, gap: 3, gulls: 0, chunks: 'crabs crabs gap gap steps isles blocks urchins spring raft' },
        // Development: a glow-worm cave with falling stalactites, moving
        // planks over wide water, crumbling slabs and a coconut monkey.
        { set: 'cave', len: 260, lo: 9, hi: 13, gap: 4, gulls: 0, chunks: 'crabs gap steps isles urchins spring mover mover drips drips falls monkey' },
        // Finale: a storm whose surges flood the low beaches, swooping gulls,
        // fast red crabs, a lift up a cliff and the tiki totem at the end.
        { set: 'storm', len: 320, lo: 7, hi: 12, gap: 4, gulls: 4, red: true, dense: true, tide: true, chunks: 'tide tide tide crabs gap steps isles urchins spring falls lift mover monkey' }
    ];

    // ------------------------------------------------------------------
    // Level generator
    // ------------------------------------------------------------------

    function ri(L, n) { return Math.floor(L.rnd() * n); }

    function put(L, n, row) { for (var i = 0; i < n; i++) L.top.push(row); }

    // Moves the build height by d rows (positive is down) inside the level's band.
    function shift(L, d) { return G.clamp(L.h + d, L.cfg.lo, L.cfg.hi); }

    function pines(L, x0, n, row) {
        for (var i = 0; i < n; i++) L.pines.push({ x: (x0 + i) * T + 16, y: row * T - 18 });
    }

    // Pineapples along a jump arc: they show the player the way over a gap.
    function pineArc(L, x0, w, row) {
        for (var i = 0; i < w; i++) {
            L.pines.push({ x: (x0 + i) * T + 16, y: row * T - 46 - Math.sin(Math.PI * (i + 0.5) / w) * 44 });
        }
    }

    function addCrab(L, a, b) {
        var red = !!L.cfg.red && L.rnd() < 0.5;
        L.foes.push({
            kind: 'crab', x: (a + b) / 2 * T, y: L.h * T - 18, w: 26, h: 18,
            lo: a * T, hi: b * T - 26, vx: (L.rnd() < 0.5 ? -1 : 1) * (red ? 75 : 42), red: red
        });
    }

    // A long drop needs a long landing: a player who runs off the ledge at
    // full speed must not sail over the low ground into the water beyond it.
    function dropTo(L, row) {
        L.h = row; put(L, 5, row);
    }

    // Springs and lifts need a cliff of four or five rows above them; when
    // the ground is already too high the chunk first drops down.
    function cliffRows(L) {
        if (L.h - 4 < L.cfg.lo) dropTo(L, Math.min(L.cfg.hi, L.cfg.lo + 5));
        return Math.min(5, L.h - L.cfg.lo);
    }

    function shuttle(kind, axis, x, y, a, b, v) {
        return { kind: kind, axis: axis, x: x, y: y, py: y, w: 72, h: 12, a: a, b: b, v: v, vx: 0, wait: 0.6 };
    }

    // Every chunk starts on ground at L.h, ends with at least two columns of
    // ground, keeps its enemies two tiles away from its ends, never rises more
    // than two rows in one step and never opens a gap wider than four tiles
    // without a platform in it. That is what makes any sequence clearable.
    var CHUNKS = {
        crabs: function (L) {
            var n = 8 + ri(L, 6), x0 = L.top.length, mid = x0 + Math.floor(n / 2);
            put(L, n, L.h); pines(L, x0 + 1, n - 2, L.h);
            if (L.rnd() < 0.5) L.palms.push({ x: (x0 + 1) * T + 16, row: L.h, tall: 3 + ri(L, 3) });
            // Two crabs on a long beach keep two tiles of sand between their
            // beats: room to come down after hopping the first one.
            if (L.cfg.dense && n >= 11) { addCrab(L, x0 + 2, mid - 1); addCrab(L, mid + 1, x0 + n - 2); }
            else addCrab(L, x0 + 2, x0 + n - 2);
        },
        urchins: function (L) {
            var n = L.cfg.dense ? 14 : 10, x0 = L.top.length;
            put(L, n, L.h); pines(L, x0 + 1, 2, L.h); pines(L, x0 + 6, 3, L.h);
            for (var c = x0 + 4; c < x0 + n - 3; c += 6) {
                L.foes.push({ kind: 'urchin', x: c * T + 4, y: L.h * T - 22, w: 24, h: 22 });
            }
        },
        steps: function (L) {
            for (var k = 2 + ri(L, 2); k > 0; k--) {
                var n = 3 + ri(L, 3), x0 = L.top.length;
                L.h = shift(L, [-2, -1, 1, 2, 3][ri(L, 5)]);
                put(L, n, L.h); pines(L, x0 + 1, n - 2, L.h);
            }
        },
        gap: function (L) {
            var w = 2 + ri(L, L.cfg.gap - 1), x0;
            put(L, 3, L.h); x0 = L.top.length; put(L, w, NONE); pineArc(L, x0, w, L.h);
            // A four-tile gap must not also climb; narrower ones may rise one row.
            L.h = shift(L, w > 3 ? ri(L, 3) : ri(L, 4) - 1);
            put(L, 4, L.h);
        },
        isles: function (L) {
            put(L, 3, L.h);
            for (var k = 2 + ri(L, 3); k > 0; k--) {
                var w = 2 + ri(L, 2), x0 = L.top.length;
                put(L, w, NONE); pineArc(L, x0, w, L.h);
                L.h = shift(L, ri(L, 3) - 1);
                // An islet is three or four tiles: long enough to land on
                // and still take a step before the next jump.
                put(L, 3 + ri(L, 2), L.h);
            }
            put(L, 2, L.h);
        },
        blocks: function (L) {
            var x0 = L.top.length;
            put(L, 9, L.h); pines(L, x0 + 1, 7, L.h);
            for (var i = 3; i < 6; i++) L.blocks[(x0 + i) + ',' + (L.h - 3)] = true;
            pines(L, x0 + 3, 3, L.h - 3);
            pines(L, x0 + 3, 3, L.h - 4);
        },
        raft: function (L) {
            var w = 9 + ri(L, 6), x0;
            // Rafts float at the waterline, so both shores must be the lowest row.
            dropTo(L, LOW); x0 = L.top.length; put(L, w, NONE); put(L, 4, LOW);
            var raft = shuttle('raft', 'x', x0 * T + 8, WATER - 10, x0 * T + 8, (x0 + w) * T - 96, L.cfg.dense ? 78 : 64);
            raft.w = 88; raft.h = 14;
            L.plats.push(raft);
            for (var i = 1; i < w; i++) L.pines.push({ x: (x0 + i) * T + 16, y: WATER - 62 });
        },
        mover: function (L) {
            var w = 6 + ri(L, 4), x0;
            put(L, 3, L.h); x0 = L.top.length; put(L, w, NONE); put(L, 3, L.h);
            L.plats.push(shuttle('mover', 'x', x0 * T + 8, L.h * T, x0 * T + 8, (x0 + w) * T - 80, 85));
            for (var i = 1; i < w; i++) L.pines.push({ x: (x0 + i) * T + 16, y: L.h * T - 50 });
        },
        lift: function (L) {
            var c = cliffRows(L), x0;
            put(L, 3, L.h); x0 = L.top.length; put(L, 3, NONE);
            L.plats.push(shuttle('lift', 'y', x0 * T + 12, L.h * T, (L.h - c) * T, L.h * T, -70));
            for (var i = 1; i <= c; i++) L.pines.push({ x: x0 * T + 48, y: (L.h - i) * T - 30 });
            L.h -= c; pines(L, L.top.length + 1, 3, L.h); put(L, 4, L.h);
        },
        falls: function (L) {
            put(L, 3, L.h);
            for (var k = 2 + ri(L, 3); k > 0; k--) {
                var x0 = L.top.length;
                put(L, 4, NONE);
                L.plats.push({ kind: 'fall', x: (x0 + 2) * T, y: L.h * T, py: L.h * T, home: L.h * T, w: SLAB_W, h: 12, vx: 0, vy: 0, state: 0, t: 0 });
                pines(L, x0 + 2, 2, L.h - 1);
            }
            put(L, 2, NONE); put(L, 3, L.h);
        },
        spring: function (L) {
            var c = cliffRows(L), x0 = L.top.length;
            put(L, 4, L.h);
            L.springs.push({ x: (x0 + 3) * T + 2, y: L.h * T - 10, w: 28, h: 10, t: 0 });
            for (var i = 1; i <= c; i++) L.pines.push({ x: (x0 + 3) * T + 16, y: (L.h - i) * T - 30 });
            L.h -= c; pines(L, L.top.length + 1, 4, L.h); put(L, 5, L.h);
        },
        monkey: function (L) {
            var x0 = L.top.length, tall = L.h >= 7 ? 4 : 3;
            put(L, 10, L.h); pines(L, x0 + 1, 8, L.h);
            L.palms.push({ x: (x0 + 5) * T + 16, row: L.h, tall: tall });
            L.foes.push({ kind: 'monkey', x: (x0 + 5) * T + 5, y: (L.h - tall) * T - 24, w: 22, h: 24, t: 1 + L.rnd() });
        },
        drips: function (L) {
            var x0 = L.top.length;
            put(L, 9, L.h); pines(L, x0 + 1, 7, L.h);
            for (var c = x0 + 3; c < x0 + 8; c += 3) {
                L.foes.push({ kind: 'drip', x: c * T + 8, y: (L.ceil + 1) * T, w: 16, h: 26, state: 0, t: 0, vy: 0 });
            }
        },
        // Low beach that floods at every surge, then a refuge above the water.
        tide: function (L) {
            var n = 10 + ri(L, 7), x0 = L.top.length;
            L.h = LOW; put(L, n, LOW); pines(L, x0 + 1, n - 2, LOW);
            addCrab(L, x0 + 3, x0 + n - 3);
            L.h = 11; put(L, 4, 11);
        }
    };

    // Chunks are drawn from a shuffled bag, so each kind a level lists really
    // appears, in a different order on every level.
    function nextChunk(L) {
        if (!L.bag.length) {
            L.bag = L.cfg.chunks.split(' ');
            for (var i = L.bag.length - 1; i > 0; i--) {
                var j = ri(L, i + 1), t = L.bag[i];
                L.bag[i] = L.bag[j]; L.bag[j] = t;
            }
        }
        return L.bag.pop();
    }

    function addFlag(L) {
        var x0 = L.top.length;
        put(L, 5, L.h);
        L.flags.push({ x: x0 * T + 76, y: L.h * T, on: false });
    }

    // The highest thing to stand on in each column: the ground, a block, or
    // over water the higher shore — planks, slabs and lifts never go above it.
    function skyline(L) {
        var sky = L.top.slice(), i, j, row;
        for (i = 1; i < sky.length; i++) {
            if (sky[i] !== NONE) continue;
            for (j = i; sky[j] === NONE; j++);
            // Every level starts and ends on ground, so both shores exist.
            row = Math.min(sky[i - 1], sky[j]);
            while (i < j) sky[i++] = row;
        }
        Object.keys(L.blocks).forEach(function (k) {
            var c = k.split(',');
            sky[+c[0]] = Math.min(sky[+c[0]], +c[1]);
        });
        return sky;
    }

    // Gulls cruise just out of reach of a full jump from the highest footing
    // near them, so only a swoop can reach the player. The height follows
    // the terrain: a patrol or a swoop may carry a gull over a cliff.
    function cruiseAlt(sky, x) {
        var c = Math.floor(x / T), row = LOW;
        for (var i = c - 4; i <= c + 5; i++) row = Math.min(row, sky[i] || LOW);
        return Math.max(G.HUD + 10, row * T - 165);
    }

    function addGulls(L) {
        L.sky = skyline(L);
        for (var i = 0; i < L.cfg.gulls; i++) {
            var x = Math.floor(L.cfg.len * (i + 0.8) / (L.cfg.gulls + 0.3)) * T, alt = cruiseAlt(L.sky, x);
            L.foes.push({ kind: 'gull', x: x, y: alt, w: 28, h: 16, home: x, alt: alt, vx: -80, state: 0, t: 0, cool: 1, tx: x, ty: alt });
        }
    }

    function buildLevel(level) {
        var cfg = LEVELS[level - 1];
        var L = {
            cfg: cfg, rnd: G.rng(level * 7919 + 13), bag: [], h: 12, ceil: cfg.set === 'cave' ? 2 : -1,
            top: [], blocks: {}, foes: [], plats: [], springs: [], pines: [], flags: [], palms: []
        };
        var nextFlag = 50;
        put(L, 9, L.h);
        while (L.top.length < cfg.len) {
            if (L.top.length > nextFlag) { addFlag(L); nextFlag += 55; }
            CHUNKS[nextChunk(L)](L);
        }
        var x0 = L.top.length;
        put(L, 12, L.h);
        L.totem = { x: (x0 + 7) * T, y: L.h * T - 84, w: 36, h: 84 };
        addGulls(L);
        return L;
    }

    // The engine probes outside the map: the sides are walls, the sky is open.
    function makeSolid(L) {
        return function (tx, ty) {
            if (tx < 0 || tx >= L.top.length) return true;
            if (ty <= L.ceil) return ty >= 0;
            return ty >= L.top[tx] || !!L.blocks[tx + ',' + ty];
        };
    }

    function init(level) {
        var L = buildLevel(level);
        return {
            cfg: L.cfg, pal: SETS[L.cfg.set], top: L.top, sky: L.sky, ceil: L.ceil, solid: makeSolid(L),
            blockList: Object.keys(L.blocks).map(function (k) { var c = k.split(','); return { tx: +c[0], ty: +c[1] }; }),
            foes: L.foes, plats: L.plats, springs: L.springs, pines: L.pines, flags: L.flags, palms: L.palms,
            totem: L.totem, shots: [], got: 0, combo: 0, cam: 0, touch: G.isTouch(),
            time: CLOCK, flood: 0, tideT: 0, surge: 0, water: WATER,
            cp: { x: 3 * T, y: 12 * T - 28 },
            p: {
                x: 3 * T, y: 12 * T - 28, w: 20, h: 28, vx: 0, vy: 0, face: 1, ground: true, ceil: false, wall: 0,
                coyote: 0, buffer: 0, inv: 0, on: null, sprung: false, run: 0
            }
        };
    }

    // ------------------------------------------------------------------
    // World: tide, platforms
    // ------------------------------------------------------------------

    // 0 at low water, 1 at the top of the surge.
    function surgeAt(t) {
        if (t < TIDE.rise) return 0;
        if (t < TIDE.high) return (t - TIDE.rise) / (TIDE.high - TIDE.rise);
        if (t < TIDE.fall) return 1;
        return 1 - (t - TIDE.fall) / (TIDE.period - TIDE.fall);
    }

    // The countdown is the tide table: at zero the sea floods the whole
    // level for good, which is what makes standing still a losing move.
    function tickWorld(s, dt) {
        var before = s.time;
        s.time -= dt;
        if (s.time <= 0) s.flood = Math.min(s.flood + 55 * dt, 520);
        else if (s.time < 15 && Math.floor(s.time) !== Math.floor(before)) G.tone(880, 0.06, { type: 'triangle', vol: 0.14 });
        if (before > 0 && s.time <= 0) G.sfx('alarm');
        if (s.cfg.tide) {
            var t0 = s.tideT;
            s.tideT = (s.tideT + dt) % TIDE.period;
            // One warning per cycle, at the moment the water starts to climb.
            if (t0 < TIDE.rise && s.tideT >= TIDE.rise) { G.sfx('alarm'); G.noise(1.6, { freq: 300, slide: 1400, vol: 0.12 }); }
            s.surge = surgeAt(s.tideT);
        }
        s.water = WATER - s.surge * TIDE.lift - s.flood;
    }

    // Rafts, movers and lifts go back and forth and rest a moment at each
    // end so there is time to step on and off.
    function moveShuttle(s, pl, dt) {
        pl.vx = 0;
        if (pl.kind === 'raft') pl.y = s.water - 10 + Math.sin(G.t * 2 + pl.a) * 2;
        if (pl.wait > 0) { pl.wait -= dt; return; }
        pl[pl.axis] += pl.v * dt;
        if (pl[pl.axis] <= pl.a || pl[pl.axis] >= pl.b) {
            pl[pl.axis] = G.clamp(pl[pl.axis], pl.a, pl.b);
            pl.v = -pl.v; pl.wait = 0.9;
        } else if (pl.axis === 'x') pl.vx = pl.v;
    }

    // A crumbling slab: shakes once stood on, drops, and grows back later.
    function moveFall(s, pl, dt) {
        if (pl.state === 0 && s.p.on === pl) { pl.state = 1; pl.t = SLAB_HOLD; G.noise(0.3, { freq: 320, slide: 110, vol: 0.2 }); }
        if (pl.state === 1 && (pl.t -= dt) <= 0) { pl.state = 2; pl.vy = 0; }
        if (pl.state === 2) {
            pl.vy += 1400 * dt; pl.y += pl.vy * dt;
            if (pl.y > G.H + 60) { pl.state = 3; pl.t = 2; }
        }
        if (pl.state === 3 && (pl.t -= dt) <= 0) { pl.state = 0; pl.y = pl.home; }
    }

    function movePlats(s, dt) {
        s.plats.forEach(function (pl) {
            pl.py = pl.y;
            if (pl.kind === 'fall') moveFall(s, pl, dt); else moveShuttle(s, pl, dt);
        });
    }

    // ------------------------------------------------------------------
    // Player
    // ------------------------------------------------------------------

    function jump(p) {
        p.vy = -JUMP; p.buffer = 0; p.coyote = 0;
        // Leaving a moving platform keeps its speed, as momentum should.
        if (p.on) { p.vx = G.clamp(p.vx + p.on.vx, -RUN, RUN); p.on = null; }
        G.tone(420, 0.12, { type: 'square', vol: 0.1, slide: 780 });
    }

    function control(s, p, dt) {
        var dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0), held = G.key.a || G.key.up;
        if (dir) {
            // Turning around brakes twice as hard as speeding up.
            var acc = (p.ground ? 1500 : 950) * (dir * p.vx < 0 ? 2 : 1);
            p.vx = G.clamp(p.vx + dir * acc * dt, -RUN, RUN); p.face = dir;
        } else if (p.ground) p.vx -= G.clamp(p.vx, -1700 * dt, 1700 * dt);
        // Coyote time and jump buffering forgive a press slightly late or early.
        p.coyote = p.ground ? COYOTE : p.coyote - dt;
        p.buffer = (G.hit.a || G.hit.up) ? BUFFER : p.buffer - dt;
        if (p.buffer > 0 && p.coyote > 0) jump(p);
        // Letting go early cuts the jump short; a spring launch is not cut.
        if (!held && !p.sprung && p.vy < -CUT) p.vy = -CUT;
        p.vy = Math.min(p.vy + GRAV * dt, 900);
        if (p.vy >= 0) p.sprung = false;
    }

    // Platforms are one-way: the player lands only when falling and when the
    // feet were above the platform's top (or a small step below it) on the
    // previous tick.
    function landing(s, p, feet) {
        if (p.vy < 0) return null;
        for (var i = 0; i < s.plats.length; i++) {
            var pl = s.plats[i];
            if (p.x + p.w > pl.x && p.x < pl.x + pl.w && feet <= pl.py + STEP_UP && p.y + p.h >= pl.y) return pl;
        }
        return null;
    }

    function movePlayer(s, p, dt) {
        var feet = p.y + p.h, carry = p.on ? p.on.vx : 0, fall = p.vy, air = !p.ground;
        // Riding: follow the platform up or down first, then let tileMove
        // carry the body sideways so a shore wall still stops it.
        if (p.on) p.y = p.on.y - p.h;
        p.vx += carry;
        G.tileMove(p, dt, T, s.solid);
        p.vx = p.wall ? 0 : p.vx - carry;
        p.on = p.ground ? null : landing(s, p, feet);
        if (p.on) { p.y = p.on.y - p.h; p.vy = 0; p.ground = true; }
        if (p.ground && air && fall > 500) G.noise(0.05, { freq: 220, vol: 0.12 });
        if (p.ground) s.combo = 0;
        p.run += Math.abs(p.vx) * dt * 0.06;
        if (p.inv > 0) p.inv -= dt;
    }

    function respawn(s) {
        var p = s.p;
        p.x = s.cp.x; p.y = s.cp.y; p.vx = 0; p.vy = 0; p.on = null; p.inv = 2; p.sprung = false; p.ground = true;
        // The clock keeps running, but the storm level's surge starts over so
        // the next life gets a full spell of low water.
        s.tideT = 0; s.surge = 0; s.water = WATER; s.shots = [];
        s.plats.forEach(function (pl) { if (pl.kind === 'fall') { pl.y = pl.home; pl.state = 0; } });
        s.cam = camTarget(s, p);
    }

    // One hit costs a life; play resumes from the last flag while lives
    // remain. The flood at the end of the clock does not go out again, so
    // drowning in it (flooded) takes every life that is left.
    function lose(s, flooded) {
        var p = s.p;
        G.burst(p.x + 10, p.y + 14, { n: 16, color: '#f97316', speed: 220, gravity: 500 });
        if (!flooded) { if (G.loseLife() > 0) respawn(s); return; }
        G.gameOver();
    }

    function camTarget(s, p) {
        return G.clamp(p.x + p.w / 2 - 400 + p.face * 70, 0, s.top.length * T - G.W);
    }

    // ------------------------------------------------------------------
    // Enemies and projectiles
    // ------------------------------------------------------------------

    function moveCrab(f, dt) {
        f.x += f.vx * dt;
        if (f.x < f.lo) { f.x = f.lo; f.vx = Math.abs(f.vx); }
        if (f.x > f.hi) { f.x = f.hi; f.vx = -Math.abs(f.vx); }
    }

    // Straight down onto the marked spot and up again. The cubed sine makes
    // it a plunge with a quick pull-up: the gull is at head height for about
    // a fifth of a second.
    function diveGull(f, dt) {
        f.t += dt;
        f.y = f.alt + (f.ty - f.alt) * Math.pow(Math.sin(Math.PI * Math.min(1, f.t / DIVE)), 3);
        if (f.t >= DIVE) { f.state = 0; f.cool = 3; }
    }

    // Patrols high (state 0). When the player comes near it marks the spot
    // where the player stands, squawks, glides over that spot and hangs
    // there (state 1, at least WARN seconds), then plunges straight down on
    // it (state 2). The mark never moves, so one step aside dodges the
    // swoop anywhere — on the ground, a raft, a plank or a lift.
    function moveGull(s, f, dt) {
        var p = s.p;
        if (f.state === 2) { diveGull(f, dt); return; }
        f.alt += G.clamp(cruiseAlt(s.sky, f.x + 14) - f.alt, -200 * dt, 200 * dt);
        f.y = f.alt + Math.sin(G.t * 3 + f.home) * 6;
        if (f.state === 1) {
            f.t -= dt; f.x += G.clamp(f.tx - f.x, -260 * dt, 260 * dt);
            if (f.t <= 0 && Math.abs(f.tx - f.x) < 1) { f.state = 2; f.t = 0; f.alt = f.y; }
            return;
        }
        f.x += f.vx * dt; f.cool -= dt;
        if (Math.abs(f.x - f.home) > 190) f.vx = (f.x < f.home ? 1 : -1) * 80;
        if (f.cool <= 0 && p.inv <= 0 && Math.abs(p.x - f.x) < 200 && p.y > f.y + 40) {
            f.state = 1; f.t = WARN; f.tx = p.x - 4; f.ty = p.y; f.vx = (f.tx < f.x ? -1 : 1) * 80;
            G.tone(1300, 0.4, { type: 'sawtooth', slide: 700, vol: 0.12 });
        }
    }

    // Lobs a coconut that lands, about a second later, a little ahead of
    // where the player is now.
    function moveMonkey(s, f, dt) {
        var p = s.p, dx = p.x - f.x, ft = 0.95;
        f.t -= dt;
        if (f.t > 0 || Math.abs(dx) > 330 || s.shots.length >= 8) return;
        f.t = s.cfg.dense ? 2.3 : 2.5;
        s.shots.push({ x: f.x + 11, y: f.y, vx: (dx + p.vx * 0.35) / ft, vy: (p.y - f.y) / ft - 0.5 * NUT_G * ft });
        G.tone(300, 0.1, { type: 'triangle', slide: 620, vol: 0.14 });
    }

    // A stalactite shakes when the player comes under it, then drops.
    function moveDrip(s, f, dt) {
        var p = s.p;
        if (f.state === 0 && Math.abs(p.x + 10 - f.x - 8) < 56 && p.y > f.y) {
            f.state = 1; f.t = 0.45;
            G.tone(1700, 0.08, { type: 'triangle', vol: 0.1 });
        }
        if (f.state === 1 && (f.t -= dt) <= 0) f.state = 2;
        if (f.state !== 2) return;
        f.vy += 1400 * dt; f.y += f.vy * dt;
        if (s.solid(Math.floor((f.x + 8) / T), Math.floor((f.y + f.h) / T)) || f.y > s.water) {
            f.dead = true;
            G.burst(f.x + 8, f.y + f.h, { n: 8, color: '#8fb4c8', speed: 150, gravity: 600 });
            G.noise(0.08, { freq: 1600, vol: 0.14 });
        }
    }

    function updateFoes(s, dt) {
        s.foes.forEach(function (f) {
            if (f.kind === 'crab') moveCrab(f, dt);
            else if (f.kind === 'gull') moveGull(s, f, dt);
            else if (f.kind === 'monkey') moveMonkey(s, f, dt);
            else if (f.kind === 'drip') moveDrip(s, f, dt);
        });
        s.foes = s.foes.filter(function (f) { return !f.dead; });
    }

    function stomp(s, p, f) {
        f.dead = true;
        s.combo++;
        // Holding jump turns the stomp into a high bounce.
        p.vy = (G.key.a || G.key.up) ? -560 : -CUT;
        G.addScore(100 * s.combo);
        G.popup(f.x + f.w / 2, f.y - 8, 100 * s.combo, '#fbbf24');
        G.burst(f.x + f.w / 2, f.y + f.h / 2, { n: 12, color: f.kind === 'gull' ? '#fef9e7' : '#f97316', speed: 200, gravity: 600 });
        G.tone(240, 0.1, { type: 'square', slide: 90, vol: 0.18 });
        G.noise(0.08, { freq: 1300, vol: 0.16 });
    }

    // Landing on a stompable enemy from above defeats it; any other contact
    // costs a life. Returns true when the player was hurt.
    function touchFoes(s, p) {
        for (var i = 0; i < s.foes.length; i++) {
            var f = s.foes[i];
            if (f.dead || !G.aabb(p, f)) continue;
            if (STOMPABLE[f.kind] && p.vy > 0 && p.y + p.h - f.y < 18) stomp(s, p, f);
            else if (p.inv <= 0) return true;
        }
        return false;
    }

    // Moves the coconuts; returns true when one hit the player.
    function updateShots(s, p, dt) {
        var hurt = false;
        s.shots = s.shots.filter(function (c) {
            c.vy += NUT_G * dt; c.x += c.vx * dt; c.y += c.vy * dt;
            if (p.inv <= 0 && G.circRect(c.x, c.y, 7, p.x, p.y, p.w, p.h)) { hurt = true; return false; }
            if (!s.solid(Math.floor(c.x / T), Math.floor(c.y / T)) && c.y < s.water) return true;
            G.burst(c.x, c.y, { n: 6, color: '#8a6238', speed: 120, gravity: 500 });
            G.noise(0.06, { freq: 900, vol: 0.12 });
            return false;
        });
        return hurt;
    }

    // ------------------------------------------------------------------
    // Pick-ups, springs, flags
    // ------------------------------------------------------------------

    function collectPines(s, p) {
        var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        s.pines.forEach(function (o) {
            if (o.got || Math.abs(o.x - cx) > 20 || Math.abs(o.y - cy) > 24) return;
            o.got = true; s.got++;
            G.addScore(10);
            // The pitch climbs through a run of pineapples.
            G.tone(900 + (s.got % 6) * 90, 0.07, { type: 'triangle', vol: 0.13 });
            G.burst(o.x, o.y, { n: 4, color: '#fbbf24', speed: 90, life: 0.3 });
            if (s.got % 100 === 0) { G.addLife(5); G.sfx('power'); G.popup(o.x, o.y - 16, '1UP', '#fef9e7'); }
        });
    }

    function useSprings(s, p, dt) {
        s.springs.forEach(function (sp) {
            if (sp.t > 0) sp.t -= dt;
            if (p.vy < 0 || !G.aabb(p, sp)) return;
            p.vy = -SPRING; p.sprung = true; p.on = null; p.coyote = 0; sp.t = 0.35;
            G.tone(170, 0.32, { type: 'sine', slide: 950, vol: 0.24 });
            G.burst(sp.x + 14, sp.y, { n: 6, color: '#46b36b', speed: 140, angle: -Math.PI / 2, spread: 1.4 });
        });
    }

    function touchFlags(s, p) {
        var feet = p.y + p.h;
        s.flags.forEach(function (f) {
            // The pole counts as high as a jump goes, so leaping over it still raises the flag.
            if (f.on || Math.abs(p.x + 10 - f.x) > 22 || feet > f.y + 40 || feet < f.y - 130) return;
            f.on = true;
            s.cp = { x: f.x - 10, y: f.y - p.h };
            s.time += FLAG_TIME;
            G.addScore(200);
            G.popup(f.x, f.y - 70, 'CHECKPOINT +' + FLAG_TIME + 's', '#fef9e7');
            [659, 784, 988].forEach(function (hz, i) { G.tone(hz, 0.1, { type: 'triangle', vol: 0.15, delay: i * 0.07 }); });
        });
    }

    function update(s, dt) {
        var p = s.p;
        tickWorld(s, dt);
        movePlats(s, dt);
        control(s, p, dt);
        movePlayer(s, p, dt);
        updateFoes(s, dt);
        collectPines(s, p);
        useSprings(s, p, dt);
        touchFlags(s, p);
        s.cam += (camTarget(s, p) - s.cam) * Math.min(1, dt * 6);
        G.cam.x = Math.round(s.cam);
        if (p.y + p.h > s.water + 8) {
            G.sfx('splash');
            G.burst(p.x + 10, s.water, { n: 18, color: '#38c9d8', speed: 260, angle: -Math.PI / 2, spread: 1.6, gravity: 700 });
            lose(s, s.flood > 0);
        } else if (updateShots(s, p, dt) || touchFoes(s, p)) lose(s, false);
        else if (G.aabb(p, s.totem)) {
            G.tone(196, 0.5, { type: 'triangle', vol: 0.2 });
            G.win(500 + Math.ceil(Math.max(0, s.time)) * 5 + G.lives * 200);
        }
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // Stable pseudo-random 0..1 for decoration that must not flicker.
    function hash(n) { var v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); }

    function disc(ctx, x, y, rx, ry, color) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }

    function drawSky(s, ctx, cam) {
        var c = s.pal, g = ctx.createLinearGradient(0, 0, 0, G.H), x;
        g.addColorStop(0, c.sky0); g.addColorStop(0.85, c.sky1);
        ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
        if (s.ceil >= 0) { drawGlowworms(ctx, cam); return; }
        disc(ctx, 770 - cam * 0.02, 130, 44, 44, s.cfg.set === 'storm' ? 'rgba(254,249,231,0.35)' : '#fbbf24');
        for (var i = 0; i < 5; i++) {
            // Clouds drift on their own, so the picture never stands still.
            x = ((i * 270 + G.t * (7 + i * 3) - cam * 0.15) % 1300 + 1300) % 1300 - 170;
            var y = 70 + hash(i + 3) * 110;
            disc(ctx, x, y, 46, 14, 'rgba(254,249,231,0.8)');
            disc(ctx, x + 22, y - 10, 26, 14, 'rgba(254,249,231,0.8)');
        }
        ctx.fillStyle = c.hill;
        ctx.beginPath(); ctx.moveTo(0, G.H);
        for (x = 0; x <= G.W; x += 24) {
            var u = x + cam * 0.3;
            ctx.lineTo(x, 400 - 70 * Math.sin(u * 0.006) - 26 * Math.sin(u * 0.017 + 2));
        }
        ctx.lineTo(G.W, G.H); ctx.fill();
    }

    // The cave has no sky: glow-worms twinkle on its back wall instead.
    function drawGlowworms(ctx, cam) {
        for (var i = 0; i < 40; i++) {
            var x = ((hash(i) * 1400 - cam * 0.3) % 1100 + 1100) % 1100 - 60, y = 110 + hash(i + 50) * 330;
            ctx.globalAlpha = 0.35 + 0.35 * Math.sin(G.t * 2 + i * 1.7);
            disc(ctx, x, y, 2.5, 2.5, i % 3 ? '#38c9d8' : '#fbbf24');
        }
        ctx.globalAlpha = 1;
    }

    function drawPalm(ctx, pm) {
        var bx = pm.x, by = pm.row * T, ty = by - pm.tall * T, sway = Math.sin(G.t * 1.3 + pm.x) * 4;
        ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 8, (by + ty) / 2, bx, ty); ctx.stroke();
        ctx.strokeStyle = '#2f9e6b'; ctx.lineWidth = 6;
        for (var i = -2; i <= 2; i++) {
            if (!i) continue;
            ctx.beginPath(); ctx.moveTo(bx, ty);
            ctx.quadraticCurveTo(bx + i * 16, ty - 22 + Math.abs(i) * 6, bx + i * 24 + sway, ty + 8 + Math.abs(i) * 5);
            ctx.stroke();
        }
    }

    function drawColumn(s, ctx, tx) {
        var c = s.pal, top = s.top[tx], x = tx * T, y = top * T;
        if (s.ceil >= 0) {
            var roof = (s.ceil + 1) * T, tip = 5 + hash(tx + 9) * 16;
            ctx.fillStyle = c.soil; ctx.fillRect(x, 0, T, roof);
            ctx.beginPath(); ctx.moveTo(x + 4, roof); ctx.lineTo(x + 16, roof + tip); ctx.lineTo(x + 28, roof); ctx.fill();
            ctx.fillStyle = c.deep; ctx.fillRect(x, roof - 6, T, 6);
        }
        if (top === NONE) return;
        ctx.fillStyle = c.soil; ctx.fillRect(x, y, T, G.H - y);
        ctx.fillStyle = c.deep;
        ctx.fillRect(x + 4 + hash(tx) * 18, y + 14 + hash(tx + 0.5) * 20, 6, 3);
        ctx.fillRect(x + 4 + hash(tx + 0.2) * 18, y + 50 + hash(tx + 0.7) * 30, 5, 3);
        // A darker edge where the next column is lower gives cliffs some depth.
        if (s.top[tx + 1] > top) ctx.fillRect(x + T - 4, y + 7, 4, G.H - y);
        ctx.fillStyle = c.cap; ctx.fillRect(x, y, T, 7);
    }

    function drawTerrain(s, ctx, cam) {
        var x0 = Math.max(0, Math.floor(cam / T)), x1 = Math.min(s.top.length - 1, x0 + 31), c = s.pal;
        s.palms.forEach(function (pm) { if (pm.x > cam - 80 && pm.x < cam + G.W + 80) drawPalm(ctx, pm); });
        for (var tx = x0; tx <= x1; tx++) drawColumn(s, ctx, tx);
        s.blockList.forEach(function (b) {
            if (b.tx < x0 || b.tx > x1) return;
            ctx.fillStyle = c.deep; ctx.fillRect(b.tx * T, b.ty * T, T, T);
            ctx.fillStyle = c.soil; ctx.fillRect(b.tx * T + 3, b.ty * T + 3, T - 6, T - 6);
            ctx.fillStyle = c.cap; ctx.fillRect(b.tx * T, b.ty * T, T, 5);
        });
    }

    function drawPlat(s, ctx, pl) {
        var x = pl.x, y = pl.y;
        if (pl.kind === 'fall') {
            if (pl.state === 3) return;
            if (pl.state === 1) x += Math.sin(G.t * 70) * 2;
            ctx.fillStyle = s.pal.deep; ctx.fillRect(x, y, pl.w, pl.h);
            ctx.fillStyle = s.pal.cap; ctx.fillRect(x, y, pl.w, 4);
            ctx.fillStyle = '#0a1e2e'; ctx.fillRect(x + 20, y + 4, 2, 8); ctx.fillRect(x + 42, y + 4, 2, 8);
            return;
        }
        if (pl.kind === 'lift') {
            // Ropes up to the sky show at a glance that this one travels vertically.
            ctx.strokeStyle = '#e8c97a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, G.HUD); ctx.moveTo(x + pl.w - 6, y); ctx.lineTo(x + pl.w - 6, G.HUD); ctx.stroke();
        }
        ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y, pl.w, pl.h);
        ctx.fillStyle = '#b7793c'; ctx.fillRect(x, y, pl.w, 5);
        ctx.fillStyle = '#e8c97a';
        ctx.fillRect(x + 12, y, 4, pl.h); ctx.fillRect(x + pl.w - 16, y, 4, pl.h);
    }

    // The route fruit is numerous, so each colour is one path for the viewport.
    function drawPines(s, ctx, cam) {
        var visible = s.pines.filter(function (o) { return !o.got && o.x > cam - 20 && o.x < cam + G.W + 20; });
        var points = visible.map(function (o) { return { x: o.x, y: o.y + Math.sin(G.t * 4 + o.x * 0.05) * 2 }; });
        ctx.fillStyle = '#2f9e6b'; ctx.beginPath();
        points.forEach(function (o) {
            ctx.moveTo(o.x - 6, o.y - 7); ctx.lineTo(o.x, o.y - 17); ctx.lineTo(o.x + 6, o.y - 7); ctx.closePath();
        });
        ctx.fill();
        if (s.touch) pineBodies(ctx, points, 10, 12, '#0a1e2e');
        pineBodies(ctx, points, 7, 9, '#f97316');
        pineBodies(ctx, points, 5.5, 7.5, '#fbbf24');
    }

    function pineBodies(ctx, points, rx, ry, color) {
        ctx.fillStyle = color; ctx.beginPath();
        points.forEach(function (o) {
            ctx.moveTo(o.x + rx, o.y); ctx.ellipse(o.x, o.y, rx, ry, 0, 0, Math.PI * 2); ctx.closePath();
        });
        ctx.fill();
    }

    function drawPickups(s, ctx, cam) {
        drawPines(s, ctx, cam);
        s.springs.forEach(function (sp) {
            if (sp.x < cam - 40 || sp.x > cam + G.W + 20) return;
            // The leaf dips while it flings the player.
            var dip = sp.t > 0 ? 6 : 0;
            ctx.strokeStyle = '#2f9e6b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(sp.x - 2, sp.y + 10);
            ctx.quadraticCurveTo(sp.x + 14, sp.y - 8 + dip * 2, sp.x + 30, sp.y + 2 + dip); ctx.stroke();
            ctx.strokeStyle = '#a8e6c9'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(sp.x + 2, sp.y + 8); ctx.quadraticCurveTo(sp.x + 14, sp.y - 6 + dip * 2, sp.x + 26, sp.y + 2 + dip); ctx.stroke();
        });
        s.flags.forEach(function (f) {
            if (f.x < cam - 40 || f.x > cam + G.W + 20) return;
            var wave = Math.sin(G.t * 6) * 3, top = f.y - 58;
            ctx.fillStyle = '#fef9e7'; ctx.fillRect(f.x - 2, top, 4, 58);
            ctx.fillStyle = f.on ? '#f97316' : 'rgba(254,249,231,0.55)';
            ctx.beginPath(); ctx.moveTo(f.x + 2, top + (f.on ? 0 : 30)); ctx.lineTo(f.x + 28, top + 9 + (f.on ? wave : 30));
            ctx.lineTo(f.x + 2, top + 18 + (f.on ? 0 : 30)); ctx.fill();
        });
    }

    function drawTotem(s, ctx) {
        var t = s.totem, glow = 0.6 + 0.4 * Math.sin(G.t * 4);
        for (var i = 0; i < 3; i++) {
            var y = t.y + i * 28, w = 36 - (i === 1 ? 6 : 0), x = t.x + (36 - w) / 2;
            ctx.fillStyle = i === 1 ? '#f97316' : '#8a5a2b'; ctx.fillRect(x, y, w, 28);
            ctx.fillStyle = '#0a1e2e'; ctx.fillRect(x + 6, y + 18, w - 12, 5);
            ctx.globalAlpha = glow;
            ctx.fillStyle = '#fbbf24'; ctx.fillRect(x + 6, y + 6, 8, 7); ctx.fillRect(x + w - 14, y + 6, 8, 7);
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#2f9e6b';
        ctx.beginPath(); ctx.moveTo(t.x - 6, t.y); ctx.lineTo(t.x + 18, t.y - 16 - glow * 4); ctx.lineTo(t.x + 42, t.y); ctx.fill();
    }

    function drawCrab(ctx, f) {
        var cx = f.x + 13, step = Math.sin(G.t * 14 + f.lo) * 3, col = f.red ? '#e11d48' : '#f97316';
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 8, f.y + 12); ctx.lineTo(cx - 13 - step, f.y + 18);
        ctx.moveTo(cx + 8, f.y + 12); ctx.lineTo(cx + 13 - step, f.y + 18);
        ctx.moveTo(cx - 11, f.y + 6); ctx.lineTo(cx - 15, f.y);
        ctx.moveTo(cx + 11, f.y + 6); ctx.lineTo(cx + 15, f.y);
        ctx.stroke();
        disc(ctx, cx, f.y + 10, 12, 7, col);
        disc(ctx, cx - 4, f.y + 3, 2.5, 2.5, '#fef9e7'); disc(ctx, cx + 4, f.y + 3, 2.5, 2.5, '#fef9e7');
        disc(ctx, cx - 4, f.y + 3, 1, 1, '#0a1e2e'); disc(ctx, cx + 4, f.y + 3, 1, 1, '#0a1e2e');
    }

    function drawUrchin(ctx, f) {
        var cx = f.x + 12, cy = f.y + 13, len = 12 + Math.sin(G.t * 5 + f.x) * 2;
        ctx.strokeStyle = '#fef9e7'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i < 9; i++) {
            var a = Math.PI + i * Math.PI / 8;
            ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        }
        ctx.stroke();
        disc(ctx, cx, cy + 2, 9, 7, '#6d28a8');
        disc(ctx, cx - 3, cy, 2, 2, '#f97316');
    }

    // The visible warning of a swoop: a red "!" under the gull while it lines
    // up, and a red arrowhead over the marked spot until the swoop is over.
    function drawGullMark(ctx, f, cx, cy, touch) {
        var mx = f.tx + 14, my = f.ty - 12 + Math.sin(G.t * 12) * 3;
        if (f.state === 1) G.text('!', cx, cy + 40, { size: touch ? 34 : 28, bold: true, color: '#e11d48', align: 'center', glow: touch ? '#0a1e2e' : null });
        if (touch) {
            ctx.strokeStyle = '#0a1e2e'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(mx - 9, my - 12); ctx.lineTo(mx + 9, my - 12); ctx.lineTo(mx, my); ctx.closePath(); ctx.stroke();
        }
        ctx.fillStyle = '#e11d48';
        ctx.beginPath(); ctx.moveTo(mx - 9, my - 12); ctx.lineTo(mx + 9, my - 12); ctx.lineTo(mx, my); ctx.fill();
    }

    function drawGull(ctx, f, touch) {
        var cx = f.x + 14, cy = f.y + 8, flap = Math.sin(G.t * (f.state ? 22 : 11) + f.home) * 9, d = f.vx < 0 ? -1 : 1;
        if (f.state) drawGullMark(ctx, f, cx, cy, touch);
        ctx.strokeStyle = '#fef9e7'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy - flap); ctx.lineTo(cx, cy); ctx.lineTo(cx + 16, cy - flap);
        ctx.stroke();
        disc(ctx, cx, cy + 1, 9, 5, '#fef9e7');
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.moveTo(cx + d * 8, cy - 2); ctx.lineTo(cx + d * 16, cy + 1); ctx.lineTo(cx + d * 8, cy + 3); ctx.fill();
        disc(ctx, cx + d * 5, cy - 1, 1.2, 1.2, '#0a1e2e');
    }

    function drawMonkey(ctx, f) {
        var cx = f.x + 11, arm = f.t < 0.5 ? -10 : 4;
        ctx.strokeStyle = '#7a4a21'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 8, f.y + 20); ctx.quadraticCurveTo(cx - 20, f.y + 22, cx - 16, f.y + 10 + Math.sin(G.t * 3 + f.x) * 3);
        // The arm goes up shortly before the next coconut: a fair warning.
        ctx.moveTo(cx + 6, f.y + 14); ctx.lineTo(cx + 13, f.y + 12 + arm);
        ctx.stroke();
        disc(ctx, cx, f.y + 17, 8, 7, '#7a4a21');
        disc(ctx, cx, f.y + 7, 7, 7, '#7a4a21');
        disc(ctx, cx, f.y + 8, 4.5, 4.5, '#e8c97a');
        disc(ctx, cx - 2, f.y + 7, 1, 1, '#0a1e2e'); disc(ctx, cx + 2, f.y + 7, 1, 1, '#0a1e2e');
        if (f.t < 0.5) disc(ctx, cx + 14, f.y + 10 + arm, 5, 5, '#5b3a1a');
    }

    function drawFoes(s, ctx, cam) {
        s.foes.forEach(function (f) {
            if (f.x < cam - 60 || f.x > cam + G.W + 60) return;
            if (f.kind === 'crab') drawCrab(ctx, f);
            else if (f.kind === 'urchin') drawUrchin(ctx, f);
            else if (f.kind === 'gull') drawGull(ctx, f, s.touch);
            else if (f.kind === 'monkey') {
                drawMonkey(ctx, f);
                if (s.touch && f.t < 0.5) G.text('!', f.x + 11, f.y - 8, { size: 28, bold: true, color: '#fbbf24', align: 'center', glow: '#0a1e2e' });
            }
            else {
                var x = f.x + (f.state === 1 ? Math.sin(G.t * 80) * 2 : 0);
                ctx.fillStyle = '#8fb4c8';
                ctx.beginPath(); ctx.moveTo(x, f.y); ctx.lineTo(x + 8, f.y + f.h); ctx.lineTo(x + 16, f.y); ctx.fill();
                if (s.touch && f.state === 1) G.text('!', x + 8, f.y + f.h + 28, { size: 28, bold: true, color: '#fbbf24', align: 'center', glow: '#0a1e2e' });
            }
        });
        s.shots.forEach(function (c) {
            if (c.x < cam - 10 || c.x > cam + G.W + 10 || c.y < G.HUD - 10 || c.y > G.H + 10) return;
            if (s.touch) disc(ctx, c.x, c.y, 9, 9, '#fef9e7');
            disc(ctx, c.x, c.y, 7, 7, '#5b3a1a');
            disc(ctx, c.x - 2, c.y - 2, 2, 2, '#b7793c');
        });
    }

    function drawPlayer(s, ctx) {
        var p = s.p, x = p.x, y = p.y, d = p.face, air = !p.ground;
        // Blinks while the respawn protection lasts.
        if (p.inv > 0 && Math.floor(G.t * 12) % 2) return;
        // A dark rim separates the small runner from sand, fruit and white clouds.
        if (s.touch) {
            ctx.strokeStyle = '#0a1e2e'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x - 1, y + 2); ctx.lineTo(x + 21, y + 2);
            ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + 4, y + 9);
            ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 16, y + 9);
            ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + 2, y + 22); ctx.lineTo(x + 18, y + 22); ctx.lineTo(x + 18, y + 10); ctx.stroke();
        }
        var stride = air ? 4 : Math.sin(p.run * 6) * 4;
        ctx.fillStyle = '#0e7490';
        ctx.fillRect(x + 3 + stride, y + 20, 6, 8); ctx.fillRect(x + 11 - stride, y + 20, 6, 8);
        ctx.fillStyle = '#f97316'; ctx.fillRect(x + 2, y + 16, 16, 6);
        ctx.fillStyle = '#fef9e7'; ctx.fillRect(x + 2, y + 9, 16, 8);
        ctx.fillStyle = '#f2c28b';
        ctx.fillRect(x + 4, y + 2, 12, 8);
        ctx.fillRect(x + (d > 0 ? 16 : -1), y + (air ? 5 : 11), 5, 4);
        ctx.fillStyle = '#0a1e2e'; ctx.fillRect(x + (d > 0 ? 12 : 6), y + 5, 2, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x - 1, y + 1, 22, 3); ctx.fillRect(x + 4, y - 3, 12, 5);
        ctx.fillStyle = '#f97316'; ctx.fillRect(x + 4, y, 12, 2);
    }

    // The sea is drawn last and see-through, so flooded ground and anything
    // sinking stay visible beneath it.
    function drawWater(s, ctx, cam) {
        var x;
        ctx.fillStyle = s.ceil >= 0 ? 'rgba(10,60,84,0.8)' : 'rgba(14,116,144,0.78)';
        ctx.beginPath(); ctx.moveTo(0, G.H);
        for (x = 0; x <= G.W; x += 16) ctx.lineTo(x, s.water + Math.sin((x + cam) * 0.03 + G.t * 3) * 3);
        ctx.lineTo(G.W, G.H); ctx.fill();
        ctx.strokeStyle = 'rgba(254,249,231,0.75)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (x = 0; x <= G.W; x += 16) ctx.lineTo(x, s.water + Math.sin((x + cam) * 0.03 + G.t * 3) * 3);
        ctx.stroke();
    }

    function draw(s, ctx) {
        var cam = Math.round(s.cam);
        drawSky(s, ctx, cam);
        ctx.save();
        // Everything in the world is clipped below the HUD strip.
        ctx.beginPath(); ctx.rect(0, G.HUD, G.W, G.H - G.HUD); ctx.clip();
        ctx.translate(-cam, 0);
        drawTerrain(s, ctx, cam);
        s.plats.forEach(function (pl) { if (pl.x > cam - 100 && pl.x < cam + G.W + 20) drawPlat(s, ctx, pl); });
        drawPickups(s, ctx, cam);
        if (s.totem.x > cam - 60 && s.totem.x < cam + G.W + 40) drawTotem(s, ctx);
        drawFoes(s, ctx, cam);
        drawPlayer(s, ctx);
        ctx.translate(cam, 0);
        drawWater(s, ctx, cam);
        ctx.restore();
        if (s.cfg.tide && s.tideT >= TIDE.rise - 1 && s.tideT < TIDE.high && Math.floor(G.t * 6) % 2) {
            // The runner and a warning gull sit left of centre; keep the phone
            // tide notice in the open sky to their right.
            G.text(s.touch ? 'SURGE! HIGH GROUND' : 'SURGE! GET TO HIGH GROUND', s.touch ? G.W - 18 : G.W / 2, 64,
                { size: s.touch ? 28 : 18, bold: true, color: '#fef9e7', align: s.touch ? 'right' : 'center', glow: s.touch ? '#0a1e2e' : '#f97316' });
        }
    }

    // ------------------------------------------------------------------
    // The ending: the island festival at the totem
    // ------------------------------------------------------------------

    // The totem stands lit by two torches between palms, a string of paper
    // lanterns sways above the title and the islanders dance in silhouette,
    // under tropical fireworks. Everything follows from the scene's clock.
    // The scene keeps to the strip under the score line (y 300-372) and the
    // band over the title, so the ending text stays readable.
    var LANTERNS = ['#fbbf24', '#f97316', '#38c9d8', '#46b36b', '#e11d48'];

    function drawFestivalTotem(ctx, t) {
        var x = G.W / 2 - 18, y = 372 - 66, k, flick;
        ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x, y, 36, 66);
        ctx.fillStyle = '#fbbf24';
        for (k = 0; k < 2; k++) { ctx.fillRect(x + 6, y + 10 + k * 28, 7, 7); ctx.fillRect(x + 23, y + 10 + k * 28, 7, 7); }
        for (k = -1; k <= 1; k += 2) {
            flick = 4 + Math.sin(t * 17 + k) * 2;
            ctx.fillStyle = '#6e4b28'; ctx.fillRect(G.W / 2 + k * 70 - 3, 328, 6, 44);
            disc(ctx, G.W / 2 + k * 70, 322, 7, 9 + flick, '#f97316');
            disc(ctx, G.W / 2 + k * 70, 325, 4, 5 + flick / 2, '#fef9e7');
        }
    }

    function drawFestival(e, ctx) {
        var t = e.t, k, x, y, hop;
        ctx.fillStyle = 'rgba(10,30,46,0.85)'; ctx.fillRect(0, 372, G.W, G.H - 372);
        drawFestivalTotem(ctx, t);
        for (k = 0; k < 4; k++) drawPalm(ctx, { x: k < 2 ? 60 + k * 110 : G.W - 60 - (k - 2) * 110, row: 372 / T, tall: 4 + (k % 2) });
        // Lanterns hang on a sagging line across the top of the scene.
        for (k = 0; k < 13; k++) {
            x = 40 + k * 73; y = 34 + Math.sin(k / 12 * Math.PI) * 22 + Math.sin(t * 2 + k) * 3;
            disc(ctx, x, y, 8, 10, LANTERNS[k % LANTERNS.length]);
        }
        // Dancers: bobbing silhouettes in a ring around the totem.
        for (k = 0; k < 8; k++) {
            x = G.W / 2 + Math.cos(t * 0.8 + k * Math.PI / 4) * 230; hop = Math.abs(Math.sin(t * 5 + k)) * 8;
            disc(ctx, x, 346 - hop, 6, 6, '#0a1e2e');
            ctx.fillStyle = '#0a1e2e'; ctx.fillRect(x - 5, 353 - hop, 10, 19);
        }
    }

    function hud(s) {
        var time = Math.max(0, Math.ceil(s.time));
        return s.touch ? 'PINE ' + (s.got % 100) + '/100 ' + time + 's' : 'PINEAPPLES ' + (s.got % 100) + '/100  TIDE ' + time;
    }

    G.register('tropicale', {
        title: 'ISLAND HOPPER',
        blurb: 'Hop the islands and reach the tiki totem before the tide comes in.',
        controls: [
            '← → run · SPACE / ↑ / JUMP: hold to jump higher',
            'Stomp crabs and gulls · dodge spikes and coconuts',
            'Ride rafts and lifts · palm leaves spring you up',
            'Flags save progress +45s · 100 pineapples = 1 life'
        ],
        levelNames: ['Shell Beach', 'Glow Cave', 'Totem Storm'],
        colors: { bg: '#0a1e2e', fg: '#fef9e7', accent: '#fbbf24', dim: '#38c9d8' },
        lives: 4,
        // A syncopated steel-drum line over a 3-3-2 calypso bass, in C major pentatonic.
        music: {
            bpm: 118, root: 48, scale: 'majorpenta', prog: [0, 3, 4, 3],
            bass: 'x..x..o.x..x..5.',
            lead: ['5..5.7.5..4.5...', '3..3.4.5..7.5...', '4..4.5.7..8.7...', '6..6.5.3..4.3---',
                '7.8.7.5.7.8.7.5.', '6.8.6.3.6.8.6.3.', '7.9.7.4.7.9.7.5.', '6.5.4.3.5---....'],
            arp: '0.12.0.1',
            drums: { k: 'x..x..x.x..x..x.', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' },
            leadWave: 'triangle', bassWave: 'triangle', arpWave: 'sine', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // Run and jump only: two big direction buttons and one action button.
        touch: { a: 'JUMP', hide: ['up', 'down', 'b'] },
        ending: {
            title: 'ISLAND FESTIVAL',
            text: 'The totem is reached. The islands dance till dawn.',
            colors: LANTERNS,
            draw: drawFestival
        }
    });
})();
