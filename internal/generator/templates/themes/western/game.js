/*
 * Gold Express — the western theme's game.
 *
 * A side-scroller on the roofs of a moving train. The player runs from the
 * caboose toward the front with inertia, jumps the gaps between the cars
 * (the head wind drags anyone in the air backwards), ducks under water
 * tower spouts and tunnel mouths that sweep along the train, shoots the
 * outlaws and grabs the gold sacks. Level 3 ends on the coal tender with
 * Black Bart and the brake lever, with a broken bridge coming up fast.
 *
 * Coordinates are in the train's frame: the cars stand still and x grows
 * toward the locomotive; everything fixed to the ground (towers, tunnels,
 * the trestle, the desert) slides left at the train's speed V.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var ROOF = 352, CAR_BOT = 446, RAIL = 470, HORIZON = 326;
    var PW = 22, PH = 46, DUCK_H = 24;
    var GRAV = 2100, JUMP_V = 780, RUN = 270, DUCK_RUN = 90, ACC = 1500, FRICTION = 1900;
    // In the air the player steers only weakly and the head wind pulls
    // harder than that, so a jump has to start with a full run.
    var AIR_ACC = 160, WIND = 240, GUST_AIR = 520, GUST_GROUND = 150;
    var SHOT_V = 760, SHOT_RANGE = 620, SHOT_COOL = 0.28, FOE_SHOT_V = 330;
    // A ducked player's head is below this line; spouts, tunnel roofs and
    // the chest-high shots of the outlaws all stay above it.
    var DUCK_LINE = ROOF - 28, CHEST = ROOF - 32;
    var C = {
        ink: '#1e1209', wood: '#5a3a1f', woodLt: '#7d5531', woodDk: '#38220f', paper: '#ecd9b0',
        sepia: '#c9a46a', dusk: '#b8642a', sun: '#f6cf73', red: '#a8281f', blood: '#7a1410',
        gold: '#e3b448', cream: '#f4e6c4', dim: '#a0825a', steel: '#2b2320', smoke: '#d8c7a6'
    };
    var ENDING_COLORS = ['#e3b448', '#c9a46a', '#a8281f', '#f4e6c4', '#d9902f'];

    // One row per level: cars between caboose and front, gap range, train
    // speed, outlaws on the roofs, and the seconds between towers, tunnels,
    // riders and gusts (0 = none). `bridge` is level 3's countdown.
    var LEVELS = [
        { cars: 13, gap: [46, 74], v: 200, outlaws: [3, 6, 9], tower: [5.5, 8], tunnel: 0, rider: 0, gust: 0, sacks: 14 },
        { cars: 11, gap: [58, 92], v: 240, outlaws: [2, 5, 8, 10], tower: [7, 10], tunnel: [9, 12], rider: [7, 10], gust: [9, 12], sacks: 16 },
        { cars: 6, gap: [56, 84], v: 260, outlaws: [2, 4, 5], tower: [8, 11], tunnel: 0, rider: 0, gust: [10, 13], sacks: 8, bridge: 120 }
    ];
    var CAR_TYPES = ['box', 'stock', 'coach', 'box', 'tank'];

    // ------------------------------------------------------------------
    // Building the train and the timetable of things beside the track
    // ------------------------------------------------------------------

    function addCar(cars, x, w, type) {
        var c = { x: x, w: w, type: type, i: cars.length };
        cars.push(c);
        return c;
    }

    function buildTrain(cfg, level, rnd) {
        var cars = [], x = 0, k, gap;
        addCar(cars, 0, 250, 'caboose');
        for (k = 1; k <= cfg.cars; k++) {
            gap = cfg.gap[0] + rnd() * (cfg.gap[1] - cfg.gap[0]);
            x = cars[k - 1].x + cars[k - 1].w + gap;
            var last = k === cfg.cars && level < 3;
            addCar(cars, x, last ? 340 : 300 + rnd() * 90, last ? 'mail' : CAR_TYPES[Math.floor(rnd() * CAR_TYPES.length)]);
        }
        if (level === 3) {
            var prev = cars[cars.length - 1];
            var tender = addCar(cars, prev.x + prev.w + 60, 330, 'tender');
            addCar(cars, tender.x + tender.w, 420, 'loco');
        }
        return cars;
    }

    // Sacks lie on the roofs, a few of them high enough to need a jump.
    function placeSacks(cars, cfg, rnd) {
        var sacks = [], n = 0, k;
        for (k = 1; n < cfg.sacks && k < 400; k++) {
            var car = cars[1 + (k % (cars.length - 1))];
            if (car.type === 'tender' || car.type === 'loco') continue;
            var high = rnd() < 0.3;
            sacks.push({ x: car.x + 40 + rnd() * (car.w - 80), y: high ? ROOF - 96 : ROOF - 14, got: false });
            n++;
        }
        return sacks;
    }

    function makeOutlaw(car, rnd) {
        var x = car.x + car.w * (0.45 + rnd() * 0.2);
        return { x: x, home: x, car: car, t: 1 + rnd(), state: 'idle', face: -1, vx: 0, vy: 0, feet: ROOF, spin: 0, walk: rnd() * 6 };
    }

    // The timetable: when towers, tunnels, riders and gusts arrive. Fixed
    // per level from a seed, kept apart so each one reads on its own.
    function schedule(cfg, rnd) {
        var out = [];
        [['tower', cfg.tower, 4], ['tunnel', cfg.tunnel, 9], ['rider', cfg.rider, 6], ['gust', cfg.gust, 11]].forEach(function (e) {
            if (!e[1]) return;
            for (var t = e[2]; t < 400; t += e[1][0] + rnd() * (e[1][1] - e[1][0])) out.push({ t: t, kind: e[0], len: 620 + rnd() * 280 });
        });
        out.sort(function (a, b) { return a.t - b.t; });
        // A tower and a tunnel never come within three seconds of each other.
        for (var k = 1; k < out.length; k++) {
            var prev = out[k - 1], cur = out[k];
            if (cur.t - prev.t < 3 && isPasser(cur) && isPasser(prev)) cur.t = prev.t + 3;
        }
        out.sort(function (a, b) { return a.t - b.t; });
        return out;
    }

    function isPasser(e) { return e.kind === 'tower' || e.kind === 'tunnel'; }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 1301 + 77);
        var cars = buildTrain(cfg, level, rnd), front = cars[cars.length - 1];
        var s = {
            level: level, cfg: cfg, cars: cars, touch: G.isTouch(), V: cfg.v, time: 0, dist: 0,
            sacks: placeSacks(cars, cfg, rnd), gold: 0,
            outlaws: cfg.outlaws.map(function (i) { return makeOutlaw(cars[i], rnd); }),
            sched: schedule(cfg, rnd), si: 0, calm: 0, spawnGap: 0,
            passers: [], riders: [], shots: [], foeShots: [], coal: [], smoke: [], dust: [],
            gust: { state: 'idle', t: 0 }, msg: '', msgT: 0,
            p: { x: 70, feet: ROOF, vx: 0, vy: 0, on: cars[0], duck: false, face: 1, coy: 0, buf: 0, cool: 0, lock: 0, upT: 0, inv: 0, dead: 0, check: 70, run: 0, cut: false },
            box: level < 3 ? { x: front.x + front.w - 70, y: ROOF - 34, w: 44, h: 34 } : null,
            bart: level === 3 ? makeBart(cars[cars.length - 2]) : null,
            lever: level === 3 ? { x: front.x + 64, pulled: false } : null,
            bridge: cfg.bridge || 0, braking: 0, smokeT: 0, clackT: 0, wonT: 0
        };
        s.cam = G.clamp(s.p.x - 330, -80, front.x + front.w - G.W + 120);
        G.cam.x = s.cam;
        return s;
    }

    function makeBart(tender) {
        var x = tender.x + tender.w * 0.62;
        return { x: x, lo: tender.x + 80, hi: tender.x + tender.w - 40, hp: 16, max: 16, t: 2, shootT: 3, cover: 0, coverT: 4, state: 'wait', hurt: 0, dir: -1, vy: 0, feet: ROOF, spin: 0, hat: 0 };
    }

    // ------------------------------------------------------------------
    // Sounds
    // ------------------------------------------------------------------

    function sndShot() {
        G.noise(0.12, { freq: 2600, slide: 400, vol: 0.22 });
        G.tone(150, 0.1, { type: 'square', slide: 60, vol: 0.12 });
    }
    function sndFoeShot() { G.noise(0.14, { freq: 1500, slide: 300, vol: 0.16 }); }
    function sndRicochet() { G.tone(2600, 0.28, { type: 'sine', slide: 900, vol: 0.06 }); }
    function sndJump() { G.tone(260, 0.12, { type: 'triangle', slide: 520, vol: 0.13 }); }
    function sndLand() { G.noise(0.06, { freq: 380, vol: 0.12 }); }
    function sndGold() {
        G.tone(988, 0.07, { type: 'triangle', vol: 0.13 });
        G.tone(1319, 0.18, { type: 'triangle', vol: 0.12, delay: 0.07 });
    }
    function sndBell() {
        G.tone(880, 0.5, { type: 'sine', vol: 0.09 });
        G.tone(1318, 0.4, { type: 'sine', vol: 0.05, delay: 0.02 });
    }
    function sndWhistle() {
        G.tone(466, 0.7, { type: 'sine', vol: 0.08, attack: 0.05 });
        G.tone(587, 0.7, { type: 'sine', vol: 0.07, attack: 0.05 });
    }
    function sndGust() { G.noise(1.6, { filter: 'bandpass', freq: 700, slide: 1600, q: 1.5, vol: 0.14, attack: 0.3 }); }
    function sndFoeDown() {
        G.tone(420, 0.35, { type: 'sawtooth', slide: 110, vol: 0.12 });
        G.noise(0.1, { freq: 900, vol: 0.12 });
    }
    function sndThrow() { G.noise(0.2, { filter: 'bandpass', freq: 500, slide: 1200, vol: 0.1 }); }
    function sndSmash() { G.noise(0.25, { freq: 700, slide: 120, vol: 0.2 }); }
    function sndBartHurt() { G.tone(130, 0.18, { type: 'square', slide: 80, vol: 0.13 }); }
    function sndBrake() {
        G.noise(1.8, { filter: 'bandpass', freq: 3400, slide: 1800, q: 6, vol: 0.18 });
        G.tone(1900, 1.6, { type: 'sawtooth', slide: 1500, vol: 0.04 });
        G.tone(90, 0.2, { type: 'square', vol: 0.15 });
    }
    function sndClack() {
        G.noise(0.05, { freq: 900, vol: 0.05 });
        G.noise(0.05, { freq: 700, vol: 0.05, delay: 0.11 });
    }
    function sndPlunge() { G.noise(1.2, { freq: 300, slide: 40, vol: 0.4 }); }

    function say(s, text, t) { s.msg = text; s.msgT = t || 2; }

    // ------------------------------------------------------------------
    // The timetable at work: towers, tunnels, riders and gusts arrive
    // ------------------------------------------------------------------

    // Things beside the track are spawned well ahead (off screen to the
    // right, with a sign at the edge) and slide back along the train.
    function spawn(s, e) {
        var p = s.p;
        if (e.kind === 'tower') { s.passers.push({ kind: 'tower', x: p.x + 960, w: 46 }); sndBell(); }
        else if (e.kind === 'tunnel') { s.passers.push({ kind: 'tunnel', x: p.x + 1000, w: e.len }); sndWhistle(); }
        else if (e.kind === 'rider') spawnRider(s, e);
        else if (e.kind === 'gust' && s.gust.state === 'idle') { s.gust.state = 'warn'; s.gust.t = s.touch ? 1.3 : 1.0; }
    }

    function updateSchedule(s, dt) {
        s.calm -= dt; s.spawnGap -= dt;
        var e = s.sched[s.si];
        if (!e || s.time < e.t || s.calm > 0 || s.spawnGap > 0 || s.braking) return;
        if (s.bart && s.bart.state === 'down' && e.kind !== 'gust') { s.si++; return; }
        s.si++;
        s.spawnGap = 1.2;
        spawn(s, e);
    }

    function updatePassers(s, dt) {
        for (var i = s.passers.length - 1; i >= 0; i--) {
            var h = s.passers[i];
            h.x -= s.V * dt;
            if (h.x + h.w < s.cam - 400) s.passers.splice(i, 1);
        }
    }

    // Wind gusts: a warning, then a blow that drags hard on anyone in the
    // air and leans on runners too.
    function updateGust(s, dt) {
        var g = s.gust;
        if (g.state === 'idle') return;
        g.t -= dt;
        if (g.t > 0) return;
        if (g.state === 'warn') { g.state = 'blow'; g.t = 1.6; sndGust(); }
        else g.state = 'idle';
    }

    function gustPush(s) { return s.gust.state === 'blow' ? 1 : 0; }

    // ------------------------------------------------------------------
    // The player
    // ------------------------------------------------------------------

    function carAt(s, x0, x1) {
        for (var i = 0; i < s.cars.length; i++) {
            var c = s.cars[i];
            if (x1 > c.x + 2 && x0 < c.x + c.w - 2) return c;
        }
        return null;
    }

    function steer(s, p, dt) {
        var dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        var ground = !!p.on;
        p.duck = ground && G.key.down;
        p.upT = p.duck ? 0 : p.upT + dt;
        var max = p.duck ? DUCK_RUN : RUN;
        // Facing holds for a moment after a shot, so a gunfighter can back
        // off while still firing ahead.
        p.lock -= dt;
        if (dir && p.lock <= 0) p.face = dir;
        if (ground) {
            var rate = (dir ? ACC : FRICTION) * dt;
            p.vx += G.clamp(dir * max - p.vx, -rate, rate);
            p.vx -= gustPush(s) * GUST_GROUND * dt;
            if (dir) p.run += dt * 14 * (p.duck ? 0.5 : 1);
        } else {
            p.vx += dir * AIR_ACC * dt - (WIND + gustPush(s) * GUST_AIR) * dt;
            p.vx = G.clamp(p.vx, -RUN, RUN);
        }
    }

    // A press is remembered for a moment and a roof just left still counts,
    // so jumps at the very edge of a car feel fair.
    function tryJump(s, p, dt) {
        if (G.hit.up) p.buf = 0.14;
        p.buf -= dt;
        p.coy = p.on ? 0.09 : p.coy - dt;
        if (p.buf > 0 && p.coy > 0) {
            p.vy = -JUMP_V; p.on = null; p.coy = 0; p.buf = 0; p.cut = false; p.duck = false;
            sndJump();
        }
        // Letting go early makes a shorter hop.
        if (!p.on && !G.key.up && p.vy < -260 && !p.cut) { p.vy *= 0.55; p.cut = true; }
    }

    // Roofs are one-way from above; the car ends are walls for anyone
    // who fell below roof level, and under the cars is the track.
    function moveBody(s, p, dt) {
        var was = p.feet;
        p.x += p.vx * dt;
        if (p.on && !carAt(s, p.x, p.x + PW)) p.on = null;
        if (!p.on) {
            p.vy = Math.min(p.vy + GRAV * dt, 1100);
            p.feet += p.vy * dt;
            var c = carAt(s, p.x, p.x + PW);
            if (c && was <= ROOF + 0.5 && p.feet >= ROOF) land(s, p, c);
            else if (c && p.feet > ROOF + 2) pushOut(p, c);
        }
        var first = s.cars[0], front = s.cars[s.cars.length - 1];
        if (p.x < first.x) { p.x = first.x; p.vx = Math.max(0, p.vx); }
        if (p.x + PW > front.x + front.w) { p.x = front.x + front.w - PW; p.vx = Math.min(0, p.vx); }
    }

    function land(s, p, c) {
        p.feet = ROOF; p.vy = 0; p.on = c;
        if (c.type !== 'tender' && c.type !== 'loco') p.check = c.x + 24;
        sndLand();
        G.burst(p.x + PW / 2, ROOF, { n: 5, color: C.sepia, speed: 70, life: 0.35, size: 3, gravity: 200 });
    }

    function pushOut(p, c) {
        if (p.x + PW / 2 < c.x + c.w / 2) p.x = c.x - PW - 2.1; else p.x = c.x + c.w + 2.1;
        p.vx = 0;
    }

    function shoot(s, p, dt) {
        p.cool -= dt;
        if (!G.hit.a || p.cool > 0) return;
        if (s.lever && !s.lever.pulled && s.bart.state === 'down' && Math.abs(p.x + PW / 2 - s.lever.x) < 40 && p.on) { pullLever(s); return; }
        p.cool = SHOT_COOL; p.lock = 0.36;
        var y = p.feet - (p.duck ? 15 : 31);
        s.shots.push({ x: p.x + (p.face > 0 ? PW : 0), y: y, vx: p.face * SHOT_V, left: SHOT_RANGE });
        sndShot();
        G.burst(p.x + (p.face > 0 ? PW + 6 : -6), y, { n: 4, color: C.sun, speed: 90, life: 0.15, size: 3 });
    }

    function updatePlayer(s, dt) {
        var p = s.p;
        p.inv -= dt;
        if (p.dead > 0) { tumble(s, p, dt); return; }
        steer(s, p, dt);
        tryJump(s, p, dt);
        moveBody(s, p, dt);
        shoot(s, p, dt);
        if (p.feet > RAIL + 20) hurt(s, 'Fell under the wheels!', true);
    }

    function playerBox(p) {
        var h = p.duck ? DUCK_H : PH;
        return { x: p.x + 3, y: p.feet - h + 2, w: PW - 6, h: h - 2 };
    }

    // A hit knocks the player off the roof; after a short tumble they are
    // back on the last car they stood on, with a moment of grace.
    function hurt(s, why, force) {
        var p = s.p;
        if (p.dead > 0 || (p.inv > 0 && !force) || s.braking) return;
        p.dead = 0.9; p.vy = -380; p.vx = -160; p.on = null;
        say(s, why, 1.6);
        G.shake(6, 0.3);
        G.burst(p.x + PW / 2, p.feet - 20, { n: 14, color: C.red, speed: 160, life: 0.5, size: 4 });
    }

    function tumble(s, p, dt) {
        p.dead -= dt;
        p.vy += GRAV * 0.7 * dt;
        p.x += p.vx * dt; p.feet += p.vy * dt;
        if (p.dead > 0) return;
        if (G.loseLife() <= 0) return;
        respawn(s, p);
    }

    function respawn(s, p) {
        p.dead = 0; p.x = p.check; p.feet = ROOF; p.vx = 0; p.vy = 0; p.inv = 2;
        p.on = carAt(s, p.x, p.x + PW); p.duck = false;
        s.foeShots = []; s.coal = [];
        s.passers = s.passers.filter(function (h) { return h.x > p.x + 900 || h.x + h.w < p.x - 200; });
        s.calm = 2.5;
        s.riders.forEach(function (r) { r.t = Math.max(r.t, 1.6); r.state = 'ride'; });
        s.outlaws.forEach(function (o) { if (o.state === 'aim') { o.state = 'idle'; o.t = 1.4; } });
        if (s.bart && s.bart.state !== 'down') { s.bart.t = Math.max(s.bart.t, 2); s.bart.shootT = Math.max(s.bart.shootT, 3); }
    }

    // ------------------------------------------------------------------
    // Shots, sacks and the strongbox
    // ------------------------------------------------------------------

    function updateShots(s, dt) {
        var i, b;
        for (i = s.shots.length - 1; i >= 0; i--) {
            b = s.shots[i];
            b.x += b.vx * dt; b.left -= Math.abs(b.vx) * dt;
            if (b.left <= 0 || shotHits(s, b)) s.shots.splice(i, 1);
        }
        var box = playerBox(s.p);
        for (i = s.foeShots.length - 1; i >= 0; i--) {
            b = s.foeShots[i];
            b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
            if (s.p.dead <= 0 && G.aabb(box, { x: b.x - 3, y: b.y - 2, w: 6, h: 4 })) { s.foeShots.splice(i, 1); hurt(s, 'Shot off the roof!'); continue; }
            if (b.life <= 0) s.foeShots.splice(i, 1);
        }
    }

    function hitOutlaw(s, o) {
        o.state = 'fall'; o.vy = -320; o.vx = -o.face * 160;
        G.addScore(150); G.popup(o.x, ROOF - 60, '+150', C.gold);
        sndFoeDown();
    }

    function shotHits(s, b) {
        var i, o, r;
        for (i = 0; i < s.outlaws.length; i++) {
            o = s.outlaws[i];
            if (o.state !== 'fall' && Math.abs(b.x - o.x) < 13 && b.y > o.feet - 48 && b.y < o.feet) { hitOutlaw(s, o); return true; }
        }
        for (i = 0; i < s.riders.length; i++) {
            r = s.riders[i];
            if (r.state !== 'fall' && Math.abs(b.x - r.x) < 16 && b.y > ROOF - 62 && b.y < ROOF - 4) { hitRider(s, r); return true; }
        }
        for (i = 0; i < s.coal.length; i++) {
            if (G.dist(b.x, b.y, s.coal[i].x, s.coal[i].y) < 16) { smashCoal(s, i); G.addScore(20); return true; }
        }
        return s.bart ? hitBart(s, b) : false;
    }

    function updateSacks(s) {
        var box = playerBox(s.p);
        s.sacks.forEach(function (k) {
            if (k.got || !G.aabb(box, { x: k.x - 10, y: k.y - 12, w: 20, h: 24 })) return;
            k.got = true; s.gold++;
            G.addScore(100); G.popup(k.x, k.y - 16, '+100', C.gold);
            G.burst(k.x, k.y, { n: 10, color: C.gold, speed: 110, life: 0.5, size: 3 });
            sndGold();
        });
        if (s.box && !s.wonT && G.aabb(box, s.box)) {
            s.wonT = 1;
            G.burst(s.box.x + 22, s.box.y, { n: 30, color: C.gold, speed: 220, life: 0.9, size: 4, gravity: 300 });
            sndGold();
            G.win(500 + s.gold * 50);
        }
    }

    // ------------------------------------------------------------------
    // Outlaws on the roofs and riders alongside
    // ------------------------------------------------------------------

    function foeFire(s, x, y, dir) {
        s.foeShots.push({ x: x + dir * 16, y: y, vx: dir * FOE_SHOT_V, vy: 0, life: 2.6 });
        sndFoeShot();
        G.burst(x + dir * 18, y, { n: 4, color: C.sun, speed: 80, life: 0.15, size: 3 });
    }

    // Idle, then a visible draw (the gun comes up), then a shot at chest
    // height: duck under it, jump it or shoot first.
    function updateOutlaw(s, o, dt) {
        var p = s.p, dx = p.x + PW / 2 - o.x;
        if (o.state === 'fall') { o.vy += GRAV * 0.6 * dt; o.x += o.vx * dt; o.feet += o.vy * dt; o.spin += dt * 8; return; }
        o.face = dx < 0 ? -1 : 1;
        o.walk += dt;
        if (o.state === 'idle') o.x = o.home + Math.sin(o.walk * 0.9) * 30;
        var near = Math.abs(dx) < 540 && p.dead <= 0;
        o.t -= dt;
        if (o.t > 0) return;
        if (o.state === 'idle' && near) { o.state = 'aim'; o.t = s.touch ? 0.85 : 0.7; }
        else if (o.state === 'aim') { foeFire(s, o.x, CHEST, o.face); o.state = 'idle'; o.t = 1.5 + Math.random() * 0.6; }
        else o.t = 0.3;
    }

    function updateOutlaws(s, dt) {
        for (var i = s.outlaws.length - 1; i >= 0; i--) {
            var o = s.outlaws[i];
            updateOutlaw(s, o, dt);
            if (o.state !== 'fall' && Math.abs(s.p.x + PW / 2 - o.x) < 18 && s.p.feet > ROOF - 40 && s.p.dead <= 0) hurt(s, 'Punched off the train!');
            if (o.feet > G.H + 80) s.outlaws.splice(i, 1);
        }
    }

    // A rider gallops up from behind or ahead along the far side and keeps
    // pace a few car-lengths off, firing across the roofs.
    function spawnRider(s, e) {
        if (s.riders.length >= 2) return;
        var side = s.riders.length && s.riders[0].off < 0 ? 1 : (e.len > 760 ? 1 : -1);
        var off = side * (230 + (e.len % 100));
        s.riders.push({ x: s.p.x + side * 700, off: off, vx: 0, state: 'ride', t: 2.2, hp: 1, gallop: 0, face: -side, fall: 0, fy: 0 });
        G.tone(330, 0.5, { type: 'triangle', slide: 495, vol: 0.06 });
    }

    function hitRider(s, r) {
        r.state = 'fall'; r.fall = 0; r.fy = 0;
        G.addScore(200); G.popup(r.x, ROOF - 70, '+200', C.gold);
        sndFoeDown();
    }

    function updateRider(s, r, dt) {
        r.gallop += dt * 9;
        if (r.state === 'fall') { r.fall += dt; r.fy += 220 * dt; r.x -= s.V * 0.5 * dt; return; }
        var want = s.p.x + r.off, prev = r.x;
        r.x += G.clamp(want - r.x, -1, 1) * Math.min(Math.abs(want - r.x) * 2.2, 380) * dt;
        r.vx = (r.x - prev) / dt;
        r.face = s.p.x + PW / 2 < r.x ? -1 : 1;
        r.t -= dt;
        if (r.t > 0 || s.p.dead > 0) return;
        if (r.state === 'ride' && Math.abs(want - r.x) < 60) { r.state = 'aim'; r.t = s.touch ? 0.85 : 0.7; }
        else if (r.state === 'aim') { foeFire(s, r.x, CHEST, r.face); r.state = 'ride'; r.t = 2.4 + Math.random() * 0.8; }
        else r.t = 0.3;
    }

    function updateRiders(s, dt) {
        for (var i = s.riders.length - 1; i >= 0; i--) {
            updateRider(s, s.riders[i], dt);
            if (s.riders[i].fall > 2.2) s.riders.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------
    // Level 3: Black Bart on the tender, coal lumps and the brake lever
    // ------------------------------------------------------------------

    function hitBart(s, b) {
        var B = s.bart;
        if (B.state === 'down' || B.state === 'wait' || Math.abs(b.x - B.x) > 20 || b.y < B.feet - 62 || b.y > B.feet) return false;
        if (B.cover > 0) {
            sndRicochet();
            G.burst(b.x, b.y, { n: 5, color: C.sun, speed: 150, life: 0.25, size: 2 });
            return true;
        }
        B.hp--; B.hurt = 0.18;
        G.addScore(60);
        sndBartHurt();
        G.burst(b.x, b.y, { n: 6, color: C.red, speed: 120, life: 0.3, size: 3 });
        if (B.hp === B.max / 2) { say(s, 'Bart draws his iron! Duck his shots!', 2); B.hat = 1; }
        if (B.hp <= 0) {
            B.state = 'down'; B.vy = -420; B.spin = 0;
            while (s.coal.length) smashCoal(s, 0);
            G.addScore(1000); G.popup(B.x, B.feet - 80, '+1000', C.gold);
            G.shake(8, 0.4);
            say(s, 'Bart is down! Pull the brake lever!', 3);
            sndFoeDown();
        }
        return true;
    }

    // A lump is thrown in an arc that comes down where the player stands
    // (led a little by their running), so keep moving.
    function throwCoal(s, B) {
        var p = s.p, T = 0.95, g = 900;
        var tx = p.x + PW / 2 + p.vx * 0.35, ty = ROOF - 10, x0 = B.x - 14, y0 = B.feet - 58;
        var n = B.hp <= B.max / 2 ? 2 : 1;
        for (var k = 0; k < n; k++) {
            var aim = tx - k * 70;
            s.coal.push({ x: x0, y: y0, vx: (aim - x0) / T, vy: (ty - y0 - 0.5 * g * T * T) / T, g: g, rot: 0 });
        }
        sndThrow();
    }

    function updateBart(s, dt) {
        var B = s.bart, p = s.p;
        if (!B) return;
        B.hurt -= dt;
        if (B.state === 'down') { B.vy += GRAV * 0.5 * dt; B.feet += B.vy * dt; B.x += 90 * dt; B.spin += dt * 6; return; }
        if (B.state === 'wait') {
            if (p.on && p.on.i >= s.cars.length - 3) { B.state = 'fight'; say(s, 'BLACK BART!', 2); G.tone(147, 0.6, { type: 'sawtooth', slide: 110, vol: 0.12 }); }
            return;
        }
        if (p.dead <= 0 && Math.abs(p.x + PW / 2 - B.x) < 24 && p.feet > B.feet - 60) hurt(s, 'Black Bart threw you off!');
        if (takeCover(B, dt)) return;
        B.x += B.dir * 60 * dt;
        if (B.x < B.lo || B.x > B.hi) { B.dir = -B.dir; B.x = G.clamp(B.x, B.lo, B.hi); }
        B.t -= dt; B.shootT -= dt;
        if (B.t <= 0 && p.dead <= 0) { throwCoal(s, B); B.t = B.hp <= B.max / 2 ? 1.25 : 1.55; }
        if (B.hp <= B.max / 2 && B.shootT <= 0 && p.dead <= 0) {
            if (B.shootT > -0.7) B.aim = true;
            else { foeFire(s, B.x, CHEST, -1); B.aim = false; B.shootT = 2.6; }
        }
    }

    // Now and then Bart drops behind the coal: shots only ricochet off it
    // until he comes up again.
    function takeCover(B, dt) {
        B.coverT -= dt;
        if (B.cover > 0) { B.cover -= dt; B.aim = false; return true; }
        if (B.coverT > 0) return false;
        B.cover = 1.2; B.coverT = 4.2 + (B.hp % 3) * 0.6;
        return true;
    }

    function smashCoal(s, i) {
        var c = s.coal[i];
        G.burst(c.x, c.y, { n: 8, color: C.ink, speed: 120, life: 0.4, size: 4, gravity: 500 });
        sndSmash();
        s.coal.splice(i, 1);
    }

    function updateCoal(s, dt) {
        var box = playerBox(s.p);
        for (var i = s.coal.length - 1; i >= 0; i--) {
            var c = s.coal[i];
            c.vy += c.g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += dt * 9;
            if (s.p.dead <= 0 && G.circRect(c.x, c.y, 9, box.x, box.y, box.w, box.h)) { smashCoal(s, i); hurt(s, 'Brained by a lump of coal!'); continue; }
            if (c.y >= ROOF - 8 && c.vy > 0 && carAt(s, c.x - 4, c.x + 4)) smashCoal(s, i);
            else if (c.y > G.H + 40) s.coal.splice(i, 1);
        }
    }

    function pullLever(s) {
        s.lever.pulled = true; s.braking = 0.001;
        say(s, 'BRAKES!', 2);
        sndBrake();
        G.shake(5, 1);
    }

    // After the lever the train screeches to a stop short of the bridge.
    function updateBrake(s, dt) {
        if (!s.braking) return false;
        s.braking += dt;
        s.V = Math.max(0, s.V - 200 * dt);
        if (Math.random() < 0.5) G.burst(s.cars[1 + Math.floor(Math.random() * (s.cars.length - 1))].x + 30, RAIL - 6, { n: 2, color: C.sun, speed: 140, life: 0.3, size: 2, angle: -2.6, spread: 0.6 });
        if (s.braking > 1.4 && !s.wonT) { s.wonT = 1; G.win(1000 + Math.round(s.bridge * 20) + s.gold * 50); }
        return true;
    }

    function updateBridge(s, dt) {
        if (!s.bridge || s.braking) return;
        s.bridge -= dt;
        if (s.bridge > 0) return;
        s.bridge = 0.001;
        sndPlunge();
        G.flash(C.blood, 0.5);
        G.die();
    }

    // ------------------------------------------------------------------
    // Hazards beside the track, smoke, the rhythm of the rails
    // ------------------------------------------------------------------

    function checkPassers(s) {
        var p = s.p;
        // Standing up under a spout for a blink is forgiven; a real stand
        // or a jump into it is not.
        if (p.dead > 0 || (p.on && p.upT < 0.15)) return;
        var box = playerBox(p);
        for (var i = 0; i < s.passers.length; i++) {
            var h = s.passers[i], top = h.kind === 'tower' ? ROOF - 90 : 0;
            if (G.aabb(box, { x: h.x, y: top, w: h.w, h: DUCK_LINE - top })) {
                hurt(s, h.kind === 'tower' ? 'Swept off by a water spout!' : 'Smashed on the tunnel mouth!');
                return;
            }
        }
    }

    function updateAmbient(s, dt) {
        s.smokeT -= dt; s.clackT -= dt; s.msgT -= dt;
        if (s.smokeT <= 0) {
            s.smokeT = s.braking ? 0.3 : 0.12;
            var front = s.cars[s.cars.length - 1];
            var sx = s.level === 3 ? front.x + front.w - 70 : Math.min(front.x + front.w, s.cam + G.W + 60);
            s.smoke.push({ x: sx, y: ROOF - 70, r: 8, life: 0, max: 2.4 + Math.random() });
        }
        for (var i = s.smoke.length - 1; i >= 0; i--) {
            var k = s.smoke[i];
            k.life += dt; k.x -= (s.V * 0.9 + 30) * dt; k.y -= 34 * dt; k.r += 16 * dt;
            if (k.life > k.max) s.smoke.splice(i, 1);
        }
        if (s.clackT <= 0 && s.V > 20) { s.clackT = 70 / s.V * 2.2; sndClack(); }
    }

    function updateCamera(s, dt) {
        var front = s.cars[s.cars.length - 1], p = s.p;
        var want = G.clamp(p.x - (s.touch ? 300 : 330), -80, front.x + front.w - G.W + 120);
        s.cam += (want - s.cam) * Math.min(1, dt * 6);
        G.cam.x = s.cam;
    }

    function update(s, dt) {
        s.time += dt;
        s.dist += s.V * dt;
        updateAmbient(s, dt);
        if (updateBrake(s, dt)) { updateBart(s, dt); updateCamera(s, dt); return; }
        updateSchedule(s, dt);
        updatePassers(s, dt);
        updateGust(s, dt);
        updatePlayer(s, dt);
        updateShots(s, dt);
        updateOutlaws(s, dt);
        updateRiders(s, dt);
        updateBart(s, dt);
        updateCoal(s, dt);
        updateSacks(s);
        checkPassers(s);
        updateBridge(s, dt);
        updateCamera(s, dt);
    }

    // ------------------------------------------------------------------
    // Drawing: the desert and the scenery
    // ------------------------------------------------------------------

    // Flat-topped mesas and buttes, one tile of each parallax layer.
    var FAR = [[0, 0], [70, 0], [96, -62], [250, -62], [276, -20], [380, -20], [398, -44], [470, -44], [492, 0], [640, 0],
        [672, -96], [736, -100], [790, -96], [822, 0], [1000, 0], [1030, -34], [1110, -34], [1140, 0], [1300, 0]];
    var MID = [[0, 0], [160, 0], [186, -30], [300, -30], [330, 0], [620, 0], [650, -44], [700, -44], [730, 0], [900, 0]];

    function skyColors(s) {
        var red = s.level === 3 && s.bridge ? G.clamp(1 - s.bridge / 60, 0, 1) : 0;
        return { top: red > 0.5 ? '#2a0a06' : '#2b1a10', mid: s.level === 2 ? '#8a4524' : (red > 0.3 ? '#8e2a18' : '#9a5426'), low: red > 0.6 ? '#d0502a' : '#e8a650' };
    }

    function drawSky(s, ctx) {
        var c = skyColors(s), g = ctx.createLinearGradient(0, G.HUD, 0, HORIZON);
        g.addColorStop(0, c.top); g.addColorStop(0.55, c.mid); g.addColorStop(1, c.low);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, G.W, HORIZON);
        var sx = 700, sy = HORIZON - 30;
        ctx.fillStyle = 'rgba(246,207,115,0.18)';
        ctx.beginPath(); ctx.arc(sx, sy, 150, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.sun;
        ctx.beginPath(); ctx.arc(sx, sy, 92, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(184,100,42,0.55)';
        for (var k = 0; k < 4; k++) ctx.fillRect(sx - 100, sy - 30 + k * 16, 200, 3 + k);
    }

    function drawRange(ctx, pts, period, off, base, color) {
        var x0 = -(((off % period) + period) % period);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x0, base);
        for (var t = x0; t < G.W; t += period) {
            for (var i = 0; i < pts.length; i++) ctx.lineTo(t + pts[i][0], base + pts[i][1]);
        }
        ctx.lineTo(G.W + 10, base + 30); ctx.lineTo(x0, base + 30);
        ctx.fill();
    }

    function drawSaguaros(ctx, off) {
        ctx.fillStyle = '#3b2312';
        ctx.beginPath();
        var x0 = -(((off % 520) + 520) % 520);
        for (var t = x0; t < G.W + 40; t += 520) {
            [[60, 46], [300, 34], [430, 52]].forEach(function (c) {
                var x = t + c[0], h = c[1], y = HORIZON + 14;
                ctx.rect(x, y - h, 6, h);
                ctx.rect(x - 10, y - h * 0.6, 4, h * 0.35); ctx.rect(x - 10, y - h * 0.3, 10, 4);
                ctx.rect(x + 12, y - h * 0.75, 4, h * 0.4); ctx.rect(x + 6, y - h * 0.38, 10, 4);
            });
        }
        ctx.fill();
    }

    function drawGround(s, ctx) {
        var g = ctx.createLinearGradient(0, HORIZON, 0, G.H);
        g.addColorStop(0, s.level === 2 ? '#5a2e18' : '#9a6a3a'); g.addColorStop(1, s.level === 2 ? '#1c0d06' : '#4a2c16');
        ctx.fillStyle = g;
        ctx.fillRect(0, HORIZON, G.W, G.H - HORIZON);
        if (s.level === 2) { drawTrestle(s, ctx); return; }
        // Ties rush past under the rails: the clearest sign of speed.
        var off = (s.dist + s.cam) % 36;
        ctx.fillStyle = C.woodDk;
        ctx.beginPath();
        for (var x = -off; x < G.W; x += 36) ctx.rect(x, RAIL, 20, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(30,18,9,0.35)';
        ctx.beginPath();
        var r = (s.dist * 1.5 + s.cam * 1.5) % 230;
        for (x = -r; x < G.W; x += 230) { ctx.rect(x, 505, 30, 4); ctx.rect(x + 120, 524, 18, 3); }
        ctx.fill();
    }

    // Level 2 crosses a canyon on a timber trestle.
    function drawTrestle(s, ctx) {
        var off = (s.dist + s.cam) % 80;
        ctx.strokeStyle = C.woodLt; ctx.lineWidth = 4;
        ctx.beginPath();
        for (var x = -off - 80; x < G.W + 80; x += 80) {
            ctx.moveTo(x, RAIL + 6); ctx.lineTo(x, G.H);
            ctx.moveTo(x, RAIL + 8); ctx.lineTo(x + 80, G.H - 4);
            ctx.moveTo(x + 80, RAIL + 8); ctx.lineTo(x, G.H - 4);
        }
        ctx.moveTo(0, RAIL + 34); ctx.lineTo(G.W, RAIL + 34);
        ctx.stroke();
        ctx.fillStyle = C.woodDk;
        ctx.fillRect(0, RAIL, G.W, 9);
    }

    function drawTelegraph(s, ctx) {
        var off = ((s.dist * 1.3 + s.cam * 1.3) % 640 + 640) % 640;
        ctx.fillStyle = 'rgba(25,14,7,0.82)';
        ctx.strokeStyle = 'rgba(25,14,7,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var x = -off; x < G.W + 640; x += 640) {
            ctx.rect(x, 200, 7, G.H - 200);
            ctx.rect(x - 16, 210, 40, 5);
        }
        ctx.fill();
        ctx.beginPath();
        for (x = -off; x < G.W; x += 640) { ctx.moveTo(x - 14, 212); ctx.quadraticCurveTo(x + 320, 250, x + 626, 212); }
        ctx.stroke();
    }

    function drawBackdrop(s, ctx) {
        drawSky(s, ctx);
        var far = s.dist * 0.05 + s.cam * 0.05, mid = s.dist * 0.18 + s.cam * 0.18;
        drawRange(ctx, FAR, 1300, far, HORIZON, s.level === 2 ? '#7a3820' : '#6e4024');
        drawGround(s, ctx);
        drawRange(ctx, MID, 900, mid, HORIZON + 16, s.level === 2 ? '#4a1f10' : '#57331b');
        if (s.level !== 2) drawSaguaros(ctx, mid * 1.2);
        if (s.level === 3) drawBrokenBridge(s, ctx);
    }

    // The broken bridge comes into view as the countdown nears its end.
    function drawBrokenBridge(s, ctx) {
        if (!s.bridge || s.bridge > 14) return;
        var x = 560 + s.bridge * 30;
        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(x, HORIZON + 2, G.W - x, 20);
        ctx.strokeStyle = C.woodDk; ctx.lineWidth = 3;
        ctx.beginPath();
        for (var k = 0; k < 4; k++) { ctx.moveTo(x - 60 + k * 16, HORIZON + 2); ctx.lineTo(x - 50 + k * 16 + (k % 2) * 10, HORIZON - 8 - k * 2); }
        ctx.stroke();
        G.text('BROKEN BRIDGE', x + 10, HORIZON - 16, { size: 20, color: C.red, bold: true });
    }

    // ------------------------------------------------------------------
    // Drawing: the train
    // ------------------------------------------------------------------

    function drawWheels(ctx, c, s) {
        var spin = (s.dist / 14) % (Math.PI * 2);
        ctx.fillStyle = C.steel;
        ctx.beginPath();
        [24, 62, c.w - 62, c.w - 24].forEach(function (dx) { ctx.moveTo(c.x + dx + 13, RAIL - 13); ctx.arc(c.x + dx, RAIL - 13, 13, 0, Math.PI * 2); });
        ctx.fill();
        ctx.strokeStyle = C.dim; ctx.lineWidth = 2;
        ctx.beginPath();
        [24, 62, c.w - 62, c.w - 24].forEach(function (dx) {
            ctx.moveTo(c.x + dx + Math.cos(spin) * 11, RAIL - 13 + Math.sin(spin) * 11);
            ctx.lineTo(c.x + dx - Math.cos(spin) * 11, RAIL - 13 - Math.sin(spin) * 11);
        });
        ctx.stroke();
    }

    function drawCarBody(ctx, c) {
        var body = { box: C.wood, stock: '#6b4224', coach: '#4a2a1a', tank: '#2f2724', mail: '#5e1d14', caboose: C.red, tender: C.steel, loco: '#211a17' }[c.type];
        ctx.fillStyle = body;
        ctx.fillRect(c.x, ROOF, c.w, CAR_BOT - ROOF);
        ctx.fillStyle = C.woodDk;
        ctx.fillRect(c.x - 4, ROOF - 4, c.w + 8, 6);
        ctx.fillRect(c.x, CAR_BOT - 6, c.w, 10);
        ctx.strokeStyle = 'rgba(20,10,4,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath();
        if (c.type === 'box' || c.type === 'mail' || c.type === 'caboose') {
            for (var x = c.x + 26; x < c.x + c.w - 10; x += 26) { ctx.moveTo(x, ROOF + 4); ctx.lineTo(x, CAR_BOT - 8); }
        } else if (c.type === 'stock') {
            for (var y = ROOF + 14; y < CAR_BOT - 10; y += 14) { ctx.moveTo(c.x + 6, y); ctx.lineTo(c.x + c.w - 6, y); }
        }
        ctx.stroke();
    }

    function drawCarDetail(ctx, c) {
        var mx = c.x + c.w / 2;
        if (c.type === 'box') { ctx.fillStyle = C.woodDk; ctx.fillRect(mx - 30, ROOF + 14, 60, 72); }
        if (c.type === 'coach' || c.type === 'caboose') {
            ctx.fillStyle = '#e8b45a';
            ctx.beginPath();
            for (var x = c.x + 22; x < c.x + c.w - 40; x += 46) ctx.rect(x, ROOF + 20, 26, 28);
            ctx.fill();
        }
        if (c.type === 'tank') {
            ctx.fillStyle = '#433833';
            ctx.beginPath(); ctx.ellipse(mx, ROOF + 46, c.w / 2 - 6, 40, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (c.type === 'mail') G.text('U.S. MAIL', mx, ROOF + 56, { size: 22, color: C.gold, align: 'center', bold: true });
        if (c.type === 'tender') drawTender(ctx, c);
        if (c.type === 'loco') drawLoco(ctx, c);
    }

    function drawTender(ctx, c) {
        ctx.fillStyle = '#120c09';
        ctx.beginPath();
        ctx.moveTo(c.x + 6, ROOF + 2);
        for (var k = 0; k <= 10; k++) ctx.lineTo(c.x + 6 + k * (c.w - 12) / 10, ROOF - 5 - (k % 3) * 3);
        ctx.lineTo(c.x + c.w - 6, ROOF + 2);
        ctx.fill();
        G.text('No. 9', c.x + c.w / 2, ROOF + 60, { size: 22, color: C.gold, align: 'center' });
    }

    function drawLoco(ctx, c) {
        var x = c.x;
        ctx.fillStyle = '#211a17';
        ctx.fillRect(x + 120, ROOF + 8, c.w - 150, 66);             // boiler
        ctx.fillRect(x + c.w - 86, ROOF - 62, 30, 66);               // smokestack
        ctx.fillRect(x + c.w - 100, ROOF - 70, 58, 12);
        ctx.fillStyle = C.gold;
        ctx.fillRect(x + 190, ROOF - 18, 26, 22);                    // bell dome
        ctx.fillRect(x + c.w - 40, ROOF + 26, 18, 14);               // headlamp
        ctx.fillStyle = '#e8b45a';
        ctx.fillRect(x + 22, ROOF + 18, 30, 30); ctx.fillRect(x + 66, ROOF + 18, 30, 30);
        ctx.fillStyle = C.red;
        ctx.beginPath(); ctx.moveTo(x + c.w, CAR_BOT); ctx.lineTo(x + c.w + 40, RAIL); ctx.lineTo(x + c.w, RAIL); ctx.fill();
    }

    function drawTrain(s, ctx) {
        var x0 = s.cam - 60, x1 = s.cam + G.W + 60;
        ctx.fillStyle = C.steel;
        for (var i = 0; i < s.cars.length; i++) {
            var c = s.cars[i], next = s.cars[i + 1];
            if (c.x > x1 || c.x + c.w < x0) continue;
            if (next) { ctx.fillStyle = C.steel; ctx.fillRect(c.x + c.w - 2, CAR_BOT - 14, next.x - c.x - c.w + 4, 6); }
            drawCarBody(ctx, c);
            drawCarDetail(ctx, c);
            drawWheels(ctx, c, s);
        }
    }

    // ------------------------------------------------------------------
    // Drawing: people
    // ------------------------------------------------------------------

    // A cowboy figure from rectangles: hat, head, torso, legs mid-stride.
    function drawCowboy(ctx, x, feet, o) {
        var h = o.duck ? DUCK_H : PH, top = feet - h, stride = Math.sin(o.run || 0) * (o.duck ? 3 : 6);
        ctx.fillStyle = o.body;
        ctx.fillRect(x - 8, top + 12, 16, h - 26);                         // torso
        ctx.fillRect(x - 6 + stride * 0.5, feet - 14, 5, 14);              // legs
        ctx.fillRect(x + 1 - stride * 0.5, feet - 14, 5, 14);
        ctx.fillStyle = o.skin;
        ctx.fillRect(x - 5, top + 3, 10, 9);                               // head
        ctx.fillStyle = o.hat;
        ctx.fillRect(x - 11, top + 2, 22, 3);                              // brim
        ctx.fillRect(x - 6, top - 4, 12, 7);                               // crown
        if (o.scarf) { ctx.fillStyle = o.scarf; ctx.fillRect(x - 5, top + 9, 10, 4); }
        if (o.gun) {
            ctx.fillStyle = C.steel;
            var gy = top + (o.aim ? 15 : 22);
            ctx.fillRect(o.face > 0 ? x + 6 : x - 18, gy, 12, 4);
        }
    }

    function drawPlayer(s, ctx) {
        var p = s.p;
        if (p.inv > 0 && Math.floor(p.inv * 10) % 2 && p.dead <= 0) return;
        ctx.save();
        if (p.dead > 0) { ctx.translate(p.x + PW / 2, p.feet - 20); ctx.rotate((0.9 - p.dead) * 8); ctx.translate(-p.x - PW / 2, -p.feet + 20); }
        drawCowboy(ctx, p.x + PW / 2, p.feet, { duck: p.duck, run: p.run, body: '#d9c08a', skin: '#e3b58a', hat: C.cream, scarf: C.red, gun: true, aim: true, face: p.face });
        ctx.restore();
        if (p.cool > SHOT_COOL - 0.06 && p.dead <= 0) {
            ctx.fillStyle = C.sun;
            ctx.beginPath(); ctx.arc(p.x + (p.face > 0 ? PW + 9 : -9), p.feet - (p.duck ? 13 : 29), 6, 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawOutlaws(s, ctx) {
        s.outlaws.forEach(function (o) {
            if (o.x < s.cam - 40 || o.x > s.cam + G.W + 40) return;
            ctx.save();
            if (o.state === 'fall') { ctx.translate(o.x, o.feet - 20); ctx.rotate(o.spin); ctx.translate(-o.x, -o.feet + 20); }
            drawCowboy(ctx, o.x, o.feet, { run: o.walk * 5, body: '#2a1a12', skin: '#c08860', hat: '#120a06', scarf: '#5e1d14', gun: true, aim: o.state === 'aim', face: o.face });
            ctx.restore();
            if (o.state === 'aim') G.text('!', o.x, o.feet - 58, { size: 24, color: C.red, align: 'center', bold: true });
        });
    }

    // Riders gallop on the far side: horse legs show in the gaps, the
    // rider's torso rises over the roof line.
    function drawRiders(s, ctx) {
        s.riders.forEach(function (r) {
            var x = r.x, bob = Math.sin(r.gallop) * 3, y = ROOF + 26 + bob + (r.state === 'fall' ? r.fy : 0);
            ctx.fillStyle = '#3a2112';
            ctx.fillRect(x - 34, y - 8, 68, 24);                                       // horse body
            ctx.fillRect(x + r.face * 30 - 6, y - 26, 12, 24);                         // neck
            ctx.fillRect(x + r.face * 30 - (r.face > 0 ? 0 : 12), y - 30, 18, 9);      // head
            var leg = Math.sin(r.gallop) * 10;
            ctx.fillRect(x - 28 + leg, y + 14, 6, 26); ctx.fillRect(x + 22 - leg, y + 14, 6, 26);
            if (r.state === 'fall') return;
            drawCowboy(ctx, x, y - 4, { run: 0, body: '#20140d', skin: '#b07a52', hat: '#0e0805', scarf: '#7a1410', gun: true, aim: r.state === 'aim', face: r.face });
            if (r.state === 'aim') G.text('!', x, y - 62, { size: 24, color: C.red, align: 'center', bold: true });
        });
    }

    function drawBart(s, ctx) {
        var B = s.bart;
        if (!B || B.feet > G.H + 60) return;
        ctx.save();
        ctx.translate(B.x, B.feet + (B.cover > 0 ? 40 : 0));
        if (B.state === 'down') ctx.rotate(B.spin);
        ctx.scale(1.35, 1.35);
        drawCowboy(ctx, 0, 0, { run: B.x / 10, body: B.hurt > 0 ? C.red : '#100a08', skin: '#a8724e', hat: B.hat ? '#100a08' : '#000', scarf: '#000', gun: B.hp <= B.max / 2, aim: B.aim, face: -1 });
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(-7, -14, 14, 4);                                                // gun belt
        ctx.restore();
        if (B.cover > 0) {
            ctx.fillStyle = '#120c09';
            ctx.beginPath(); ctx.moveTo(B.x - 40, ROOF); ctx.lineTo(B.x - 22, ROOF - 30); ctx.lineTo(B.x + 4, ROOF - 36); ctx.lineTo(B.x + 30, ROOF); ctx.fill();
        }
        if (B.state === 'down' || B.state === 'wait') return;
        var bx = G.clamp(B.x - 60, s.cam + 20, s.cam + G.W - 140);
        ctx.fillStyle = 'rgba(30,18,9,0.7)'; ctx.fillRect(bx, ROOF - 118, 120, 10);
        ctx.fillStyle = C.red; ctx.fillRect(bx + 1, ROOF - 117, 118 * B.hp / B.max, 8);
        G.text('BLACK BART', bx + 60, ROOF - 124, { size: 20, color: C.cream, align: 'center', bold: true });
        if (B.aim) G.text('!', B.x, B.feet - 86, { size: 26, color: C.red, align: 'center', bold: true });
    }

    // ------------------------------------------------------------------
    // Drawing: loot, shots, passers, smoke and signs
    // ------------------------------------------------------------------

    function drawLoot(s, ctx, t) {
        ctx.fillStyle = '#b08840';
        ctx.beginPath();
        s.sacks.forEach(function (k) {
            if (k.got || k.x < s.cam - 30 || k.x > s.cam + G.W + 30) return;
            var y = k.y + Math.sin(t * 3 + k.x) * 2;
            ctx.moveTo(k.x + 11, y + 2); ctx.arc(k.x, y + 2, 11, 0, Math.PI * 2);
            ctx.rect(k.x - 5, y - 13, 10, 6);
        });
        ctx.fill();
        s.sacks.forEach(function (k) {
            if (k.got || k.x < s.cam - 30 || k.x > s.cam + G.W + 30) return;
            G.text('$', k.x, k.y + 8, { size: 16, color: C.ink, align: 'center', bold: true });
        });
        if (s.box) drawStrongbox(s, ctx, t);
        if (s.lever) drawLever(s, ctx, t);
    }

    function drawStrongbox(s, ctx, t) {
        var b = s.box;
        ctx.fillStyle = C.woodDk; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = C.gold;
        ctx.fillRect(b.x, b.y + 6, b.w, 4); ctx.fillRect(b.x, b.y + b.h - 10, b.w, 4); ctx.fillRect(b.x + 18, b.y + 12, 8, 8);
        G.text('GOLD', b.x + b.w / 2, b.y - 14 + Math.sin(t * 4) * 3, { size: 20, color: C.gold, align: 'center', bold: true });
    }

    function drawLever(s, ctx, t) {
        var L = s.lever, ang = L.pulled ? 0.7 : -0.5;
        ctx.save();
        ctx.translate(L.x, ROOF);
        ctx.rotate(ang);
        ctx.fillStyle = C.steel; ctx.fillRect(-3, -54, 6, 54);
        ctx.fillStyle = C.red; ctx.fillRect(-7, -62, 14, 12);
        ctx.restore();
        if (s.bart.state === 'down' && !L.pulled) G.text('BRAKE ▼', L.x, ROOF - 76 + Math.sin(t * 6) * 3, { size: 22, color: C.sun, align: 'center', bold: true });
    }

    function drawShots(s, ctx) {
        ctx.fillStyle = C.sun;
        ctx.beginPath();
        s.shots.forEach(function (b) { ctx.rect(b.x - 6, b.y - 1.5, 12, 3); });
        ctx.fill();
        ctx.fillStyle = '#ff6a3a';
        ctx.beginPath();
        s.foeShots.forEach(function (b) { ctx.rect(b.x - 6, b.y - 2, 12, 4); });
        ctx.fill();
        ctx.fillStyle = '#0c0705';
        ctx.beginPath();
        s.coal.forEach(function (c) { ctx.moveTo(c.x + 9, c.y); ctx.arc(c.x, c.y, 9, c.rot, c.rot + Math.PI * 1.7); });
        ctx.fill();
    }

    function drawTowerBack(ctx, h) {
        var x = h.x + h.w / 2;
        ctx.fillStyle = '#3a2414';
        ctx.fillRect(x - 70, 120, 150, 120);                                  // tank
        ctx.fillRect(x - 60, 240, 8, RAIL - 240); ctx.fillRect(x + 62, 240, 8, RAIL - 240);
        ctx.fillStyle = '#2a180c';
        ctx.beginPath(); ctx.moveTo(x - 80, 120); ctx.lineTo(x + 5, 86); ctx.lineTo(x + 90, 120); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (var k = 0; k < 5; k++) ctx.fillRect(x - 70, 132 + k * 22, 150, 3);
    }

    function drawPassers(s, ctx, front) {
        s.passers.forEach(function (h) {
            if (h.x > s.cam + G.W + 40 || h.x + h.w < s.cam - 200) return;
            if (h.kind === 'tower') {
                if (!front) { drawTowerBack(ctx, h); return; }
                ctx.fillStyle = '#2b1a10';
                ctx.fillRect(h.x + h.w / 2 - 4, 236, 8, ROOF - 90 - 236);           // pipe from the tank
                ctx.fillRect(h.x, ROOF - 90, h.w, DUCK_LINE - (ROOF - 90));        // the spout itself
                ctx.fillStyle = 'rgba(160,190,200,0.5)';
                ctx.fillRect(h.x + 8, DUCK_LINE, 4, 9 + Math.sin(s.time * 31) * 3);
            } else if (front) drawTunnel(s, ctx, h);
        });
    }

    // A tunnel through a rock spur: jagged rock above the duck line, a
    // timber lintel at each mouth and darkness over the train inside.
    function drawTunnel(s, ctx, h) {
        ctx.fillStyle = 'rgba(10,5,2,0.55)';
        ctx.fillRect(h.x, DUCK_LINE, h.w, RAIL - DUCK_LINE + 10);
        ctx.fillStyle = '#5a2e16';
        ctx.beginPath();
        ctx.moveTo(h.x - 26, DUCK_LINE);
        for (var k = 0; k <= 8; k++) ctx.lineTo(h.x - 26 + k * (h.w + 52) / 8, 64 + hash(h.w + k) * 70 + (k === 0 || k === 8 ? 60 : 0));
        ctx.lineTo(h.x + h.w + 26, DUCK_LINE);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,12,4,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (k = 1; k < 6; k++) { ctx.moveTo(h.x + k * h.w / 6, 150 + hash(k + h.w) * 60); ctx.lineTo(h.x + k * h.w / 6 + 30, 210 + hash(k * 3 + h.w) * 70); }
        ctx.stroke();
        ctx.fillStyle = C.woodDk;
        ctx.fillRect(h.x - 8, DUCK_LINE - 12, 46, 12);
        ctx.fillRect(h.x + h.w - 38, DUCK_LINE - 12, 46, 12);
    }

    // Cheap repeatable noise for decoration that needs no stored state.
    function hash(n) {
        var x = Math.sin(n * 127.1 + 3.7) * 43758.5453;
        return x - Math.floor(x);
    }

    function drawSmoke(s, ctx) {
        ctx.fillStyle = C.smoke;
        s.smoke.forEach(function (k) {
            if (k.x < s.cam - 80 || k.x > s.cam + G.W + 80) return;
            ctx.globalAlpha = 0.4 * (1 - k.life / k.max);
            ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    // Signs at the right edge for what is still off screen ahead.
    function drawWarnings(s, ctx, t) {
        var blink = Math.floor(t * 6) % 2;
        s.passers.forEach(function (h) {
            if (h.x - s.cam < G.W - 10) return;
            G.text(h.kind === 'tower' ? '▼ DUCK · SPOUT' : '▼ DUCK · TUNNEL', G.W - 16, 200, { size: 22, color: blink ? C.sun : C.red, align: 'right', bold: true });
        });
        if (s.gust.state === 'warn') G.text('◀◀ WIND GUST', G.W / 2, 120, { size: 26, color: blink ? C.sun : C.cream, align: 'center', bold: true });
        if (s.gust.state === 'blow') drawGustLines(ctx, t);
    }

    function drawGustLines(ctx, t) {
        ctx.strokeStyle = 'rgba(236,217,176,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var k = 0; k < 14; k++) {
            var x = G.W - ((t * 900 + k * 173) % (G.W + 200)), y = 60 + (k * 97) % 420;
            ctx.moveTo(x, y); ctx.lineTo(x + 70, y);
        }
        ctx.stroke();
    }

    function drawHudLine(s, ctx, t) {
        if (s.bridge) {
            var frac = G.clamp(s.bridge / s.cfg.bridge, 0, 1), w = 300, x = G.W / 2 - w / 2;
            ctx.fillStyle = 'rgba(30,18,9,0.75)'; ctx.fillRect(x - 4, 36, w + 8, 16);
            ctx.fillStyle = frac < 0.25 && Math.floor(t * 4) % 2 ? C.sun : C.red;
            ctx.fillRect(x, 40, w * frac, 8);
            G.text('BROKEN BRIDGE IN ' + (s.bridge / s.cfg.bridge * 3).toFixed(1) + ' MI', G.W / 2, 72, { size: 20, color: C.cream, align: 'center', bold: true });
        }
        if (s.msgT > 0) G.text(s.msg, G.W / 2, 108, { size: 24, color: C.cream, align: 'center', bold: true, max: 900 });
    }

    // Sepia vignette over everything: the old photograph look.
    function drawVignette(ctx) {
        var g = ctx.createRadialGradient(G.W / 2, G.H / 2, 220, G.W / 2, G.H / 2, 620);
        g.addColorStop(0, 'rgba(40,22,8,0)'); g.addColorStop(1, 'rgba(40,22,8,0.55)');
        ctx.fillStyle = g;
        ctx.fillRect(0, G.HUD, G.W, G.H - G.HUD);
    }

    function draw(s, ctx) {
        var t = s.time;
        drawBackdrop(s, ctx);
        ctx.save();
        ctx.translate(-Math.round(s.cam), 0);
        drawPassers(s, ctx, false);
        drawRiders(s, ctx);
        drawSmoke(s, ctx);
        drawTrain(s, ctx);
        drawLoot(s, ctx, t);
        drawOutlaws(s, ctx);
        drawBart(s, ctx);
        drawPlayer(s, ctx);
        drawShots(s, ctx);
        drawPassers(s, ctx, true);
        ctx.restore();
        drawTelegraph(s, ctx);
        drawWarnings(s, ctx, t);
        drawVignette(ctx);
        drawHudLine(s, ctx, t);
    }

    function hud(s) {
        if (s.level === 3) return 'GOLD ' + s.gold + (s.bart.state === 'down' ? ' · PULL THE BRAKE' : ' · BART ' + s.bart.hp);
        var car = s.p.on ? s.p.on.i + 1 : 0;
        return 'GOLD ' + s.gold + ' · CAR ' + (car || '-') + '/' + s.cars.length;
    }

    // ------------------------------------------------------------------
    // The ending: a rider heads into the setting sun
    // ------------------------------------------------------------------

    function drawHorseman(ctx, x, y, k, gallop) {
        var leg = Math.sin(gallop) * 8 * k;
        ctx.fillStyle = '#140a04';
        ctx.fillRect(x - 30 * k, y - 22 * k, 60 * k, 20 * k);
        ctx.fillRect(x + 22 * k, y - 40 * k, 10 * k, 22 * k);
        ctx.fillRect(x + 22 * k, y - 44 * k, 20 * k, 8 * k);
        ctx.fillRect(x - 26 * k + leg, y - 4 * k, 5 * k, 22 * k); ctx.fillRect(x + 18 * k - leg, y - 4 * k, 5 * k, 22 * k);
        ctx.fillRect(x - 8 * k, y - 50 * k, 12 * k, 28 * k);
        ctx.fillRect(x - 12 * k, y - 56 * k, 20 * k, 4 * k);
        ctx.fillRect(x - 6 * k, y - 63 * k, 9 * k, 8 * k);
        ctx.fillRect(x - 36 * k, y - 16 * k, 8 * k, 3 * k);
    }

    function drawSunset(e, ctx, G) {
        var t = e.t, horizon = 352;
        var g = ctx.createLinearGradient(0, 160, 0, horizon);
        g.addColorStop(0, 'rgba(60,20,8,0.0)'); g.addColorStop(1, 'rgba(200,90,30,0.75)');
        ctx.fillStyle = g; ctx.fillRect(0, 160, G.W, horizon - 160);
        var sy = horizon + 10 + t * 4;
        ctx.fillStyle = 'rgba(246,207,115,0.25)';
        ctx.beginPath(); ctx.arc(G.W / 2, sy, 190, Math.PI, 0); ctx.fill();
        ctx.fillStyle = C.sun;
        ctx.beginPath(); ctx.arc(G.W / 2, sy, 140, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(184,100,42,0.6)';
        for (var k = 0; k < 4; k++) ctx.fillRect(G.W / 2 - 150, sy - 30 - k * 24, 300, 4 - k * 0.6);
        ctx.fillStyle = '#1c0e06';
        ctx.fillRect(0, horizon, G.W, 40);
        drawRange(ctx, FAR, 1300, 200, horizon, '#2a1408');
        var p = Math.min(1, t / 9), x = 120 + p * (G.W / 2 - 120), k2 = 1.3 - p * 0.9;
        drawHorseman(ctx, x, horizon + 6 - p * 10, k2, t * 10);
        ctx.fillStyle = 'rgba(201,164,106,0.35)';
        for (var d = 0; d < 6; d++) ctx.fillRect(x - 40 * k2 - d * 14 - (t * 40 % 14), horizon + 2 - d * 2, 8, 4);
    }

    G.register('western', {
        title: 'GOLD EXPRESS',
        blurb: 'Run the roofs of the express, leap the gaps, take the gold before the bridge.',
        controls: [
            '← → run · ↑ / W jump (hold for height) · ↓ duck',
            'SPACE / SHOOT fires · the head wind drags you back mid-air',
            'Duck under spouts and tunnels · grab gold · reach the front'
        ],
        levelNames: ['Freight Line', 'Canyon Bridge', 'The Locomotive'],
        colors: { bg: '#1e1209', fg: C.cream, accent: C.gold, dim: C.dim },
        lives: 4,
        music: {
            bpm: 138, root: 45, scale: 'harmonic', prog: [0, 0, 3, 3, 5, 5, 4, 4],
            bass: 'x..xx..xx..xo..x',
            lead: ['7-----a-7-----4-', '5-4-3-2-4-------', '7-----a-7-----b-', 'a-9-8-7-8-------',
                '4.4.4.7.6.5.4.3.', '5---4---3---2---', '4.5.7.9.a-9-7-5-', '4-----------....'],
            arp: '0.2.1.3.',
            drums: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        touch: { a: 'SHOOT', hide: ['b'] },
        ending: {
            title: 'END OF THE LINE',
            text: 'The express stopped short of the bridge. The gold is yours, partner.',
            colors: ENDING_COLORS,
            draw: drawSunset
        }
    });
})();
