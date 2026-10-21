/*
 * Composition — the bauhaus theme's game. A Tempest-style tube shooter drawn
 * as a flat Bauhaus print: the tube is a shape (circle, triangle, square…)
 * projected from a small copy of itself at the centre out to a heavy black
 * rim. The player rides the rim lane to lane with real angular momentum and
 * fires down the lane it is on; red circles, yellow triangles and blue
 * squares climb out of the centre, and whatever reaches the rim crawls along
 * it towards the player. Clear the quota, then dive down the tube — past
 * the spikes the spikers left behind.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var CREAM = '#efe7d6', PAPER = '#f8f3e8', RED = '#d62d20', YELLOW = '#f2b705', BLUE = '#1f4e9c';
    var BLACK = '#141210', GREY = '#a59d8d', WASH = 'rgba(242,183,5,0.38)';
    var TAU = Math.PI * 2;
    // Player and shots: lanes per second for the slide, depth (0 centre,
    // 1 rim) per second for everything travelling along a lane.
    var ACC = 70, VMAX = 11, SPRING = 170, DAMP = 23;
    var SHOT_SPEED = 2.6, SHOT_MAX = 7, FIRE_GAP = 0.1, CATCH = 0.32, DIVE_TIME = 1.9, INV_TIME = 2.2;
    var SCORE = { climber: 100, flipper: 150, spiker: 200, tanker: 250 };
    var COLOR = { climber: RED, flipper: YELLOW, spiker: BLUE, tanker: BLUE };
    var SHAPE_NAME = { circle: 'circle', triangle: 'triangle', square: 'square', star: 'star' };

    // Level 1 teaches the rim on a round tube with plain climbers; level 2
    // adds the angular tube, flippers that change lanes, spikers and enemy
    // fire; level 3 spins and morphs the tube through four shapes, adds
    // tankers that split, and ends at the Kandinsky core.
    var CFG = [
        { shapes: ['circle'], lanes: 16, R: 236, cx: 480, cy: 290, vpy: -12, inner: 0.13, quota: 30, maxAlive: 7,
            spawn: [2.0, 1.1], mix: { climber: 1 }, climb: 0.15, crawl: 0.62, flipGap: [1, 1], fire: 0,
            spin: 0, hold: 0, morph: 0, boss: false, seed: 101 },
        { shapes: ['triangle'], lanes: 15, R: 292, cx: 480, cy: 338, vpy: 0, inner: 0.13, quota: 36, maxAlive: 9,
            spawn: [1.8, 1.0], mix: { climber: 0.3, flipper: 0.48, spiker: 0.22 }, climb: 0.19, crawl: 0.5,
            flipGap: [0.7, 1.5], fire: 0.35, spin: 0, hold: 0, morph: 0, boss: false, seed: 202 },
        { shapes: ['square', 'star', 'triangle', 'circle'], lanes: 12, R: 226, cx: 480, cy: 292, vpy: 0, inner: 0.2,
            quota: 36, maxAlive: 10, spawn: [1.7, 0.95], mix: { climber: 0.2, flipper: 0.35, spiker: 0.2, tanker: 0.25 },
            climb: 0.2, crawl: 0.45, flipGap: [0.6, 1.3], fire: 0.45, spin: 0.16, hold: 7, morph: 2.4, boss: true, seed: 303 }
    ];

    // ------------------------------------------------------------------
    // Shapes: N rim vertices, clockwise from the top, around (0, 0)
    // ------------------------------------------------------------------

    function polygon(corners, n) {
        var out = [], per = n / corners.length;
        for (var k = 0; k < n; k++) {
            var j = Math.floor(k / per), f = (k % per) / per, a = corners[j], b = corners[(j + 1) % corners.length];
            out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        }
        return out;
    }

    function radial(n, radius, stretch) {
        var out = [];
        for (var k = 0; k < n; k++) {
            var a = -Math.PI / 2 + TAU * k / n, r = radius(k);
            out.push([Math.cos(a) * r * stretch, Math.sin(a) * r]);
        }
        return out;
    }

    function shapePoints(name, n, R) {
        if (name === 'circle') return radial(n, function () { return R; }, 1.1);
        if (name === 'star') return radial(n, function (k) { return k % 2 ? R * 0.56 : R * 1.08; }, 1.05);
        if (name === 'triangle') {
            var c = [-90, 30, 150].map(function (d) { var a = d * Math.PI / 180; return [Math.cos(a) * R, Math.sin(a) * R]; });
            return polygon(c, n);
        }
        var h = R * 0.9;
        return polygon([[-h, -h], [h, -h], [h, h], [-h, h]], n);
    }

    function smooth(t) { return t * t * (3 - 2 * t); }

    // Which two shapes the tube is between right now, and how far along.
    function shapeAt(s) {
        var c = s.cfg, n = c.shapes.length;
        if (n === 1) return { a: 0, b: 0, m: 0 };
        var cycle = c.hold + c.morph, t = s.clock % (cycle * n), i = Math.floor(t / cycle), f = t - i * cycle;
        return { a: i, b: (i + 1) % n, m: f < c.hold ? 0 : smooth((f - c.hold) / c.morph) };
    }

    // Rebuilds the rim from the current shape, spin and dive zoom.
    function updateGeo(s) {
        var c = s.cfg, sh = shapeAt(s), A = s.shapes[sh.a], B = s.shapes[sh.b];
        var zoom = 1 + s.dive * s.dive * 2.6, cs = Math.cos(s.rot) * zoom, sn = Math.sin(s.rot) * zoom;
        for (var k = 0; k < s.n; k++) {
            var x = A[k][0] + (B[k][0] - A[k][0]) * sh.m, y = A[k][1] + (B[k][1] - A[k][1]) * sh.m;
            s.rim[k][0] = c.cx + x * cs - y * sn;
            s.rim[k][1] = c.cy + x * sn + y * cs;
        }
        s.shapeNow = sh.m > 0.5 ? c.shapes[sh.b] : c.shapes[sh.a];
        s.morphing = sh.m > 0 && sh.m < 1;
    }

    // ------------------------------------------------------------------
    // Projection: rim vertex k at depth z (0 = the far centre, 1 = the rim)
    // ------------------------------------------------------------------

    function wrapLane(s, k) { return ((k % s.n) + s.n) % s.n; }

    function proj(s, k, z) {
        var v = s.rim[wrapLane(s, k)], f = 1 / (1 + (1 - z) * s.K);
        return { x: s.vp[0] + (v[0] - s.vp[0]) * f, y: s.vp[1] + (v[1] - s.vp[1]) * f };
    }

    // A point at a fractional rim position p (lane k's centre is k + 0.5).
    function at(s, p, z) {
        var k = Math.floor(p), f = p - k, a = proj(s, k, z), b = proj(s, k + 1, z);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }

    function laneWidth(s, lane, z) {
        var a = proj(s, lane, z), b = proj(s, lane + 1, z);
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function laneAngle(s, lane, z) {
        var a = proj(s, lane, z), b = proj(s, lane + 1, z);
        return Math.atan2(b.y - a.y, b.x - a.x);
    }

    // Signed shortest lane step from a to b around the closed tube.
    function shortest(s, a, b) {
        var d = wrapLane(s, b - a);
        return d > s.n / 2 ? d - s.n : d;
    }

    function playerLane(s) { return wrapLane(s, Math.floor(s.p.pos)); }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    function init(level) {
        var c = CFG[level - 1], s = {
            cfg: c, level: level, n: c.lanes, K: 1 / c.inner - 1, vp: [c.cx, c.cy + c.vpy], rot: 0, clock: 0,
            rng: G.rng(c.seed), touch: G.isTouch(), rim: [], shapeNow: c.shapes[0], morphing: false,
            p: { pos: 0.5 + Math.floor(c.lanes * 0.5), v: 0, held: '', sign: 1, rsign: 1, lane: 0 },
            enemies: [], shots: [], bullets: [], spikes: [], kills: 0, phase: 'play', dive: 0, boomT: 0,
            spawnT: 1.2, cool: 0, inv: 0, zaps: 1, zapT: 0, boss: null, msg: null, sndT: 0, deaths: 0
        };
        s.shapes = c.shapes.map(function (name) { return shapePoints(name, c.lanes, c.R); });
        for (var k = 0; k < c.lanes; k++) { s.rim.push([0, 0]); s.spikes.push(0); }
        updateGeo(s);
        s.p.lane = playerLane(s);
        s.p.rsign = mapSign(s, 'right');
        return s;
    }

    // ------------------------------------------------------------------
    // The player: a claw on the rim with angular momentum
    // ------------------------------------------------------------------

    // Which way round the tube a key turns: screen-relative where the rim
    // runs across the screen (right goes right), clockwise for → on the
    // upright sides. It is fixed while the key is held, so holding a key
    // keeps circling instead of reversing halfway round.
    function mapSign(s, key) {
        var a = at(s, s.p.pos - 0.3, 1), b = at(s, s.p.pos + 0.3, 1), dx = b.x - a.x, dy = b.y - a.y;
        var right = Math.abs(dx) > Math.abs(dy) * 0.35 ? (dx > 0 ? 1 : -1) : 1;
        return key === 'right' ? right : -right;
    }

    function steer(s, dt) {
        var p = s.p, key = G.key.right ? 'right' : (G.key.left ? 'left' : '');
        s.p.rsign = mapSign(s, 'right');
        if (key && p.held !== key) { p.held = key; p.sign = mapSign(s, key); }
        if (!key) p.held = '';
        if (key) {
            // Reversing bites harder than speeding up, so a correction is quick.
            var acc = p.v * p.sign < 0 ? ACC * 2.2 : ACC;
            p.v = G.clamp(p.v + p.sign * acc * dt, -VMAX, VMAX);
        } else {
            // Let go: a damped spring settles the claw into the lane the
            // slide is carrying it into.
            var target = Math.floor(p.pos + p.v * 0.06) + 0.5;
            p.v += ((target - p.pos) * SPRING - p.v * DAMP) * dt;
        }
        p.pos = ((p.pos + p.v * dt) % s.n + s.n) % s.n;
        var lane = playerLane(s);
        if (lane !== p.lane) {
            p.lane = lane;
            G.tone(1400 + lane * 30, 0.018, { type: 'sine', vol: 0.035 });
        }
    }

    function fire(s, dt) {
        s.cool -= dt;
        if (!G.key.a || s.cool > 0 || s.shots.length >= SHOT_MAX || s.phase === 'boom' || s.phase === 'done') return;
        s.cool = FIRE_GAP;
        var z = s.phase === 'dive' ? 1 - s.dive : 1;
        var sh = { lane: playerLane(s), z: z };
        s.shots.push(sh);
        G.tone(1320, 0.045, { type: 'square', vol: 0.045, slide: 880 });
        // A shot leaves from the rim, so a crawler sitting in the lane
        // is hit at once.
        if (shotHits(s, sh, z + 0.04)) s.shots.pop();
    }

    function zap(s) {
        if (!G.hit.b || s.zaps <= 0 || (s.phase !== 'play' && s.phase !== 'boss')) return;
        s.zaps--; s.zapT = 0.9;
        G.flash(YELLOW, 0.35); G.shake(6, 0.3);
        G.noise(0.7, { freq: 3200, slide: 300, vol: 0.22 });
        G.tone(110, 0.7, { type: 'sawtooth', vol: 0.1, slide: 1760 });
        s.enemies.forEach(function (e) { if (!e.dead) killEnemy(s, e, true); });
        s.bullets = [];
    }

    // ------------------------------------------------------------------
    // Enemies
    // ------------------------------------------------------------------

    function newEnemy(s, kind, lane, z) {
        return { kind: kind, lane: lane, from: lane, dir: 1, z: z, flip: -1, rim: false, wait: 0.6 + s.rng(),
            cool: 1 + s.rng() * 2, catchT: 0, down: false, top: 0.45 + s.rng() * 0.3, dead: false };
    }

    function pickKind(s) {
        var mix = s.cfg.mix, r = s.rng(), acc = 0, last = 'climber';
        for (var k in mix) { acc += mix[k]; last = k; if (r < acc) return k; }
        return last;
    }

    function spawn(s, dt) {
        var c = s.cfg;
        s.spawnT -= dt;
        if (s.phase !== 'play' || s.spawnT > 0 || s.enemies.length >= c.maxAlive) return;
        var f = Math.min(1, s.kills / c.quota), pack = f > 0.35 && s.rng() < 0.5 ? 2 : 1;
        s.spawnT = G.lerp(c.spawn[0], c.spawn[1], f) * pack * 0.8;
        // A pair comes up opposite lanes, so one lane cannot hold them both.
        var lane = Math.floor(s.rng() * s.n);
        for (var i = 0; i < pack; i++) s.enemies.push(newEnemy(s, pickKind(s), wrapLane(s, lane + i * Math.floor(s.n / 2)), 0));
        G.tone(260, 0.06, { type: 'sine', vol: 0.04, slide: 390 });
    }

    // Fractional rim position, sliding over during a flip.
    function epos(s, e) {
        if (e.flip < 0) return e.lane + 0.5;
        return ((e.from + 0.5 + e.dir * e.flip) % s.n + s.n) % s.n;
    }

    // The lane a shot meets it in: the old one until halfway through a flip.
    // Mid-leap along the rim it is above the lanes and cannot be hit.
    function hitLane(e) {
        if (e.flip < 0) return e.lane;
        return e.rim ? -1 : (e.flip < 0.5 ? e.from : e.lane);
    }

    function startFlip(s, e, dir) {
        e.from = e.lane; e.dir = dir; e.lane = wrapLane(s, e.lane + dir); e.flip = 0;
        if (e.rim) G.tone(560 + e.lane * 20, 0.03, { type: 'square', vol: 0.035 });
    }

    // A crawler that leaps onto the claw's lane catches it as it lands;
    // the only answer is to meet it first, firing, in its own lane.
    function stepFlip(s, e, dt) {
        if (e.flip < 0) return false;
        e.flip += dt / (e.rim ? 0.24 : 0.3);
        if (e.flip < 1) return true;
        e.flip = -1;
        if (e.rim && e.lane === playerLane(s) && s.inv <= 0 && s.phase !== 'dive') playerHit(s);
        return true;
    }

    function reachRim(s, e) {
        if (e.kind === 'tanker') { split(s, e, 1); return; }
        e.z = 1; e.rim = true; e.wait = s.cfg.crawl * 0.6;
        G.tone(220, 0.16, { type: 'sawtooth', vol: 0.07, slide: 110 });
    }

    // On the rim everything walks towards the player, a lane at a time;
    // standing in the player's lane long enough is a catch.
    function crawl(s, e, dt) {
        var pl = playerLane(s);
        if (e.lane === pl && s.inv <= 0 && s.phase !== 'dive') {
            e.catchT += dt;
            if (e.catchT > CATCH) playerHit(s);
            return;
        }
        e.catchT = 0;
        e.wait -= dt;
        if (e.wait > 0) return;
        e.wait = s.cfg.crawl * (e.kind === 'climber' ? 1.3 : 1);
        var d = shortest(s, e.lane, pl);
        if (d) startFlip(s, e, d > 0 ? 1 : -1);
    }

    // Spikers climb to a height, leave a spike in the lane all the way up,
    // sink back down and come up again as a flipper.
    function spiker(s, e, dt) {
        e.z += (e.down ? -1 : 1) * s.cfg.climb * 1.15 * dt;
        if (!e.down) {
            s.spikes[e.lane] = Math.max(s.spikes[e.lane], e.z);
            if (e.z >= e.top) e.down = true;
        } else if (e.z <= 0.03) {
            e.kind = 'flipper'; e.down = false; e.z = 0.03; e.wait = 0.4;
        }
    }

    function enemyFire(s, e, dt) {
        var c = s.cfg;
        if (!c.fire || e.z < 0.15 || e.z > 0.75) return;
        e.cool -= dt;
        if (e.cool > 0) return;
        e.cool = 2 + s.rng() * 2.5;
        if (s.rng() > c.fire) return;
        s.bullets.push({ lane: hitLane(e), z: e.z, v: 0.42 });
        G.tone(170, 0.09, { type: 'square', vol: 0.05, slide: 340 });
    }

    function updateEnemy(s, e, dt) {
        var c = s.cfg;
        if (stepFlip(s, e, dt)) return;
        if (e.rim) { crawl(s, e, dt); return; }
        if (e.kind === 'spiker') { spiker(s, e, dt); return; }
        e.z += c.climb * (e.kind === 'tanker' ? 0.7 : (e.kind === 'flipper' ? 0.9 : 1)) * dt;
        if (e.kind === 'flipper') {
            e.wait -= dt;
            if (e.wait <= 0) {
                e.wait = G.lerp(c.flipGap[0], c.flipGap[1], s.rng());
                var d = shortest(s, e.lane, playerLane(s));
                startFlip(s, e, s.rng() < 0.6 && d ? (d > 0 ? 1 : -1) : (s.rng() < 0.5 ? 1 : -1));
            }
        }
        enemyFire(s, e, dt);
        if (e.z >= 1) reachRim(s, e);
    }

    // A tanker breaks into two flippers that leap to the lanes beside it.
    function split(s, e, z) {
        e.dead = true;
        [-1, 1].forEach(function (dir) {
            var f = newEnemy(s, 'flipper', e.lane, Math.min(z, 0.99));
            f.wait = 0.5;
            startFlip(s, f, dir);
            s.enemies.push(f);
        });
        G.tone(330, 0.12, { type: 'triangle', vol: 0.1, slide: 660 });
    }

    var KILL_TONE = { climber: ['sine', 660, 1320], flipper: ['square', 990, 495], spiker: ['triangle', 520, 1560], tanker: ['triangle', 300, 900] };

    function killEnemy(s, e, quiet) {
        if (e.dead) return;
        var pt = at(s, epos(s, e), e.z), w = laneWidth(s, e.lane, e.z);
        G.burst(pt.x, pt.y, { n: 14, color: COLOR[e.kind], speed: 120 + w * 2, life: 0.5, size: 5 });
        G.burst(pt.x, pt.y, { n: 6, color: BLACK, speed: 90 + w, life: 0.4, size: 3 });
        G.addScore(SCORE[e.kind]);
        if (!quiet) {
            var k = KILL_TONE[e.kind];
            G.tone(k[1], 0.12, { type: k[0], vol: 0.14, slide: k[2] });
            G.popup(pt.x, pt.y - 10, String(SCORE[e.kind]), BLACK);
        }
        s.kills++;
        if (e.kind === 'tanker' && !quiet) split(s, e, e.z);
        e.dead = true;
    }

    function updateEnemies(s, dt) {
        for (var i = 0; i < s.enemies.length; i++) if (!s.enemies[i].dead) updateEnemy(s, s.enemies[i], dt);
        s.enemies = s.enemies.filter(function (e) { return !e.dead; });
    }

    // ------------------------------------------------------------------
    // Shots, enemy bullets and spikes
    // ------------------------------------------------------------------

    // The first thing a shot meets while travelling from pz down to sh.z:
    // the highest enemy, bullet or spike tip in its lane within that span.
    function shotHits(s, sh, pz) {
        var best = null, bestZ = -1, kind = '';
        s.enemies.forEach(function (e) {
            if (!e.dead && hitLane(e) === sh.lane && e.z >= sh.z - 0.02 && e.z <= pz + 0.02 && e.z > bestZ) { best = e; bestZ = e.z; kind = 'enemy'; }
        });
        // The core's discs are solid: they cannot be shot, only dodged.
        s.bullets.forEach(function (b) {
            if (!b.hard && b.lane === sh.lane && b.z >= sh.z - 0.03 && b.z <= pz + 0.03 && b.z > bestZ) { best = b; bestZ = b.z; kind = 'bullet'; }
        });
        var tip = s.spikes[sh.lane];
        if (tip > 0.01 && tip >= sh.z && tip > bestZ) { kind = 'spike'; best = null; }
        if (!kind) return false;
        if (kind === 'enemy') killEnemy(s, best);
        else if (kind === 'bullet') hitBullet(s, best);
        else hitSpike(s, sh.lane);
        return true;
    }

    function hitBullet(s, b) {
        b.dead = true;
        var pt = at(s, b.lane + 0.5, b.z);
        G.burst(pt.x, pt.y, { n: 5, color: BLACK, speed: 80, life: 0.3, size: 3 });
        G.addScore(20);
        G.tone(440, 0.04, { type: 'square', vol: 0.05 });
    }

    function hitSpike(s, lane) {
        s.spikes[lane] = Math.max(0, s.spikes[lane] - 0.09);
        if (s.spikes[lane] < 0.04) s.spikes[lane] = 0;
        var pt = at(s, lane + 0.5, Math.max(0.02, s.spikes[lane]));
        G.burst(pt.x, pt.y, { n: 4, color: BLUE, speed: 70, life: 0.3, size: 3 });
        G.addScore(5);
        G.tone(2200, 0.03, { type: 'triangle', vol: 0.06 });
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (sh) {
            var pz = sh.z;
            sh.z -= SHOT_SPEED * dt;
            if (shotHits(s, sh, pz)) return false;
            if (sh.z > 0) return true;
            if (s.boss && s.phase === 'boss') hitBoss(s, sh.lane);
            return false;
        });
        s.bullets = s.bullets.filter(function (b) { return !b.dead; });
    }

    function updateBullets(s, dt) {
        var pl = playerLane(s);
        s.bullets = s.bullets.filter(function (b) {
            b.z += b.v * dt;
            if (b.z < 1) return true;
            if (b.lane === pl && s.phase !== 'dive') playerHit(s);
            return false;
        });
    }

    // ------------------------------------------------------------------
    // Losing the claw
    // ------------------------------------------------------------------

    function playerHit(s) {
        if (s.inv > 0 || s.phase === 'done' || s.phase === 'boom') return;
        var pt = at(s, s.p.pos, s.phase === 'dive' ? 1 - s.dive : 1);
        G.burst(pt.x, pt.y, { n: 30, color: RED, speed: 300, life: 0.9, size: 7 });
        G.burst(pt.x, pt.y, { n: 20, color: YELLOW, speed: 220, life: 0.8, size: 5 });
        G.burst(pt.x, pt.y, { n: 14, color: BLACK, speed: 160, life: 0.7, size: 4 });
        G.sfx('boom'); G.shake(10, 0.4);
        // The tube is swept clean so a fresh claw is not caught again at once.
        s.enemies.forEach(function (e) {
            var q = at(s, epos(s, e), e.z);
            G.burst(q.x, q.y, { n: 4, color: COLOR[e.kind], speed: 80, life: 0.4, size: 3 });
        });
        s.enemies = []; s.bullets = []; s.shots = [];
        if (s.phase === 'dive') { s.spikes[playerLane(s)] = 0; s.dive = 0; updateGeo(s); }
        s.inv = INV_TIME; s.deaths++;
        G.loseLife();
    }

    // ------------------------------------------------------------------
    // The Kandinsky core (level 3)
    // ------------------------------------------------------------------

    function startBoss(s) {
        s.phase = 'boss';
        s.enemies.forEach(function (e) { killEnemy(s, e, true); });
        s.enemies = []; s.bullets = [];
        var seg = [];
        for (var k = 0; k < s.n; k++) seg.push(3);
        s.boss = { seg: seg, rot: 0, rotT: 2.6, hp: 80, max: 80, fireT: 1.6, spawnT: 3, ringT: 6.5, hitT: 0 };
        s.msg = { text: 'the core awakens — break its ring, then hit the core', t: 3.5 };
        G.sfx('alarm');
        G.tone(110, 0.9, { type: 'square', vol: 0.1, slide: 55 });
    }

    function bossAttack(s, b, dt) {
        b.fireT -= dt;
        if (b.fireT <= 0) {
            b.fireT = 0.8 + s.rng() * 0.6;
            var lane = s.rng() < 0.55 ? playerLane(s) : Math.floor(s.rng() * s.n);
            s.bullets.push({ lane: lane, z: 0.03, v: 0.5, hard: true });
            G.tone(150, 0.1, { type: 'square', vol: 0.06, slide: 300 });
        }
        b.spawnT -= dt;
        if (b.spawnT <= 0 && s.enemies.length < 4) {
            b.spawnT = 3.2;
            var f = newEnemy(s, 'flipper', Math.floor(s.rng() * s.n), 0.04);
            s.enemies.push(f);
        }
        b.ringT -= dt;
        if (b.ringT <= 0) {
            // A ring of discs up every other lane: sit in a gap.
            b.ringT = 7;
            b.parity = 1 - (b.parity || 0);
            for (var k = b.parity; k < s.n; k += 2) s.bullets.push({ lane: k, z: 0.03, v: 0.36, hard: true });
            G.tone(330, 0.35, { type: 'sawtooth', vol: 0.08, slide: 990 });
        }
    }

    function updateBoss(s, dt) {
        var b = s.boss;
        b.hitT = Math.max(0, b.hitT - dt);
        // The ring turns a lane at a time, so a broken gap wanders away.
        b.rotT -= dt;
        if (b.rotT <= 0) { b.rotT = 2; b.rot = (b.rot + 1) % s.n; G.tone(1760, 0.025, { type: 'sine', vol: 0.04 }); }
        bossAttack(s, b, dt);
    }

    function segIndex(s, lane) { return (lane + s.boss.rot) % s.n; }

    function hitBoss(s, lane) {
        var b = s.boss, k = segIndex(s, lane), pt = at(s, lane + 0.5, 0.02);
        if (b.seg[k] > 0) {
            b.seg[k]--;
            G.burst(pt.x, pt.y, { n: 6, color: [RED, YELLOW, BLUE][k % 3], speed: 90, life: 0.4, size: 4 });
            G.addScore(50);
            G.tone(b.seg[k] ? 880 : 1320, 0.06, { type: 'square', vol: 0.07 });
            return;
        }
        b.hp--; b.hitT = 0.12;
        G.addScore(100);
        G.burst(s.vp[0], s.vp[1], { n: 8, color: G.pick([RED, YELLOW, BLUE]), speed: 140, life: 0.5, size: 5 });
        G.tone(220 + b.hp * 20, 0.09, { type: 'triangle', vol: 0.12 });
        if (b.hp <= 0) coreDown(s);
    }

    function coreDown(s) {
        s.phase = 'boom'; s.boomT = 1.8;
        s.enemies.forEach(function (e) { killEnemy(s, e, true); });
        s.enemies = []; s.bullets = [];
        G.addScore(5000);
        G.sfx('bigboom'); G.shake(14, 1); G.flash(YELLOW, 0.5);
        s.msg = { text: 'composition complete', t: 2.5 };
    }

    // ------------------------------------------------------------------
    // Flow: play → (core → boom) → dive → win
    // ------------------------------------------------------------------

    function startDive(s) {
        s.phase = 'dive'; s.dive = 0;
        s.enemies.forEach(function (e) { killEnemy(s, e, true); });
        s.enemies = []; s.bullets = [];
        s.msg = { text: s.spikes.some(function (h) { return h > 0.02; }) ? 'dive! — mind the spikes' : 'dive!', t: 2 };
        G.sfx('power');
        G.noise(DIVE_TIME, { freq: 300, slide: 4200, vol: 0.1 });
    }

    function updateDive(s, dt) {
        s.dive = Math.min(1, s.dive + dt / DIVE_TIME);
        var lane = playerLane(s), depth = 1 - s.dive;
        if (s.inv <= 0 && s.spikes[lane] > 0.02 && depth <= s.spikes[lane]) { playerHit(s); return; }
        if (s.dive < 1) return;
        s.phase = 'done';
        G.win(1000 * s.level + Math.max(0, 3 - s.deaths) * 500 + s.zaps * 300);
    }

    function updateBoom(s, dt) {
        s.boomT -= dt;
        s.sndT -= dt;
        if (s.sndT <= 0) {
            s.sndT = 0.22;
            var a = G.rnd(0, TAU), r = G.rnd(0, 60);
            G.burst(s.vp[0] + Math.cos(a) * r, s.vp[1] + Math.sin(a) * r, { n: 18, color: G.pick([RED, YELLOW, BLUE, BLACK]), speed: 260, life: 0.8, size: 6 });
            G.noise(0.25, { freq: 900, slide: 120, vol: 0.12 });
        }
        if (s.boomT <= 0) startDive(s);
    }

    function tick(s, dt) {
        s.clock += dt;
        s.rot += s.cfg.spin * dt;
        s.inv = Math.max(0, s.inv - dt);
        s.zapT = Math.max(0, s.zapT - dt);
        if (s.msg && (s.msg.t -= dt) <= 0) s.msg = null;
        var was = s.morphing;
        updateGeo(s);
        if (s.morphing && !was) {
            G.tone(392, 0.5, { type: 'sine', vol: 0.06, slide: 523 });
            G.tone(587, 0.5, { type: 'sine', vol: 0.05, slide: 784, delay: 0.08 });
        }
    }

    function update(s, dt) {
        if (s.phase === 'done') return;
        tick(s, dt);
        steer(s, dt);
        fire(s, dt);
        zap(s);
        spawn(s, dt);
        updateEnemies(s, dt);
        updateShots(s, dt);
        updateBullets(s, dt);
        if (s.phase === 'play' && s.kills >= s.cfg.quota) { if (s.cfg.boss) startBoss(s); else startDive(s); }
        else if (s.phase === 'boss') updateBoss(s, dt);
        else if (s.phase === 'boom') updateBoom(s, dt);
        else if (s.phase === 'dive') updateDive(s, dt);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // The paper behind the tube: a few large flat shapes in the corners,
    // one of them turning, so the print is never quite still.
    function drawBackdrop(s, ctx) {
        ctx.fillStyle = CREAM;
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = '#f3d98a';
        ctx.beginPath(); ctx.arc(96, 470, 150, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b7c4dc';
        ctx.beginPath(); ctx.moveTo(960, 30); ctx.arc(960, 30, 190, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#eba99f';
        ctx.save(); ctx.translate(850, 440); ctx.rotate(-0.5); ctx.fillRect(-120, -14, 240, 28); ctx.restore();
        ctx.strokeStyle = 'rgba(20,18,16,0.22)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(20, 120); ctx.lineTo(300, 40); ctx.moveTo(700, 530); ctx.lineTo(940, 300); ctx.stroke();
        var a = s.clock * 0.6;
        ctx.fillStyle = 'rgba(20,18,16,0.3)';
        ctx.beginPath(); ctx.arc(118, 300, 30, a, a + Math.PI); ctx.closePath(); ctx.fill();
    }

    function quad(s, ctx, lane, z0, z1) {
        var a = proj(s, lane, z0), b = proj(s, lane + 1, z0), c = proj(s, lane + 1, z1), d = proj(s, lane, z1);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    }

    function ringPath(s, ctx, z) {
        for (var k = 0; k <= s.n; k++) { var q = proj(s, k, z); if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
        ctx.closePath();
    }

    // Lane fills: the player's lane in yellow, and during a zap a wave of
    // colour runs round every lane.
    function drawLaneFills(s, ctx) {
        if (s.zapT > 0) {
            for (var k = 0; k < s.n; k++) {
                ctx.globalAlpha = 0.5 * (s.zapT / 0.9);
                ctx.fillStyle = [RED, YELLOW, BLUE][(k + Math.floor(s.clock * 20)) % 3];
                ctx.beginPath(); quad(s, ctx, k, 0, 1); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        var blink = s.inv > 0 && Math.floor(s.clock * 8) % 2;
        ctx.fillStyle = blink ? 'rgba(214,45,32,0.25)' : WASH;
        ctx.beginPath(); quad(s, ctx, playerLane(s), s.phase === 'dive' ? 0 : 0, 1); ctx.fill();
    }

    function drawTube(s, ctx) {
        ctx.fillStyle = PAPER;
        ctx.beginPath(); ringPath(s, ctx, 1); ctx.fill();
        drawLaneFills(s, ctx);
        ctx.strokeStyle = 'rgba(20,18,16,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ringPath(s, ctx, 0.45); ringPath(s, ctx, 0.72); ringPath(s, ctx, 0.88); ctx.stroke();
        ctx.strokeStyle = BLACK; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var k = 0; k < s.n; k++) {
            var a = proj(s, k, 0), b = proj(s, k, 1);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        if (!s.boss) { ctx.fillStyle = BLACK; ctx.beginPath(); ringPath(s, ctx, 0); ctx.fill(); }
        ctx.lineWidth = 6; ctx.lineJoin = 'round';
        ctx.beginPath(); ringPath(s, ctx, 1); ctx.stroke();
        drawRimMarks(s, ctx);
    }

    // Small primary squares on the rim corners, the print's registration marks.
    function drawRimMarks(s, ctx) {
        var cols = [RED, YELLOW, BLUE];
        for (var c = 0; c < 3; c++) {
            ctx.fillStyle = cols[c];
            ctx.beginPath();
            for (var k = c; k < s.n; k += 3) { var q = proj(s, k, 1); ctx.rect(q.x - 4, q.y - 4, 8, 8); }
            ctx.fill();
        }
        var pl = playerLane(s), a = proj(s, pl, 1), b = proj(s, pl + 1, 1);
        ctx.strokeStyle = RED; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    function drawSpikes(s, ctx) {
        ctx.strokeStyle = BLACK; ctx.lineWidth = 3;
        ctx.beginPath();
        var tips = [];
        for (var k = 0; k < s.n; k++) {
            if (s.spikes[k] <= 0.01) continue;
            var a = at(s, k + 0.5, 0), b = at(s, k + 0.5, s.spikes[k]);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            tips.push({ p: b, w: laneWidth(s, k, s.spikes[k]) });
        }
        ctx.stroke();
        ctx.fillStyle = BLUE;
        ctx.beginPath();
        tips.forEach(function (t) { var r = Math.max(3, t.w * 0.1); ctx.rect(t.p.x - r, t.p.y - r, r * 2, r * 2); });
        ctx.fill();
    }

    function drawCircle(ctx, x, y, r, fill, line) {
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        if (line) { ctx.lineWidth = line; ctx.strokeStyle = BLACK; ctx.stroke(); }
    }

    function drawPoly(ctx, x, y, r, sides, ang, fill, line) {
        ctx.beginPath();
        for (var i = 0; i < sides; i++) {
            var a = ang + TAU * i / sides;
            if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        if (line) { ctx.lineWidth = line; ctx.strokeStyle = BLACK; ctx.stroke(); }
    }

    function drawEnemy(s, ctx, e) {
        var p = epos(s, e), lane = Math.floor(p), pt = at(s, p, e.z), w = laneWidth(s, lane, e.z);
        var r = Math.max(s.touch ? 5.5 : 4, w * 0.38), line = Math.max(1, r * 0.16), ang = laneAngle(s, lane, e.z);
        if (e.kind === 'climber') {
            drawCircle(ctx, pt.x, pt.y, r, RED, line);
            drawCircle(ctx, pt.x + r * 0.25, pt.y - r * 0.2, r * 0.32, BLACK, 0);
        } else if (e.kind === 'flipper') {
            drawPoly(ctx, pt.x, pt.y, r * 1.1, 3, ang - Math.PI / 2 + (e.flip >= 0 ? e.flip * Math.PI * e.dir : 0), YELLOW, line);
        } else if (e.kind === 'spiker') {
            drawPoly(ctx, pt.x, pt.y, r, 4, s.clock * 4, BLUE, line);
        } else {
            drawPoly(ctx, pt.x, pt.y, r * 1.15, 4, ang + Math.PI / 4, BLUE, line);
            drawPoly(ctx, pt.x, pt.y, r * 0.55, 3, ang - Math.PI / 2, YELLOW, 0);
        }
        if (e.rim && e.lane === playerLane(s) && e.catchT > 0) {
            ctx.strokeStyle = RED; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, r * 1.7, 0, TAU * e.catchT / CATCH); ctx.stroke();
        }
    }

    function drawMovers(s, ctx) {
        var list = s.enemies.slice().sort(function (a, b) { return a.z - b.z; });
        list.forEach(function (e) { drawEnemy(s, ctx, e); });
        ctx.fillStyle = BLACK;
        ctx.beginPath();
        s.bullets.forEach(function (b) {
            var pt = at(s, b.lane + 0.5, b.z), r = Math.max(2.5, laneWidth(s, b.lane, b.z) * (b.hard ? 0.2 : 0.12));
            ctx.moveTo(pt.x + r, pt.y); ctx.arc(pt.x, pt.y, r, 0, TAU);
        });
        ctx.fill();
        // The core's discs carry a red ring: these cannot be shot down.
        ctx.strokeStyle = RED; ctx.lineWidth = 3;
        ctx.beginPath();
        s.bullets.forEach(function (b) {
            if (!b.hard) return;
            var pt = at(s, b.lane + 0.5, b.z), r = Math.max(4, laneWidth(s, b.lane, b.z) * 0.2) + 2;
            ctx.moveTo(pt.x + r, pt.y); ctx.arc(pt.x, pt.y, r, 0, TAU);
        });
        ctx.stroke();
        ctx.fillStyle = YELLOW; ctx.strokeStyle = BLACK; ctx.lineWidth = 1.5;
        ctx.beginPath();
        s.shots.forEach(function (sh) {
            var pt = at(s, sh.lane + 0.5, Math.max(0, sh.z)), r = Math.max(2.5, laneWidth(s, sh.lane, Math.max(0, sh.z)) * 0.11);
            ctx.moveTo(pt.x + r, pt.y); ctx.arc(pt.x, pt.y, r, 0, TAU);
        });
        ctx.fill(); ctx.stroke();
    }

    // The claw: a red chevron hooked over the rim, pointing down the tube,
    // with a yellow eye. Laid out in the lane's own frame (along the rim and
    // outwards from the centre) so it fits every shape.
    var CLAW = [[-0.5, 0.16], [0, 0.04], [0.5, 0.16], [0.24, -0.2], [0, -0.34], [-0.24, -0.2]];

    function drawPlayer(s, ctx) {
        if (s.phase === 'done' && s.dive >= 1) return;
        if (s.inv > 0 && Math.floor(s.clock * 12) % 2 && s.phase !== 'dive') return;
        var p = s.p.pos, z = s.phase === 'dive' ? 1 - s.dive * 0.97 : 1;
        var a = at(s, p - 0.5, z), b = at(s, p + 0.5, z), c = at(s, p, z);
        var tx = b.x - a.x, ty = b.y - a.y, w = Math.hypot(tx, ty) || 1, size = Math.min(w, 84) * 1.15;
        tx /= w; ty /= w;
        var nx = -ty, ny = tx;
        if (nx * (c.x - s.vp[0]) + ny * (c.y - s.vp[1]) < 0) { nx = -nx; ny = -ny; }
        ctx.beginPath();
        CLAW.forEach(function (q, i) {
            var x = c.x + (tx * q[0] + nx * q[1]) * size, y = c.y + (ty * q[0] + ny * q[1]) * size;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = RED; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = BLACK; ctx.lineJoin = 'round'; ctx.stroke();
        drawCircle(ctx, c.x - nx * size * 0.08, c.y - ny * size * 0.08, Math.max(3, size * 0.09), YELLOW, 1.5);
    }

    // The core: concentric Kandinsky circles in the mouth of the tube,
    // behind a ring of coloured segments that must be shot out first.
    function drawBoss(s, ctx) {
        var b = s.boss;
        if (!b) return;
        var inner = proj(s, 0, 0), rad = Math.hypot(inner.x - s.vp[0], inner.y - s.vp[1]), x = s.vp[0], y = s.vp[1];
        var alive = s.phase === 'boss', f = alive ? b.hp / b.max : 0, pulse = 1 + Math.sin(s.clock * 6) * 0.05;
        ctx.fillStyle = BLACK; ctx.beginPath(); ringPath(s, ctx, 0); ctx.fill();
        if (alive || s.boomT > 1.2) {
            var R = rad * 0.8 * pulse * (0.55 + 0.45 * f);
            drawCircle(ctx, x, y, R, b.hitT > 0 ? PAPER : BLUE, 0);
            drawCircle(ctx, x - R * 0.2, y + R * 0.15, R * 0.62, RED, 0);
            drawCircle(ctx, x + R * 0.25, y - R * 0.2, R * 0.3, YELLOW, 2);
            ctx.strokeStyle = PAPER; ctx.lineWidth = 2;
            ctx.beginPath();
            for (var i = 0; i < 5; i++) { var a = s.clock * 1.4 + i * TAU / 5; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * R * 1.2, y + Math.sin(a) * R * 1.2); }
            ctx.stroke();
        }
        if (!alive) return;
        ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (var k = 0; k < s.n; k++) {
            var hp = b.seg[segIndex(s, k)];
            if (!hp) continue;
            var p0 = proj(s, k, 0.015), p1 = proj(s, k + 1, 0.015);
            ctx.strokeStyle = hp > 2 ? [RED, YELLOW, BLUE][segIndex(s, k) % 3] : (hp > 1 ? BLACK : GREY);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        ctx.lineCap = 'butt';
    }

    function drawNotes(s, ctx) {
        var big = s.touch ? 22 : 17;
        G.text('composition no. ' + s.level, 22, 62, { size: big, bold: true, color: BLACK });
        G.text(SHAPE_NAME[s.shapeNow] + (s.morphing ? ' →' : ''), 22, 62 + big + 6, { size: big, color: RED });
        var zx = 22, zy = G.H - 26;
        ctx.fillStyle = s.zaps ? BLUE : 'rgba(20,18,16,0.25)';
        ctx.fillRect(zx, zy - big + 2, big, big);
        G.text(s.zaps ? 'zap ready' : 'zap used', zx + big + 10, zy, { size: big, color: s.zaps ? BLACK : '#6d675c' });
        if (G.t < 4 && s.phase === 'play') {
            ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.t * 5);
            G.text(s.touch ? '◀ ▶ ride · FIRE · ZAP' : '← → ride · SPACE fire · X zap', G.W - 22, G.H - 26, { size: big, color: BLACK, align: 'right' });
            ctx.globalAlpha = 1;
        }
        if (s.msg) {
            ctx.globalAlpha = Math.min(1, s.msg.t * 2);
            G.text(s.msg.text, G.W - 22, 62, { size: big + 1, bold: true, color: BLUE, align: 'right', max: 330 });
            ctx.globalAlpha = 1;
        }
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        drawTube(s, ctx);
        drawBoss(s, ctx);
        drawSpikes(s, ctx);
        drawMovers(s, ctx);
        drawPlayer(s, ctx);
        drawNotes(s, ctx);
    }

    function hud(s) {
        if (s.phase === 'boss') return 'CORE ' + s.boss.hp + '/' + s.boss.max;
        if (s.phase === 'dive' || s.phase === 'boom' || s.phase === 'done') return 'DIVE';
        return 'SHAPES ' + s.kills + '/' + s.cfg.quota + '  ZAP ' + s.zaps;
    }

    // ------------------------------------------------------------------
    // The ending: the shapes fall onto two canvases on easels and settle
    // into finished Kandinsky compositions for the opening night.
    // ------------------------------------------------------------------

    // [kind, x, y, size, colour, turn] on a unit canvas.
    var PAINTING = [
        ['circle', 0.34, 0.34, 0.26, BLUE, 0], ['circle', 0.3, 0.38, 0.14, RED, 0], ['circle', 0.27, 0.31, 0.05, YELLOW, 0],
        ['tri', 0.72, 0.66, 0.2, YELLOW, 0.3], ['bar', 0.5, 0.86, 0.42, BLACK, -0.35], ['square', 0.76, 0.22, 0.09, RED, 0.5],
        ['arc', 0.56, 0.5, 0.3, BLACK, 0], ['circle', 0.82, 0.86, 0.06, BLACK, 0], ['bar', 0.2, 0.7, 0.3, RED, 1.1],
        ['tri', 0.18, 0.88, 0.08, BLUE, 1]
    ];
    var EASELS = [{ x: 26, y: 214, w: 172, h: 176, mirror: false }, { x: 762, y: 214, w: 172, h: 176, mirror: true }];

    function easelFrame(ctx, ez) {
        ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ez.x + ez.w * 0.5, ez.y - 24); ctx.lineTo(ez.x + 10, 520);
        ctx.moveTo(ez.x + ez.w * 0.5, ez.y - 24); ctx.lineTo(ez.x + ez.w - 10, 520);
        ctx.moveTo(ez.x + ez.w * 0.5, ez.y - 24); ctx.lineTo(ez.x + ez.w * 0.5, 510);
        ctx.moveTo(ez.x - 8, ez.y + ez.h + 6); ctx.lineTo(ez.x + ez.w + 8, ez.y + ez.h + 6);
        ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = PAPER; ctx.fillRect(ez.x, ez.y, ez.w, ez.h);
        ctx.strokeStyle = BLACK; ctx.lineWidth = 4; ctx.strokeRect(ez.x, ez.y, ez.w, ez.h);
    }

    function paintPiece(ctx, kind, x, y, r, col, turn) {
        if (kind === 'circle') drawCircle(ctx, x, y, r, col, 0);
        else if (kind === 'tri') drawPoly(ctx, x, y, r, 3, turn - Math.PI / 2, col, 0);
        else if (kind === 'square') drawPoly(ctx, x, y, r, 4, turn, col, 0);
        else if (kind === 'bar') {
            ctx.save(); ctx.translate(x, y); ctx.rotate(turn); ctx.fillStyle = col; ctx.fillRect(-r, -3, r * 2, 6); ctx.restore();
        } else {
            ctx.strokeStyle = col; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 1.1 + turn, Math.PI * 1.9 + turn); ctx.stroke();
        }
    }

    // Each piece drops in from above the canvas with a spin and a small
    // bounce, one after the other; once hung, the painting breathes.
    function drawEnding(e, ctx) {
        EASELS.forEach(function (ez, n) {
            easelFrame(ctx, ez);
            PAINTING.forEach(function (pc, i) {
                var t = G.clamp((e.t - 0.3 - i * 0.28 - n * 0.14) / 0.75, 0, 1);
                if (t <= 0) return;
                var land = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.08;
                var ux = ez.mirror ? 1 - pc[1] : pc[1], tx = ez.x + ux * ez.w, ty = ez.y + pc[2] * ez.h;
                var breathe = t >= 1 ? 1 + Math.sin(e.t * 2 + i) * 0.03 : 1;
                var col = ez.mirror && pc[4] !== BLACK ? ({ '#1f4e9c': RED, '#d62d20': YELLOW, '#f2b705': BLUE })[pc[4]] : pc[4];
                paintPiece(ctx, pc[0], tx, G.lerp(-40, ty, land), pc[3] * ez.w * 0.5 * breathe, col, pc[5] + (1 - t) * 5);
            });
        });
    }

    G.register('bauhaus', {
        title: 'COMPOSITION',
        blurb: 'Ride the rim of the shape and shoot what climbs out of it.',
        controls: [
            '← → / ◀ ▶ ride the rim lane to lane (hold to keep circling)',
            'SPACE / FIRE shoot down your lane · X / ZAP clears the tube once a level',
            'Shoot spikes down before the dive at the end of each level'
        ],
        levelNames: ['Circle', 'Triangle', 'Square Infinite'],
        colors: { bg: BLACK, fg: PAPER, accent: YELLOW, dim: '#c9c0ae' },
        lives: 4,
        music: {
            bpm: 120, root: 41, scale: 'lydian', prog: [0, 1, 0, 4],
            bass: 'x.x.o.x.x.x.o.5.',
            lead: ['7.b.9.b.7.b.9.b.', '8.c.a.c.8.c.a.c.', '7.9.b.e.b.9.7...', '6.8.b.8.6---4...'],
            arp: '0123', drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: '..x...x...x...xx' },
            leadWave: 'square', bassWave: 'square', arpWave: 'sine', leadOct: 1
        },
        touch: { a: 'FIRE', b: 'ZAP', hide: ['up', 'down'] },
        ending: {
            title: 'EXHIBITION',
            text: 'opening night',
            colors: [RED, YELLOW, BLUE, BLACK, PAPER],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
