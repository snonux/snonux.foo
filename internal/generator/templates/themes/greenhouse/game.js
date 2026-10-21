/*
 * Pollinator — the greenhouse theme's game.
 *
 * A Defender-style flier inside a long Victorian glasshouse that wraps
 * around left and right, with a scanner of the whole house at the top. The
 * bee flies with inertia and a little gravity, stings a short dart forward,
 * and carries pollen: touching a flower takes its pollen, touching a closed
 * bud of the same colour opens it. Open every bud to clear the level, while
 * beetles, wasps and finally the Hornet Queen go for the bee and the hive.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var W = 960, H = 540, TOP = 88, FLOOR = 486, BEE_R = 12, HEAD_R = 17, POT_Y = 456;
    var SCAN = { x: 240, y: 35, w: 480, h: 42 };
    var HIVE_X = 320, HIVE_Y = 404, HIVE_R = 30;
    var GRAV = 260, THRUST_X = 950, THRUST_Y = 820, DRAG = 2.4, MAXVX = 340, MAXVY = 300;
    var DART_V = 720, DART_LIFE = 0.32, DART_CD = 0.2;
    var RIB = 480;                                  // spacing of the big iron arches
    var C = {
        bg: '#0e2219', bg2: '#1f4535', iron: '#1a2621', ironHi: '#3b5247', fern: '#3f8a4f', leaf: '#7cbf6a',
        terra: '#c8643b', terraDk: '#8a3f22', soil: '#2e2117', cream: '#f4efdc', gold: '#f2c14e',
        pink: '#f29bb5', ink: '#1b1712', red: '#e0573a', glass: 'rgba(190,235,215,0.07)'
    };
    // The flower kinds: colour, petal count and the Latin name on its label.
    var KINDS = [
        { c: '#f28cb1', dk: '#a8436b', petals: 5, latin: 'Rosa canina' },
        { c: '#f2c14e', dk: '#a67418', petals: 9, latin: 'Calendula officinalis' },
        { c: '#b493e6', dk: '#634497', petals: 4, latin: 'Viola odorata' },
        { c: '#79c4e8', dk: '#2f7398', petals: 6, latin: 'Centaurea cyanus' }
    ];
    // Three glasshouses: the seedling bed, the hothouse with its misters and
    // webs, and the queen's raid. `groups` gives the flowers per colour.
    var LEVELS = [
        { ww: 2880, groups: [3, 2, 2], seed: 11, beetles: 3, beetleV: 62, thieves: 0, raiders: 0, misters: 0, webs: 0, queen: false },
        { ww: 3840, groups: [3, 3, 2, 2], seed: 23, beetles: 2, beetleV: 70, thieves: 2, raiders: 2, misters: 3, webs: 4, queen: false },
        { ww: 3840, groups: [2, 2, 2, 2], seed: 37, beetles: 1, beetleV: 74, thieves: 1, raiders: 0, misters: 2, webs: 3, queen: true }
    ];
    var FOE_R = { beetle: 14, thief: 13, raider: 13, escort: 15 };
    var FOE_SCORE = { beetle: 50, thief: 90, raider: 90, escort: 150 };
    var QUEEN_HP = 30, QUEEN_R = 34, SIP = 7;

    // ------------------------------------------------------------------
    // The wrapping world
    // ------------------------------------------------------------------

    function wrap(s, x) { return ((x % s.ww) + s.ww) % s.ww; }

    // Shortest signed distance from a to b around the wrapped house.
    function dxw(s, a, b) { return ((b - a) % s.ww + s.ww * 1.5) % s.ww - s.ww / 2; }

    function near(s, ax, ay, bx, by, r) {
        var dx = dxw(s, ax, bx), dy = by - ay;
        return dx * dx + dy * dy < r * r;
    }

    // Screen x of a world x, relative to the camera centre.
    function sx(s, x) { return W / 2 + dxw(s, wrap(s, s.camU), x); }

    // The engine draws effects in unwrapped camera space: map a world x into
    // it so a burst appears where the thing is on screen.
    function fx(s, x) { return s.camU + dxw(s, wrap(s, s.camU), x); }

    // ------------------------------------------------------------------
    // Building a level
    // ------------------------------------------------------------------

    // Colours are dealt so two neighbours never share one: a pair is then
    // always a real flight apart.
    function dealColours(groups, rng) {
        var cols = [], tries = 0, ok;
        groups.forEach(function (k, c) { for (var i = 0; i < k; i++) cols.push(c); });
        do {
            for (var i = cols.length - 1; i > 0; i--) {
                var j = Math.floor(rng() * (i + 1)), t = cols[i];
                cols[i] = cols[j]; cols[j] = t;
            }
            ok = cols.every(function (c, i) { return c !== cols[(i + 1) % cols.length]; });
        } while (!ok && ++tries < 60);
        return cols;
    }

    // Flowers stand in even slots around the house, the hive in the gap
    // between the last slot and the first.
    function buildFlowers(cfg, rng) {
        var cols = dealColours(cfg.groups, rng), n = cols.length;
        return cols.map(function (c, i) {
            var x = HIVE_X + cfg.ww * (i + 0.5) / n + (rng() - 0.5) * 90;
            return { x: ((x % cfg.ww) + cfg.ww) % cfg.ww, y: 362 + rng() * 72, kind: c, bloom: false,
                bloomT: 0, sip: 0, ph: rng() * 6.28, id: i };
        });
    }

    // Misters hang from the roof between the flowers; each blows down and to
    // one side for a while, after a puff of warning.
    function buildMisters(cfg, rng) {
        var list = [];
        for (var k = 0; k < cfg.misters; k++) {
            var x = HIVE_X + cfg.ww * (k + 0.55) / cfg.misters;
            list.push({ x: x % cfg.ww, dir: rng() < 0.5 ? -1 : 1, ph: rng() * 5, period: 5.4 });
        }
        return list;
    }

    // Webs span the air between the arches, never over the hive.
    function buildWebs(cfg, rng) {
        var list = [];
        for (var k = 0; k < cfg.webs; k++) {
            var x = HIVE_X + cfg.ww * (k + 0.3) / cfg.webs + (rng() - 0.5) * 120;
            list.push({ x: x % cfg.ww, y: 170 + rng() * 150, r: 54 + rng() * 14, ph: rng() * 6 });
        }
        return list;
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rng = G.rng(cfg.seed);
        var s = {
            cfg: cfg, ww: cfg.ww, touch: G.isTouch(), time: 0, level: level,
            bee: { x: HIVE_X + 80, y: 300, vx: 0, vy: 0, face: 1, inv: 0, cd: 0, pollen: -1, src: null, webbed: false },
            camU: HIVE_X + 80 + 170, flowers: buildFlowers(cfg, rng), misters: buildMisters(cfg, rng),
            webs: buildWebs(cfg, rng), foes: [], darts: [], shots: [],
            hive: { hp: 100, hurt: 0, sfx: 0 }, queen: null, queenT: cfg.queen ? 10 : -1,
            spawn: { beetle: 2, thief: 9, raider: 14, escort: 0 }, msg: '', msgT: 0, buzz: 0, cleared: false
        };
        // A couple of beetles are already about, far from the hive.
        for (var i = 0; i < Math.min(2, cfg.beetles); i++) {
            s.foes.push(newFoe(s, 'beetle', HIVE_X + cfg.ww * (0.35 + 0.3 * i), 160 + rng() * 160));
        }
        return s;
    }

    function newFoe(s, kind, x, y) {
        return { kind: kind, x: wrap(s, x), y: y, vx: 0, vy: 0, hp: kind === 'escort' ? 2 : 1, t: 0,
            ph: G.rnd(0, 6.28), dir: Math.random() < 0.5 ? -1 : 1, state: 'seek', target: null, dead: false };
    }

    // ------------------------------------------------------------------
    // The bee
    // ------------------------------------------------------------------

    function misterOn(s, m) {
        var c = (s.time + m.ph) % m.period;
        return c >= 1.2 && c < 3.4;
    }

    // An active mister pushes down and to its side anywhere in its column.
    function windAt(s, x, y) {
        var w = { x: 0, y: 0 };
        s.misters.forEach(function (m) {
            if (!misterOn(s, m) || Math.abs(dxw(s, m.x, x)) > 70 || y < TOP) return;
            w.x += m.dir * 620; w.y += 900;
        });
        return w;
    }

    function webAt(s, x, y) {
        for (var i = 0; i < s.webs.length; i++) {
            var wb = s.webs[i];
            if (near(s, wb.x, wb.y, x, y, wb.r)) return wb;
        }
        return null;
    }

    function moveBee(s, dt) {
        var b = s.bee, k = G.key, ix = (k.right ? 1 : 0) - (k.left ? 1 : 0), iy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        if (ix) b.face = ix;
        var wind = windAt(s, b.x, b.y), web = webAt(s, b.x, b.y), drag = web ? 9 : DRAG;
        if (web && !b.webbed) {
            G.tone(240, 0.25, { type: 'triangle', slide: 160, vol: 0.12 });
            G.burst(fx(s, b.x), b.y, { n: 6, color: C.cream, speed: 60, life: 0.4, size: 2 });
        }
        b.webbed = !!web;
        b.vx += (ix * THRUST_X + wind.x - b.vx * drag) * dt;
        b.vy += (iy * THRUST_Y + GRAV + wind.y - b.vy * drag) * dt;
        b.vx = G.clamp(b.vx, -MAXVX, MAXVX); b.vy = G.clamp(b.vy, -MAXVY, MAXVY);
        b.x = wrap(s, b.x + b.vx * dt); b.y += b.vy * dt;
        if (b.y < TOP + BEE_R) { b.y = TOP + BEE_R; b.vy = Math.max(0, b.vy); }
        if (b.y > FLOOR - BEE_R) {
            // Walking on the soil: the bed grips the feet.
            b.y = FLOOR - BEE_R; b.vy = Math.min(0, b.vy); b.vx -= b.vx * Math.min(1, 4 * dt);
        }
        if (b.inv > 0) b.inv -= dt;
        if (b.cd > 0) b.cd -= dt;
    }

    // Holding STING fires a dart every DART_CD seconds, so a phone thumb
    // can rest on the button.
    function sting(s) {
        var b = s.bee;
        if (!G.key.a || b.cd > 0) return;
        b.cd = DART_CD;
        s.darts.push({ x: wrap(s, b.x + b.face * 16), y: b.y + 3, vx: b.face * DART_V + b.vx * 0.4, life: DART_LIFE });
        G.tone(1600, 0.05, { type: 'triangle', slide: 950, vol: 0.06 });
    }

    function updateDarts(s, dt) {
        s.darts = s.darts.filter(function (d) {
            d.x = wrap(s, d.x + d.vx * dt);
            d.life -= dt;
            return d.life > 0;
        });
    }

    // ------------------------------------------------------------------
    // Pollen
    // ------------------------------------------------------------------

    // The bee always carries the pollen of the last flower it touched; a
    // closed bud of that colour (not the one it came from) opens.
    function touchFlowers(s) {
        var b = s.bee, r = HEAD_R + BEE_R + (s.touch ? 6 : 0);
        s.flowers.forEach(function (f) {
            if (f === b.src || !near(s, b.x, b.y, f.x, f.y, r)) return;
            if (f.kind === b.pollen && !f.bloom) { bloom(s, f); b.src = f; return; }
            if (f.kind !== b.pollen) {
                b.pollen = f.kind; b.src = f;
                G.tone(660 + f.kind * 110, 0.12, { type: 'triangle', vol: 0.14 });
                G.tone(990 + f.kind * 165, 0.1, { type: 'sine', vol: 0.08, delay: 0.06 });
                G.burst(fx(s, f.x), f.y, { n: 8, color: KINDS[f.kind].c, speed: 70, life: 0.5, size: 3, gravity: 40 });
                return;
            }
            b.src = f;
        });
    }

    function bloom(s, f) {
        f.bloom = true; f.bloomT = 0; f.sip = 0;
        G.addScore(100 * s.level);
        G.popup(fx(s, f.x), f.y - 30, '+' + 100 * s.level, KINDS[f.kind].c);
        G.burst(fx(s, f.x), f.y, { n: 18, color: KINDS[f.kind].c, speed: 160, life: 0.9, size: 4, gravity: 90, drag: 1.5 });
        // A harp roll up the major chord.
        [0, 4, 7, 12].forEach(function (st, i) {
            G.tone(392 * Math.pow(2, (st + f.kind * 2) / 12), 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.05 });
        });
    }

    function wilt(s, f) {
        f.bloom = false; f.sip = 0;
        G.tone(520, 0.4, { type: 'sine', slide: 180, vol: 0.12 });
        G.burst(fx(s, f.x), f.y, { n: 10, color: '#7a6a4a', speed: 50, life: 0.8, size: 3, gravity: 120 });
        s.msg = 'A WASP ROBBED A FLOWER'; s.msgT = 2;
    }

    function bloomsLeft(s) {
        return s.flowers.filter(function (f) { return !f.bloom; }).length;
    }

    // ------------------------------------------------------------------
    // Pests
    // ------------------------------------------------------------------

    // Eases a foe's velocity towards (wx, wy) and moves it, inside the house.
    function steer(s, f, wx, wy, dt, k) {
        f.vx += (wx - f.vx) * Math.min(1, k * dt);
        f.vy += (wy - f.vy) * Math.min(1, k * dt);
        f.x = wrap(s, f.x + f.vx * dt);
        f.y = G.clamp(f.y + f.vy * dt, TOP + 16, FLOOR - 18);
    }

    function toward(s, f, x, y, speed) {
        var dx = dxw(s, f.x, x), dy = y - f.y, d = Math.hypot(dx, dy) || 1;
        return { x: dx / d * speed, y: dy / d * speed, d: d };
    }

    // Beetles bumble along and turn towards the bee when it comes close.
    function beetle(s, f, dt) {
        var b = s.bee, v = toward(s, f, b.x, b.y, s.cfg.beetleV);
        if (v.d < 330) steer(s, f, v.x, v.y, dt, 1.5);
        else steer(s, f, f.dir * s.cfg.beetleV * 0.7, Math.sin(f.t * 0.8 + f.ph) * 40, dt, 1.5);
    }

    function pickBloom(s, f) {
        var best = null, bd = 1e9;
        s.flowers.forEach(function (fl) {
            var taken = s.foes.some(function (o) { return o !== f && o.target === fl; });
            var d = Math.abs(dxw(s, f.x, fl.x));
            if (fl.bloom && !taken && d < bd) { bd = d; best = fl; }
        });
        return best;
    }

    // Thieves fly to an open flower and sip it; a flower sipped for SIP
    // seconds closes again and the thief makes off through the roof with
    // its nectar. With nothing open they harass the bee.
    function thief(s, f, dt) {
        if (f.state === 'leave') {
            steer(s, f, f.dir * 60, -160, dt, 2);
            if (f.y <= TOP + 20) f.dead = true;
            return;
        }
        if (!f.target || !f.target.bloom) { if (f.target) f.target.sip = 0; f.target = pickBloom(s, f); }
        var fl = f.target;
        if (!fl) { var v = toward(s, f, s.bee.x, s.bee.y, 95); steer(s, f, v.x, v.y, dt, 1.5); return; }
        var w = toward(s, f, fl.x, fl.y - 30, 125);
        if (w.d > 8) { steer(s, f, w.x, w.y, dt, 2.5); return; }
        steer(s, f, 0, Math.sin(f.t * 6) * 20, dt, 4);
        if (fl.sip === 0) { s.msg = 'A WASP IS ROBBING A FLOWER'; s.msgT = 1.8; G.tone(300, 0.3, { type: 'sawtooth', slide: 340, vol: 0.05 }); }
        fl.sip += dt;
        if (fl.sip >= SIP) { wilt(s, fl); f.target = null; f.state = 'leave'; }
    }

    // Raiders make for the hive and sting it, but turn on a bee that comes
    // close.
    function raider(s, f, dt) {
        var b = s.bee, vb = toward(s, f, b.x, b.y, 150);
        if (vb.d < 190 && b.inv <= 0) { steer(s, f, vb.x, vb.y, dt, 2); return; }
        var vh = toward(s, f, HIVE_X + Math.cos(f.t * 2 + f.ph) * 30, HIVE_Y - 10 + Math.sin(f.t * 3 + f.ph) * 22, 100);
        steer(s, f, vh.x, vh.y, dt, 2);
        if (near(s, f.x, f.y, HIVE_X, HIVE_Y, HIVE_R + 26)) hitHive(s, 7 * dt);
    }

    // Escorts circle the queen and lunge at a bee inside their ring.
    function escort(s, f, dt) {
        var q = s.queen;
        if (!q) { f.dead = true; return; }
        var a = f.t * 1.7 + f.ph, b = s.bee, vb = toward(s, f, b.x, b.y, 190);
        if (vb.d < 150 && b.inv <= 0) { steer(s, f, vb.x, vb.y, dt, 2.5); return; }
        var v = toward(s, f, q.x + Math.cos(a) * 90, q.y + Math.sin(a) * 60, 220);
        steer(s, f, v.x, v.y, dt, 3);
    }

    var FOES = { beetle: beetle, thief: thief, raider: raider, escort: escort };

    function count(s, kind) { return s.foes.filter(function (f) { return f.kind === kind; }).length; }

    // New pests come in out of sight, half the house from the bee.
    function spawnFoes(s, dt) {
        var cfg = s.cfg, caps = { beetle: cfg.beetles, thief: cfg.thieves, raider: cfg.raiders };
        var gaps = { beetle: 8, thief: 14, raider: 15 };
        Object.keys(caps).forEach(function (kind) {
            if ((s.spawn[kind] -= dt) > 0) return;
            s.spawn[kind] = gaps[kind];
            if (count(s, kind) >= caps[kind]) return;
            var x = s.bee.x + s.ww / 2 + G.rnd(-300, 300);
            s.foes.push(newFoe(s, kind, x, G.rnd(TOP + 60, 320)));
            if (kind !== 'beetle') G.noise(0.4, { filter: 'bandpass', freq: 320, vol: 0.05 });
        });
    }

    function updateFoes(s, dt) {
        s.foes.forEach(function (f) { f.t += dt; FOES[f.kind](s, f, dt); });
    }

    // ------------------------------------------------------------------
    // The Hornet Queen
    // ------------------------------------------------------------------

    function spawnQueen(s) {
        s.queen = { x: wrap(s, HIVE_X + s.ww / 2), y: 200, vx: 0, vy: 0, hp: QUEEN_HP, phase: 1, t: 0, fire: 3, dash: 0, hurt: 0 };
        s.spawn.escort = 0;
        s.msg = 'THE HORNET QUEEN IS COMING'; s.msgT = 3;
        G.sfx('alarm');
    }

    // Her phase follows her health: escorts and stingers first, then she
    // calls raiders, then she dashes at the bee with wide fans of stingers.
    function queenPhase(s, q) {
        var p = q.hp > QUEEN_HP * 2 / 3 ? 1 : q.hp > QUEEN_HP / 3 ? 2 : 3;
        if (p === q.phase) return;
        q.phase = p;
        G.sfx('alarm'); G.flash('rgba(232,140,40,0.25)', 0.3);
        s.msg = p === 2 ? 'THE QUEEN CALLS HER RAIDERS' : 'THE QUEEN IS ENRAGED'; s.msgT = 2;
        for (var i = 0; i < 2; i++) s.foes.push(newFoe(s, 'raider', q.x + (i ? 80 : -80), q.y + 40));
    }

    function queenMove(s, q, dt) {
        var b = s.bee, speed = [0, 42, 52, 68][q.phase];
        if (q.phase === 3 && (q.dash -= dt) < -3.2) {
            q.dash = 0.9; G.tone(180, 0.5, { type: 'sawtooth', slide: 90, vol: 0.08 });
        }
        var v = q.dash > 0 ? toward(s, q, b.x, b.y, 300) : toward(s, q, HIVE_X, HIVE_Y - 60 + Math.sin(q.t * 1.3) * 50, speed);
        if (v.d < 20 && q.dash <= 0) { v.x = 0; v.y = 0; }
        steer(s, q, v.x, v.y, dt, q.dash > 0 ? 4 : 1.5);
        if (near(s, q.x, q.y, HIVE_X, HIVE_Y, HIVE_R + 70)) hitHive(s, 9 * dt);
    }

    function queenFire(s, q, dt) {
        var b = s.bee, dx = dxw(s, q.x, b.x);
        if ((q.fire -= dt) > 0 || Math.abs(dx) > 560) return;
        q.fire = [0, 2.4, 2.0, 1.7][q.phase];
        var n = [0, 1, 3, 5][q.phase], a0 = Math.atan2(b.y - q.y, dx);
        for (var i = 0; i < n; i++) {
            var a = a0 + (i - (n - 1) / 2) * 0.32;
            s.shots.push({ x: q.x, y: q.y + 14, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 2.8 });
        }
        G.tone(420, 0.12, { type: 'square', slide: 820, vol: 0.06 });
    }

    function updateQueen(s, dt) {
        if (s.queenT > 0 && (s.queenT -= dt) <= 0) spawnQueen(s);
        var q = s.queen;
        if (!q) return;
        q.t += dt;
        if (q.hurt > 0) q.hurt -= dt;
        queenPhase(s, q);
        queenMove(s, q, dt);
        queenFire(s, q, dt);
        var want = q.phase === 3 ? 3 : 2;
        if ((s.spawn.escort -= dt) <= 0 && count(s, 'escort') < want) {
            s.spawn.escort = 7;
            s.foes.push(newFoe(s, 'escort', q.x, q.y - 60));
        }
    }

    function killQueen(s, q) {
        s.queen = null;
        G.addScore(3000);
        G.sfx('bigboom'); G.shake(10, 0.6); G.flash('rgba(242,193,78,0.4)', 0.4);
        G.burst(fx(s, q.x), q.y, { n: 60, color: C.gold, speed: 320, life: 1.4, size: 5, gravity: 120 });
        G.burst(fx(s, q.x), q.y, { n: 30, color: C.pink, speed: 220, life: 1.2, size: 4 });
        s.foes.forEach(function (f) { if (f.kind !== 'beetle') { f.dead = true; G.burst(fx(s, f.x), f.y, { n: 8, color: C.gold, speed: 140 }); } });
        s.shots = [];
        s.msg = 'THE QUEEN HAS FALLEN'; s.msgT = 2.5;
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (sh) {
            sh.x = wrap(s, sh.x + sh.vx * dt); sh.y += sh.vy * dt; sh.life -= dt;
            return sh.life > 0 && sh.y > TOP && sh.y < FLOOR;
        });
    }

    // ------------------------------------------------------------------
    // Hits
    // ------------------------------------------------------------------

    function killFoe(s, f) {
        f.dead = true;
        if (f.target) f.target.sip = 0;
        G.addScore(FOE_SCORE[f.kind]);
        G.popup(fx(s, f.x), f.y - 16, '+' + FOE_SCORE[f.kind], C.cream);
        G.burst(fx(s, f.x), f.y, { n: 14, color: f.kind === 'beetle' ? '#4fa38a' : C.gold, speed: 170, life: 0.6, size: 3, gravity: 200 });
        G.noise(0.12, { filter: 'bandpass', freq: 900, vol: 0.12 });
        G.tone(300, 0.12, { type: 'square', slide: 90, vol: 0.07 });
    }

    function dartHits(s, d) {
        for (var i = 0; i < s.foes.length; i++) {
            var f = s.foes[i];
            if (f.dead || !near(s, d.x, d.y, f.x, f.y, FOE_R[f.kind] + 9)) continue;
            if (--f.hp <= 0) killFoe(s, f);
            else G.tone(900, 0.06, { type: 'square', vol: 0.06 });
            return true;
        }
        var q = s.queen;
        if (q && near(s, d.x, d.y, q.x, q.y, QUEEN_R + 8)) {
            q.hp--; q.hurt = 0.12;
            G.tone(240 + q.hp * 12, 0.08, { type: 'square', vol: 0.08 });
            if (q.hp <= 0) killQueen(s, q);
            return true;
        }
        return false;
    }

    function stingHits(s) {
        s.darts = s.darts.filter(function (d) { return !dartHits(s, d); });
        s.foes = s.foes.filter(function (f) { return !f.dead; });
    }

    function beeTouched(s) {
        var b = s.bee, q = s.queen;
        if (b.inv > 0) return false;
        var foe = s.foes.some(function (f) { return near(s, b.x, b.y, f.x, f.y, FOE_R[f.kind] + BEE_R - 3); });
        var shot = s.shots.some(function (sh) { return near(s, b.x, b.y, sh.x, sh.y, BEE_R + 3); });
        return foe || shot || (q && near(s, b.x, b.y, q.x, q.y, QUEEN_R + BEE_R - 6));
    }

    // A sting costs a life and the pollen; the bee is knocked back and
    // shielded for two seconds. Returns true when the run is over.
    function hurtBee(s) {
        var b = s.bee;
        b.inv = 2; b.pollen = -1; b.src = null;
        b.vx = -b.face * 220; b.vy = -160;
        G.shake(6, 0.3);
        G.burst(fx(s, b.x), b.y, { n: 16, color: C.gold, speed: 190, life: 0.6, size: 3 });
        G.noise(0.3, { filter: 'bandpass', freq: 500, vol: 0.12 });
        return G.loseLife() <= 0;
    }

    function hitHive(s, dmg) {
        s.hive.hp -= dmg; s.hive.hurt = 0.25;
        if ((s.hive.sfx -= 1 / 60) <= 0) {
            s.hive.sfx = 0.45;
            G.tone(110, 0.12, { type: 'triangle', slide: 70, vol: 0.14 });
        }
    }

    // A fallen hive costs a life: the colony drives the raiders off and the
    // queen back across the house, and the hive is rebuilt.
    function hiveLost(s) {
        s.hive.hp = 100;
        G.sfx('boom'); G.flash('rgba(224,87,58,0.35)', 0.4);
        G.burst(fx(s, HIVE_X), HIVE_Y, { n: 30, color: C.gold, speed: 220, life: 1, size: 4, gravity: 160 });
        s.foes.forEach(function (f) { if (f.kind !== 'beetle' && Math.abs(dxw(s, f.x, HIVE_X)) < 420) f.dead = true; });
        if (s.queen) s.queen.x = wrap(s, HIVE_X + s.ww / 2);
        s.msg = 'THE HIVE WAS OVERRUN'; s.msgT = 2;
        return G.loseLife() <= 0;
    }

    // ------------------------------------------------------------------
    // The tick
    // ------------------------------------------------------------------

    function camera(s, dt) {
        var b = s.bee, want = b.x + b.face * 170 + b.vx * 0.2;
        s.camU += dxw(s, wrap(s, s.camU), want) * Math.min(1, dt * 3.5);
        G.cam.x = s.camU - W / 2; G.cam.y = 0;
    }

    function tickTimers(s, dt) {
        s.time += dt;
        if (s.msgT > 0) s.msgT -= dt;
        // The colony mends its hive whenever no wasp is at it.
        if (s.hive.hurt > 0) s.hive.hurt -= dt;
        else s.hive.hp = Math.min(100, s.hive.hp + 2 * dt);
        s.flowers.forEach(function (f) { f.bloomT += dt; });
        // A soft hiss each time a mister opens up.
        s.misters.forEach(function (m) {
            var c = (s.time + m.ph) % m.period;
            if (c >= 1.2 && c - dt < 1.2 && Math.abs(dxw(s, m.x, s.bee.x)) < 700) G.noise(1.6, { filter: 'highpass', freq: 2600, vol: 0.06 });
        });
    }

    function update(s, dt) {
        tickTimers(s, dt);
        moveBee(s, dt);
        sting(s);
        updateDarts(s, dt);
        touchFlowers(s);
        spawnFoes(s, dt);
        updateFoes(s, dt);
        updateQueen(s, dt);
        updateShots(s, dt);
        stingHits(s);
        camera(s, dt);
        if (beeTouched(s) && hurtBee(s)) return;
        if (s.hive.hp <= 0 && hiveLost(s)) return;
        if (!bloomsLeft(s) && !s.queen && s.queenT <= 0) {
            G.win(500 * s.level + Math.round(s.hive.hp) * 10 + G.lives * 250);
        }
    }

    // ------------------------------------------------------------------
    // Drawing: the glasshouse
    // ------------------------------------------------------------------

    function drawSky(s, ctx) {
        var g = ctx.createLinearGradient(0, G.HUD, 0, H);
        g.addColorStop(0, '#173a2c'); g.addColorStop(0.55, C.bg2); g.addColorStop(1, C.bg);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // Light shafts through the glass, slowly breathing.
        ctx.fillStyle = 'rgba(255,244,205,' + (0.045 + 0.02 * Math.sin(G.t * 0.7)) + ')';
        ctx.beginPath();
        for (var k = 0; k < 4; k++) {
            var x = ((k * 330 - s.camU * 0.25) % 1320 + 1320) % 1320 - 180;
            ctx.moveTo(x, TOP); ctx.lineTo(x + 90, TOP); ctx.lineTo(x + 300, FLOOR); ctx.lineTo(x + 150, FLOOR);
        }
        ctx.fill();
    }

    // Far panes of glass: slender mullions with arched heads, at parallax.
    function drawPanes(s, ctx) {
        var step = 120, off = ((s.camU * 0.5) % step + step) % step;
        ctx.strokeStyle = 'rgba(160,210,185,0.16)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var x = -off; x < W + step; x += step) {
            ctx.moveTo(x, FLOOR); ctx.lineTo(x, 170);
            ctx.arc(x + step / 2, 170, step / 2, Math.PI, 0);
        }
        ctx.moveTo(0, 300); ctx.lineTo(W, 300);
        ctx.stroke();
    }

    // Fern and palm silhouettes behind the beds, swaying.
    function drawFerns(s, ctx) {
        var step = 210, base = Math.floor((s.camU * 0.7 - W / 2) / step);
        ctx.fillStyle = 'rgba(30,70,45,0.85)';
        ctx.beginPath();
        for (var k = base - 1; k < base + 7; k++) {
            var x = k * step - (s.camU * 0.7 - W / 2), h = 120 + (k * 53 % 5) * 22;
            for (var j = -2; j <= 2; j++) {
                var sway = Math.sin(G.t * 0.9 + k + j) * 8, tipX = x + j * 34 + sway, tipY = FLOOR - h + Math.abs(j) * 30;
                ctx.moveTo(x, FLOOR);
                ctx.quadraticCurveTo(x + j * 10 - 10, tipY + 40, tipX, tipY);
                ctx.quadraticCurveTo(x + j * 10 + 10, tipY + 40, x + 6, FLOOR);
            }
        }
        ctx.fill();
    }

    // Condensation running down the glass: placed by index and time only.
    function drawRain(s, ctx) {
        ctx.strokeStyle = 'rgba(210,240,230,0.22)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i < 26; i++) {
            var x = ((i * 157 - s.camU * 0.5) % W + W) % W;
            var y = TOP + ((G.t * (30 + (i % 5) * 14) + i * 61) % (FLOOR - TOP));
            ctx.moveTo(x, y); ctx.lineTo(x + 0.5, y + 10 + (i % 3) * 5);
        }
        ctx.stroke();
    }

    // The big wrought-iron arches, one every RIB pixels of the house.
    function drawRibs(s, ctx) {
        var base = Math.floor((s.camU - W / 2) / RIB);
        ctx.strokeStyle = C.iron; ctx.lineWidth = 10;
        ctx.beginPath();
        for (var k = base; k <= base + 3; k++) {
            var x = k * RIB - (s.camU - W / 2);
            ctx.moveTo(x, FLOOR); ctx.lineTo(x, 200);
            ctx.quadraticCurveTo(x, TOP + 4, x + RIB / 2, TOP + 4);
            ctx.quadraticCurveTo(x + RIB, TOP + 4, x + RIB, 200);
        }
        ctx.stroke();
        ctx.strokeStyle = C.ironHi; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = C.ironHi;
        for (var r = base; r <= base + 3; r++) {
            var rx = r * RIB - (s.camU - W / 2);
            ctx.beginPath(); ctx.arc(rx, 200, 9, 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawFloor(s, ctx) {
        ctx.fillStyle = C.soil;
        ctx.fillRect(0, FLOOR, W, H - FLOOR);
        ctx.fillStyle = C.terra;
        ctx.fillRect(0, FLOOR, W, 6);
        // Brick joints scroll with the house.
        ctx.fillStyle = C.terraDk;
        var off = ((s.camU % 40) + 40) % 40;
        for (var x = -off; x < W; x += 40) ctx.fillRect(x, FLOOR, 3, 6);
        ctx.fillStyle = '#3f5c2c';
        for (var m = -off * 2; m < W; m += 80) ctx.fillRect(m + 12, FLOOR + 14, 18, 4);
    }

    function drawMisters(s, ctx) {
        s.misters.forEach(function (m) {
            var x = sx(s, m.x), c = (s.time + m.ph) % m.period, on = misterOn(s, m);
            if (x < -120 || x > W + 120) return;
            ctx.fillStyle = C.ironHi;
            ctx.fillRect(x - 3, TOP, 6, 18); ctx.fillRect(x - 12, TOP + 16, 24, 8);
            if (c < 1.2) {
                // The warning: a few puffs from the nozzle.
                ctx.fillStyle = 'rgba(230,245,240,0.5)';
                for (var p = 0; p < 3; p++) { ctx.beginPath(); ctx.arc(x + (p - 1) * 9, TOP + 32 + (c * 40 + p * 7) % 26, 4, 0, 6.29); ctx.fill(); }
                return;
            }
            if (!on) return;
            var g = ctx.createLinearGradient(0, TOP, 0, FLOOR);
            g.addColorStop(0, 'rgba(225,245,240,0.38)'); g.addColorStop(1, 'rgba(225,245,240,0.06)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x - 12, TOP + 24); ctx.lineTo(x + 12, TOP + 24);
            ctx.lineTo(x + 70 + m.dir * 50, FLOOR); ctx.lineTo(x - 70 + m.dir * 50, FLOOR);
            ctx.fill();
            drawSpray(s, ctx, m, x);
        });
    }

    function drawSpray(s, ctx, m, x) {
        ctx.fillStyle = 'rgba(240,250,248,0.6)';
        ctx.beginPath();
        for (var i = 0; i < 14; i++) {
            var f = ((s.time * 1.6 + i * 0.137) % 1), y = TOP + 24 + f * (FLOOR - TOP - 24);
            var px = x + (((i * 37) % 100) / 100 - 0.5) * (24 + f * 110) + m.dir * f * 50;
            ctx.rect(px, y, 3, 3);
        }
        ctx.fill();
    }

    function drawWebs(s, ctx) {
        ctx.strokeStyle = 'rgba(235,235,225,0.5)'; ctx.lineWidth = 1;
        s.webs.forEach(function (wb) {
            var x = sx(s, wb.x);
            if (x < -100 || x > W + 100) return;
            ctx.beginPath();
            ctx.moveTo(x, TOP); ctx.lineTo(x, wb.y - wb.r);
            for (var k = 0; k < 8; k++) {
                var a = k * Math.PI / 4 + wb.ph;
                ctx.moveTo(x, wb.y); ctx.lineTo(x + Math.cos(a) * wb.r, wb.y + Math.sin(a) * wb.r);
            }
            for (var ring = 1; ring <= 4; ring++) {
                var rr = wb.r * ring / 4.4;
                for (var j = 0; j <= 8; j++) {
                    var b = j * Math.PI / 4 + wb.ph, px = x + Math.cos(b) * rr, py = wb.y + Math.sin(b) * rr;
                    if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
                }
            }
            ctx.stroke();
            // The spider, bobbing on its thread.
            ctx.fillStyle = C.ink;
            ctx.beginPath(); ctx.arc(x + 3, wb.y - 6 + Math.sin(G.t * 2 + wb.ph) * 3, 5, 0, 6.29); ctx.fill();
        });
    }

    // ------------------------------------------------------------------
    // Drawing: flowers and the hive
    // ------------------------------------------------------------------

    function drawPot(ctx, x, f) {
        ctx.fillStyle = C.terra;
        ctx.beginPath();
        ctx.moveTo(x - 22, POT_Y); ctx.lineTo(x + 22, POT_Y); ctx.lineTo(x + 16, FLOOR + 4); ctx.lineTo(x - 16, FLOOR + 4);
        ctx.fill();
        ctx.fillStyle = C.terraDk;
        ctx.fillRect(x - 24, POT_Y - 4, 48, 8);
        // The botanical label: a cream tag with the Latin name.
        ctx.fillStyle = C.cream;
        ctx.fillRect(x - 40, FLOOR + 12, 80, 16);
        ctx.fillStyle = C.ink;
        ctx.font = 'italic ' + G.font(10);
        ctx.textAlign = 'center';
        ctx.fillText(KINDS[f.kind].latin, x, FLOOR + 24, 76);
    }

    function drawStem(ctx, x, f, sway) {
        ctx.strokeStyle = C.fern; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, POT_Y);
        ctx.quadraticCurveTo(x - 10, (POT_Y + f.y) / 2, x + sway, f.y);
        ctx.stroke();
        ctx.fillStyle = C.leaf;
        ctx.beginPath();
        ctx.ellipse(x - 14, POT_Y - 22, 14, 5, -0.5, 0, 6.29);
        ctx.ellipse(x + 10, POT_Y - 38, 13, 5, 0.6, 0, 6.29);
        ctx.fill();
    }

    function drawBloom(ctx, x, y, k, scale, t) {
        var kind = KINDS[k], n = kind.petals, r = HEAD_R * 1.25 * scale;
        ctx.fillStyle = kind.c;
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
            var a = i * Math.PI * 2 / n + t * 0.3;
            ctx.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.62, r * 0.32, a, 0, 6.29);
            ctx.closePath();
        }
        ctx.fill();
        ctx.fillStyle = C.gold;
        ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, 6.29); ctx.fill();
        ctx.fillStyle = kind.dk;
        ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 6.29); ctx.fill();
    }

    function drawBud(ctx, x, y, k) {
        var kind = KINDS[k];
        ctx.fillStyle = kind.c;
        ctx.beginPath();
        ctx.moveTo(x, y - HEAD_R - 4);
        ctx.quadraticCurveTo(x + HEAD_R, y, x, y + HEAD_R * 0.7);
        ctx.quadraticCurveTo(x - HEAD_R, y, x, y - HEAD_R - 4);
        ctx.fill();
        ctx.strokeStyle = kind.dk; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = C.fern;
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 4); ctx.lineTo(x, y + HEAD_R); ctx.lineTo(x + 10, y + 4); ctx.lineTo(x, y + 10);
        ctx.fill();
    }

    // A bud the carried pollen would open gets a pulsing ring; one a wasp
    // is sipping shows how far it got.
    function drawFlowerMarks(s, ctx, f, x, sway) {
        var b = s.bee;
        if (!f.bloom && f.kind === b.pollen && f !== b.src) {
            ctx.strokeStyle = KINDS[f.kind].c; ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.t * 6);
            ctx.beginPath(); ctx.arc(x + sway, f.y, HEAD_R + 10 + Math.sin(G.t * 6) * 3, 0, 6.29); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        if (f.sip > 0) {
            ctx.strokeStyle = C.red; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(x + sway, f.y, HEAD_R + 14, -Math.PI / 2, -Math.PI / 2 + f.sip / SIP * Math.PI * 2); ctx.stroke();
        }
    }

    function drawFlowers(s, ctx) {
        s.flowers.forEach(function (f) {
            var x = sx(s, f.x);
            if (x < -60 || x > W + 60) return;
            var sway = Math.sin(G.t * 1.3 + f.ph) * 4;
            drawPot(ctx, x, f);
            drawStem(ctx, x, f, sway);
            if (f.bloom) drawBloom(ctx, x + sway, f.y, f.kind, Math.min(1, 0.3 + f.bloomT * 1.4), G.t);
            else drawBud(ctx, x + sway, f.y, f.kind);
            drawFlowerMarks(s, ctx, f, x, sway);
        });
    }

    // A straw skep on a terracotta pedestal, with its guard bees circling.
    function drawHive(s, ctx) {
        var x = sx(s, HIVE_X), y = HIVE_Y, hurt = s.hive.hurt > 0;
        if (x < -80 || x > W + 80) return;
        ctx.fillStyle = C.terra;
        ctx.fillRect(x - 20, y + 26, 40, FLOOR - y - 26);
        ctx.fillStyle = C.terraDk;
        ctx.fillRect(x - 28, y + 24, 56, 7);
        for (var r = 0; r < 5; r++) {
            ctx.fillStyle = hurt && r % 2 ? C.red : (r % 2 ? '#c99a3e' : '#e2b65a');
            ctx.beginPath();
            ctx.ellipse(x, y + 18 - r * 11, 34 - r * 5, 9, 0, 0, 6.29);
            ctx.fill();
        }
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(x, y + 14, 6, Math.PI, 0); ctx.fill();
        ctx.fillStyle = C.gold;
        for (var i = 0; i < 3; i++) {
            var a = G.t * (2 + i * 0.5) + i * 2;
            ctx.fillRect(x + Math.cos(a) * 44 - 2, y - 6 + Math.sin(a * 1.3) * 20 - 2, 4, 4);
        }
        if (s.level > 1 && s.hive.hp < 100) drawBar(ctx, x - 30, y - 50, 60, s.hive.hp / 100, s.hive.hp < 35 ? C.red : C.gold);
    }

    function drawBar(ctx, x, y, w, f, col) {
        ctx.fillStyle = 'rgba(14,34,25,0.85)';
        ctx.fillRect(x - 2, y - 2, w + 4, 9);
        ctx.fillStyle = col;
        ctx.fillRect(x, y, w * G.clamp(f, 0, 1), 5);
    }

    // ------------------------------------------------------------------
    // Drawing: creatures
    // ------------------------------------------------------------------

    function drawWings(ctx, t, size) {
        var flap = 0.5 + 0.5 * Math.sin(t * 50);
        ctx.fillStyle = 'rgba(235,250,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-2, -size * 0.8, size * 0.75, size * (0.25 + 0.35 * flap), -0.4, 0, 6.29);
        ctx.ellipse(-size * 0.5, -size * 0.7, size * 0.6, size * (0.2 + 0.3 * flap), -0.8, 0, 6.29);
        ctx.fill();
    }

    // Body drawn facing right around (0, 0); stripes say bee or wasp.
    function drawInsect(ctx, size, body, stripe, head, t, slim) {
        drawWings(ctx, t, size);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(-size * 0.25, 0, size * (slim ? 0.85 : 0.95), size * (slim ? 0.48 : 0.68), 0, 0, 6.29);
        ctx.fill();
        ctx.fillStyle = stripe;
        for (var i = 0; i < 3; i++) ctx.fillRect(-size * (0.75 - i * 0.42), -size * 0.6, size * 0.18, size * 1.2);
        ctx.beginPath();
        ctx.moveTo(-size * 1.15, -3); ctx.lineTo(-size * 1.55, 0); ctx.lineTo(-size * 1.15, 3);
        ctx.fill();
        ctx.fillStyle = head;
        ctx.beginPath(); ctx.arc(size * 0.78, -1, size * 0.42, 0, 6.29); ctx.fill();
    }

    function drawBee(s, ctx) {
        var b = s.bee, x = sx(s, b.x);
        if (b.inv > 0 && Math.floor(b.inv * 10) % 2) return;
        ctx.save();
        ctx.translate(x, b.y + Math.sin(G.t * 9) * 1.5);
        ctx.scale(b.face, 1);
        ctx.rotate(G.clamp(b.vy / 900, -0.3, 0.3));
        drawInsect(ctx, BEE_R + 2, C.gold, C.ink, C.ink, G.t, false);
        if (b.pollen >= 0) {
            // The pollen basket on the hind legs.
            ctx.fillStyle = KINDS[b.pollen].c;
            ctx.beginPath(); ctx.arc(-4, 11, 6, 0, 6.29); ctx.fill();
            ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
        if (s.touch) {
            // A halo keeps the bee easy to find on a small screen.
            ctx.strokeStyle = 'rgba(242,193,78,0.45)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, b.y, 26, 0, 6.29); ctx.stroke();
        }
    }

    function drawBeetle(ctx, f) {
        ctx.fillStyle = C.ink;
        ctx.fillRect(-15, -2, 30, 3);
        ctx.fillStyle = '#2d6b58';
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, 6.29); ctx.fill();
        ctx.strokeStyle = '#123329'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(13, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(160,240,210,0.5)';
        ctx.beginPath(); ctx.ellipse(-3, -5, 6, 3, -0.3, 0, 6.29); ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(14, 0, 5, 0, 6.29); ctx.fill();
    }

    function drawFoes(s, ctx) {
        s.foes.forEach(function (f) {
            var x = sx(s, f.x);
            if (x < -40 || x > W + 40) return;
            ctx.save();
            ctx.translate(x, f.y);
            ctx.scale(f.vx < 0 ? -1 : 1, 1);
            if (f.kind === 'beetle') drawBeetle(ctx, f);
            else if (f.kind === 'thief') drawInsect(ctx, 13, '#e9d33c', C.ink, '#3a2a10', s.time + f.ph, true);
            else if (f.kind === 'raider') drawInsect(ctx, 13, '#e8823a', C.ink, '#5a1c10', s.time + f.ph, true);
            else drawInsect(ctx, 15, '#b8682a', '#3a1a0a', '#e8c25a', s.time + f.ph, true);
            ctx.restore();
        });
    }

    function drawQueen(s, ctx) {
        var q = s.queen;
        if (!q) return;
        var x = sx(s, q.x);
        if (x > -80 && x < W + 80) {
            ctx.save();
            ctx.translate(x, q.y);
            ctx.scale(dxw(s, q.x, s.bee.x) < 0 ? -1 : 1, 1);
            drawInsect(ctx, 32, q.hurt > 0 ? C.cream : '#c46a26', '#2a1206', '#e8c25a', s.time, true);
            // Her crown.
            ctx.fillStyle = C.gold;
            ctx.beginPath();
            ctx.moveTo(14, -12); ctx.lineTo(18, -26); ctx.lineTo(24, -16); ctx.lineTo(30, -28); ctx.lineTo(34, -12);
            ctx.fill();
            ctx.restore();
            drawBar(ctx, x - 40, q.y - 56, 80, q.hp / QUEEN_HP, C.red);
        }
    }

    function drawShots(s, ctx) {
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath();
        s.shots.forEach(function (sh) {
            var x = sx(s, sh.x);
            ctx.moveTo(x + 5, sh.y); ctx.arc(x, sh.y, 5, 0, 6.29);
        });
        ctx.fill();
        ctx.strokeStyle = C.cream; ctx.lineWidth = 3;
        ctx.beginPath();
        s.darts.forEach(function (d) {
            var x = sx(s, d.x), dir = d.vx < 0 ? -1 : 1;
            ctx.moveTo(x - dir * 12, d.y); ctx.lineTo(x + dir * 4, d.y);
        });
        ctx.stroke();
    }

    // ------------------------------------------------------------------
    // Drawing: the scanner, guidance and messages
    // ------------------------------------------------------------------

    function scanX(s, x) { return SCAN.x + SCAN.w / 2 + dxw(s, wrap(s, s.camU), x) * SCAN.w / s.ww; }
    function scanY(y) { return SCAN.y + 4 + (y - TOP) / (FLOOR - TOP) * (SCAN.h - 8); }

    function drawScanner(s, ctx) {
        ctx.fillStyle = 'rgba(10,26,19,0.9)';
        ctx.fillRect(SCAN.x, SCAN.y, SCAN.w, SCAN.h);
        ctx.strokeStyle = C.ironHi; ctx.lineWidth = 2;
        ctx.strokeRect(SCAN.x, SCAN.y, SCAN.w, SCAN.h);
        var vw = W * SCAN.w / s.ww;
        ctx.strokeStyle = 'rgba(244,239,220,0.45)'; ctx.lineWidth = 1;
        ctx.strokeRect(SCAN.x + SCAN.w / 2 - vw / 2, SCAN.y + 2, vw, SCAN.h - 4);
        s.flowers.forEach(function (f) {
            ctx.fillStyle = KINDS[f.kind].c;
            var r = f.bloom ? 4 : 2.5;
            ctx.fillRect(scanX(s, f.x) - r, scanY(f.y) - r, r * 2, r * 2);
        });
        ctx.fillStyle = C.gold;
        ctx.fillRect(scanX(s, HIVE_X) - 4, scanY(HIVE_Y) - 4, 8, 8);
        ctx.fillStyle = C.red;
        s.foes.forEach(function (f) { ctx.fillRect(scanX(s, f.x) - 2, scanY(f.y) - 2, 4, 4); });
        if (s.queen) ctx.fillRect(scanX(s, s.queen.x) - 5, scanY(s.queen.y) - 5, 10, 10);
        ctx.fillStyle = C.cream;
        ctx.fillRect(scanX(s, s.bee.x) - 3, scanY(s.bee.y) - 3, 6, 6);
        drawPollenChip(s, ctx);
    }

    // The carried pollen, beside the scanner.
    function drawPollenChip(s, ctx) {
        var x = SCAN.x + SCAN.w + 30, y = SCAN.y + SCAN.h / 2, p = s.bee.pollen;
        ctx.fillStyle = p >= 0 ? KINDS[p].c : 'rgba(244,239,220,0.15)';
        ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.29); ctx.fill();
        ctx.strokeStyle = C.cream; ctx.lineWidth = 2; ctx.stroke();
        G.text('POLLEN', x + 18, y + 5, { size: s.touch ? 18 : 13, color: C.cream });
    }

    // Edge arrows: to the nearest bud the pollen would open, and to the hive
    // while it is under attack.
    function drawGuide(s, ctx) {
        var b = s.bee, best = null, bd = 1e9;
        s.flowers.forEach(function (f) {
            var d = Math.abs(dxw(s, b.x, f.x));
            if (!f.bloom && f.kind === b.pollen && f !== b.src && d < bd) { bd = d; best = f; }
        });
        if (best) edgeArrow(s, ctx, best.x, best.y, KINDS[best.kind].c, '');
        if (s.hive.hurt > 0) edgeArrow(s, ctx, HIVE_X, HIVE_Y, C.red, 'HIVE');
        if (s.queen) edgeArrow(s, ctx, s.queen.x, s.queen.y, '#e8823a', 'QUEEN');
    }

    function edgeArrow(s, ctx, x, y, col, label) {
        var px = sx(s, x);
        if (px > 0 && px < W) return;
        var side = px < 0 ? -1 : 1, ax = side < 0 ? 26 : W - 26, ay = G.clamp(y, TOP + 30, FLOOR - 20), k = s.touch ? 1.5 : 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ax + side * 16 * k, ay); ctx.lineTo(ax - side * 8 * k, ay - 14 * k); ctx.lineTo(ax - side * 8 * k, ay + 14 * k);
        ctx.fill();
        if (label) G.text(label, ax - side * 14 * k, ay + 34 * k, { size: s.touch ? 20 : 13, color: col, align: side < 0 ? 'left' : 'right', bold: true });
    }

    function drawMessages(s, ctx) {
        var big = s.touch ? 26 : 20;
        if (s.msgT > 0) {
            ctx.globalAlpha = Math.min(1, s.msgT * 2);
            G.text(s.msg, W / 2, 128, { size: big + 4, color: C.cream, align: 'center', bold: true, glow: C.terra });
            ctx.globalAlpha = 1;
        } else if (s.time < 6 && s.level === 1) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 4);
            G.text('Touch a bud to take its pollen, then a bud of the same colour', W / 2, 124, { size: big - 2, color: C.cream, align: 'center', max: 900 });
            ctx.globalAlpha = 1;
        }
    }

    function draw(s, ctx) {
        drawSky(s, ctx);
        drawPanes(s, ctx);
        drawFerns(s, ctx);
        drawRain(s, ctx);
        drawRibs(s, ctx);
        drawMisters(s, ctx);
        drawWebs(s, ctx);
        drawFloor(s, ctx);
        drawFlowers(s, ctx);
        drawHive(s, ctx);
        drawFoes(s, ctx);
        drawQueen(s, ctx);
        drawShots(s, ctx);
        drawBee(s, ctx);
        drawScanner(s, ctx);
        drawGuide(s, ctx);
        drawMessages(s, ctx);
    }

    function hud(s) {
        var parts = ['BLOOMS ' + (s.flowers.length - bloomsLeft(s)) + '/' + s.flowers.length];
        if (s.level > 1) parts.push('HIVE ' + Math.max(0, Math.round(s.hive.hp)) + '%');
        if (s.queen) parts.push('QUEEN ' + s.queen.hp);
        return parts.join('  ');
    }

    // ------------------------------------------------------------------
    // The ending: the glasshouse bursts into flower along the beds while a
    // swarm of bees dances a figure of eight. Only e.t drives it.
    // ------------------------------------------------------------------

    function drawEnding(e, ctx) {
        var t = e.t, i;
        ctx.fillStyle = 'rgba(14,34,25,0.35)';
        ctx.fillRect(0, 0, W, H);
        for (i = 0; i < 12; i++) {
            // The beds stay below the buttons: heads at y 476-506.
            var x = 40 + i * 80, y = 476 + (i * 37 % 31), open = G.clamp((t - i * 0.18) / 0.8, 0, 1);
            ctx.strokeStyle = C.fern; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + Math.sin(t + i) * 6, y); ctx.stroke();
            if (open > 0) drawBloom(ctx, x + Math.sin(t + i) * 6, y, i % 4, 0.3 + open * 0.75, t);
        }
        ctx.fillStyle = C.pink;
        ctx.beginPath();
        for (i = 0; i < 30; i++) {
            var px = (i * 173 + Math.sin(t + i) * 30) % W, py = (t * (40 + i % 4 * 12) + i * 57) % H;
            ctx.moveTo(px + 5, py); ctx.ellipse(px, py, 5, 3, t + i, 0, 6.29);
        }
        ctx.fill();
        for (i = 0; i < 14; i++) {
            var a = t * 1.1 + i * 0.45;
            ctx.save();
            ctx.translate(W / 2 + Math.sin(a) * 320, 300 + Math.sin(a * 2) * 70);
            ctx.scale(Math.cos(a) < 0 ? -1 : 1, 1);
            drawInsect(ctx, 11, C.gold, C.ink, C.ink, t + i, false);
            ctx.restore();
        }
    }

    G.register('greenhouse', {
        title: 'POLLINATOR',
        blurb: 'Fly the bee from bloom to bloom, pollinate them all, keep the wasps off the hive.',
        controls: [
            '← → ↑ ↓ fly in 8 ways (the bee sinks unless you hover)',
            'SPACE / STING: dart forward (hold to keep stinging)',
            'Touch a bud for its pollen, then open a bud of the same colour',
            'Keep wasps off the hive; the scanner shows the whole house'
        ],
        levelNames: ['Seedlings', 'Hothouse', 'The Hornet Queen'],
        colors: { bg: C.bg, fg: C.cream, accent: C.pink, dim: '#9fbfa8' },
        lives: 4,
        music: {
            bpm: 100, root: 50, scale: 'major', prog: [0, 3, 0, 4, 5, 3, 4, 0],
            bass: 'x.......5...o...',
            lead: ['4---2-3-4---7---', '5---3-5-7---5-3-', '4-2-0-2-4---2---', '1---4-6-8---6-4-',
                '5---7-9-7---5---', '3-5-7-5-3---1---', '4---6-4-1-2-4---', '2---1-0---------'],
            arp: '0.1.2.3.2.1.0.2.',
            drums: { k: 'x.......x.......', h: '..x...x...x...xx' },
            leadWave: 'triangle', bassWave: 'sine', arpWave: 'triangle', leadOct: 1
        },
        touch: { a: 'STING', hide: ['b'] },
        cursor: 'none',
        ending: {
            title: 'IN FULL BLOOM',
            text: 'Every bud open, the hive humming.',
            colors: ['#f29bb5', '#7cbf6a', '#f2c14e', '#f4efdc'],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
