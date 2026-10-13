/*
 * Deep Channel — the ocean theme's game.
 *
 * A submarine is carried through a trench that scrolls right to left. The
 * boat is slightly heavy and has inertia, so it has to be flown: ballast up
 * and down, trim forward and back. Oxygen drains all the time and is topped
 * up by lingering in bubble columns; the cave and everything living in it
 * cost hull. Torpedoes clear the way ahead, depth charges deal with whatever
 * sits below. Reach the end of the trench — on level 10, kill the kraken.
 *
 * Everything lives in world coordinates; s.cam is the left edge of the view.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var CS = 16;                               // width of one cave heightmap column
    var MID = 286, CEIL_MIN = 50, FLOOR_MAX = 524;
    var SUB_MIN = 50, SUB_MAX = 600;           // screen range the sub may trim across
    var SUB_R = 10, SINK = 70;                 // hull radius; the boat is a little heavy
    var GRIND = 1.2;                           // a scrape this soon after the last one is grinding
    var COL_W = 110;                           // reach of a bubble column
    var ARM_SEGS = 10;
    var CURTAIN_STEP = 29;                     // spacing of the jellyfish in a curtain
    var TAU = Math.PI * 2;
    var C = {
        navy: '#03045e', deep: '#023e8a', teal: '#00b4d8', aqua: '#48cae4', foam: '#caf0f8',
        rock: '#012a5e', rockDark: '#01143a', coral: '#ff6b6b', amber: '#ffd166', jelly: '#e39bff'
    };

    // One entry per level. `mix` is what a slot of the trench may hold (a
    // feature listed twice is twice as likely); currents and dark are numbers
    // of zones; swarm adds jellyfish to each field; crates: N puts a repair
    // crate in every Nth slot on top of its feature, because the tight late
    // caves cost hull even when flown well. Speed and gap change in small
    // steps: the late levels add hazards, so the cave itself stays flyable
    // (level 8 is a little wider again, the vents need the room).
    var LEVELS = [
        { len: 6400, speed: 105, gap: 300, slot: 560, mix: ['jelly', 'crate', 'rest', 'jelly'] },
        { len: 7400, speed: 110, gap: 270, slot: 500, swarm: 2, mix: ['curtain', 'curtain', 'jelly', 'jelly', 'crate', 'rest'] },
        { len: 8000, speed: 114, gap: 250, slot: 480, mix: ['mine', 'mine', 'mine', 'jelly', 'crate', 'rest'] },
        { len: 8600, speed: 118, gap: 238, slot: 470, mix: ['angler', 'angler', 'angler', 'jelly', 'mine', 'crate', 'rest'] },
        { len: 9200, speed: 122, gap: 228, slot: 460, currents: 6, mix: ['jelly', 'mine', 'angler', 'crate', 'rest', 'mine'] },
        { len: 9600, speed: 126, gap: 220, slot: 450, currents: 1, mix: ['esub', 'esub', 'mine', 'jelly', 'angler', 'crate', 'rest'] },
        { len: 10000, speed: 130, gap: 214, slot: 440, dark: 3, mix: ['angler', 'angler', 'jelly', 'jelly', 'mine', 'esub', 'crate'] },
        { len: 10400, speed: 133, gap: 218, slot: 430, crates: 4, dark: 1, currents: 2, mix: ['vent', 'vent', 'vent', 'mine', 'angler', 'esub', 'jelly', 'crate'] },
        { len: 10800, speed: 136, gap: 210, slot: 420, crates: 3, dark: 2, currents: 2, mix: ['stal', 'stal', 'stal', 'vent', 'mine', 'angler', 'jelly', 'esub', 'crate'] },
        { len: 9600, speed: 138, gap: 212, slot: 420, crates: 3, dark: 2, currents: 2, boss: true, mix: ['stal', 'vent', 'mine', 'angler', 'jelly', 'esub', 'crate', 'mine'] }
    ];
    // Force of the three kinds of current: up-welling, down-draught, head-on.
    var FLOWS = [{ x: 0, y: -300 }, { x: 0, y: 300 }, { x: -330, y: 0 }];

    // ------------------------------------------------------------------
    // Sounds: everything is low and muffled, as heard through a hull
    // ------------------------------------------------------------------

    var SND = {
        ping: function () {
            G.tone(1320, 0.5, { type: 'sine', vol: 0.07 });
            G.tone(1320, 0.4, { type: 'sine', vol: 0.03, delay: 0.28 });
        },
        engine: function () { G.noise(0.2, { freq: 180, vol: 0.07 }); },
        torpedo: function () {
            G.noise(0.25, { freq: 700, slide: 150, vol: 0.14 });
            G.tone(160, 0.2, { type: 'sine', slide: 70, vol: 0.15 });
        },
        drop: function () { G.tone(240, 0.18, { type: 'sine', slide: 90, vol: 0.14 }); },
        blast: function () {
            G.noise(0.6, { freq: 420, slide: 40, vol: 0.4 });
            G.tone(70, 0.5, { type: 'sine', slide: 28, vol: 0.35 });
        },
        pop: function () {
            G.noise(0.18, { freq: 900, slide: 200, vol: 0.2 });
            G.tone(300, 0.12, { type: 'sine', slide: 120, vol: 0.12 });
        },
        zap: function () { G.tone(900, 0.18, { type: 'sawtooth', slide: 120, vol: 0.12 }); },
        clang: function () {
            G.noise(0.25, { filter: 'bandpass', freq: 300, q: 4, vol: 0.3 });
            G.tone(110, 0.2, { type: 'triangle', vol: 0.2 });
        },
        growl: function () { G.tone(90, 0.45, { type: 'sawtooth', slide: 190, vol: 0.14 }); },
        hiss: function () { G.noise(0.9, { filter: 'highpass', freq: 2500, vol: 0.07 }); },
        crack: function () {
            G.tone(1800, 0.05, { type: 'triangle', vol: 0.12 });
            G.noise(0.12, { filter: 'highpass', freq: 3000, vol: 0.1 });
        },
        gulp: function (o2) { G.tone(420 + o2 * 6, 0.07, { type: 'sine', slide: 700 + o2 * 6, vol: 0.09 }); },
        whoosh: function () { G.noise(0.7, { filter: 'bandpass', freq: 400, slide: 1200, vol: 0.15 }); },
        fizz: function () { G.noise(0.1, { freq: 1200, slide: 300, vol: 0.1 }); },
        enemyShot: function () { G.tone(520, 0.2, { type: 'triangle', slide: 200, vol: 0.1 }); },
        roar: function () {
            G.tone(62, 1.2, { type: 'sawtooth', slide: 34, vol: 0.3 });
            G.noise(1.0, { freq: 300, slide: 80, vol: 0.25 });
        }
    };

    // ------------------------------------------------------------------
    // Building a level
    // ------------------------------------------------------------------

    function sample(arr, x) {
        var f = G.clamp(x / CS, 0, arr.length - 1.001), i = Math.floor(f);
        return G.lerp(arr[i], arr[i + 1], f - i);
    }
    function topAt(s, x) { return sample(s.top, x); }
    function botAt(s, x) { return sample(s.bot, x); }

    // The channel is a centre line of two summed sines with a gap around it.
    // The narrower the gap, the more room the centre line has to wander, so
    // tight levels also wind harder. A wide cave winds by at least 0.55 of
    // its gap, more than fits between CEIL_MIN and FLOOR_MAX: the clamps cut
    // the bends flat there, and no straight line leads through an early
    // level, which a boat merely held level used to survive. Both ends open
    // out into calm water.
    function buildCave(s, rnd) {
        var cfg = s.cfg, n = Math.ceil((cfg.len + G.W) / CS) + 4;
        var p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
        for (var i = 0; i < n; i++) {
            var x = i * CS;
            var open = Math.max(G.clamp(1 - x / 500, 0, 1), G.clamp((x - (cfg.len - 400)) / 400, 0, 1));
            var gap = G.lerp(cfg.gap * (1 + 0.18 * Math.sin(x / 410 + p3)), 440, open);
            var amp = Math.min(150, Math.max(gap * 0.55, (FLOOR_MAX - CEIL_MIN - gap) / 2)) * (1 - open);
            var mid = MID + amp * (0.62 * Math.sin(x / 300 + p1) + 0.38 * Math.sin(x / 130 + p2));
            // The roughness is clamped too, so CEIL_MIN / FLOOR_MAX are hard limits.
            s.top.push(Math.max(CEIL_MIN, mid - gap / 2 + (rnd() - 0.5) * 14));
            s.bot.push(Math.min(FLOOR_MAX, mid + gap / 2 + (rnd() - 0.5) * 14));
        }
    }

    function ent(kind, x, y, extra) {
        var e = { kind: kind, x: x, y: y, hp: KINDS[kind].hp, t: 0 };
        for (var k in extra) e[k] = extra[k];
        return e;
    }

    // What one slot of trench (x .. x+w) is filled with.
    var FEATURES = {
        rest: function () {},
        jelly: function (s, x, w, rnd, out) {
            var n = 3 + Math.floor(rnd() * 3) + (s.cfg.swarm || 0);
            for (var i = 0; i < n; i++) {
                var jx = x + rnd() * w * 0.8, y = G.lerp(topAt(s, jx) + 34, botAt(s, jx) - 34, rnd());
                out.push(ent('jelly', jx, y, { y0: y, ph: rnd() * TAU, amp: 14 + rnd() * 26, drift: 12 }));
            }
        },
        // A wall of jellyfish from floor to ceiling, pulsing as one and
        // drifting toward the boat: there is no way round, a hole has to be
        // torpedoed into it. `link` ties them together (see zapJelly).
        curtain: function (s, x, w, rnd, out) {
            var cx = x + w * (0.3 + rnd() * 0.4), ph = rnd() * TAU;
            for (var y = topAt(s, cx) + 22; y < botAt(s, cx) - 16; y += CURTAIN_STEP) {
                out.push(ent('jelly', cx, y, { y0: y, ph: ph, amp: 7, drift: 34, link: cx }));
            }
        },
        // Two mines, one hanging and one floating, make a slalom.
        mine: function (s, x, w, rnd, out) {
            var flip = rnd() < 0.5 ? 1 : 0;
            for (var i = 0; i < 2; i++) {
                var mx = x + w * (0.2 + 0.45 * i) + rnd() * 40, gap = botAt(s, mx) - topAt(s, mx);
                out.push(ent('mine', mx, MID, { ax: mx, up: (i + flip) % 2 === 0, len: gap * (0.28 + rnd() * 0.22), ph: rnd() * TAU }));
            }
        },
        angler: function (s, x, w, rnd, out) {
            var ax = x + w * 0.6, y = G.lerp(topAt(s, ax) + 50, botAt(s, ax) - 50, rnd());
            out.push(ent('angler', ax, y, { hx: ax, hy: y, state: 'lurk', timer: 0, vx: 0, vy: 0 }));
        },
        esub: function (s, x, w, rnd, out) {
            out.push(ent('esub', x, MID, { sx: G.W + 60, fire: 1.4, life: 13 }));
        },
        vent: function (s, x, w, rnd, out) {
            for (var i = 0; i < 2; i++) {
                var vx = x + w * (0.2 + 0.45 * i);
                out.push(ent('vent', vx, botAt(s, vx), { ph: rnd() * 3.2, h: 0, on: false, warn: false }));
            }
        },
        stal: function (s, x, w, rnd, out) {
            // Spaced so that each one can be dodged on its own.
            for (var i = 0; i < 3; i++) {
                var sx = x + 40 + i * 120 + rnd() * 30;
                out.push(ent('stal', sx, topAt(s, sx) + 18, { state: 'hang', timer: 0, vy: 0 }));
            }
        },
        crate: function (s, x, w, rnd, out) {
            var cx = x + w * (0.3 + rnd() * 0.4);
            out.push(ent('crate', cx, botAt(s, cx) - 11));
        }
    };

    // Fills the trench slot by slot. The first and last stretch stay empty:
    // room to find the controls, and room for the exit (or the kraken).
    function populate(s, rnd) {
        var cfg = s.cfg, out = [], i = 0;
        for (var x = 900; x < cfg.len - 500; x += cfg.slot) {
            FEATURES[cfg.mix[Math.floor(rnd() * cfg.mix.length)]](s, x, cfg.slot, rnd, out);
            if (cfg.crates && ++i % cfg.crates === 0) FEATURES.crate(s, x, cfg.slot, rnd, out);
        }
        return out.sort(function (a, b) { return a.x - b.x; });
    }

    // Columns get further apart on deeper levels, so later on just passing
    // through one is not enough: the boat has to trim back and linger.
    function buildColumns(s, level) {
        var cols = [], step = 1100 + level * 60;
        for (var x = 700; x < s.cfg.len - 200; x += step) cols.push({ x: x });
        // Air for the boss fight stands inside the arms' reach, so it is a
        // dash (best while the arms recoil), never a place to camp.
        if (s.cfg.boss) cols.push({ x: s.cfg.len + 505, hint: true });
        return cols;
    }

    function buildZones(s, rnd, n, width) {
        var zones = [], span = (s.cfg.len - 2300) / (n || 1);
        for (var i = 0; i < (n || 0); i++) {
            var x0 = 1300 + span * i + rnd() * Math.max(0, span - width);
            zones.push({ x0: x0, x1: x0 + width, flow: FLOWS[i % FLOWS.length] });
        }
        return zones;
    }

    function newKraken(s) {
        return {
            x: s.cfg.len + G.W - 120, y: MID, hp: 26, max: 26, t: 0, ink: 2, awake: false, hurt: 0, raged: false,
            arms: [{ off: -70, ph: 0, stun: 0, reach: 0 }, { off: 70, ph: 2.1, stun: 0, reach: 0 }, { off: 0, ph: 4.2, stun: 0, reach: 0 }]
        };
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 7919 + 13);
        var s = {
            cfg: cfg, phone: G.isTouch(), t: 0, cam: 0, scroll: cfg.speed, top: [], bot: [], drain: 3.2 + level * 0.1,
            sub: { x: 220, y: MID, vx: 0, vy: 0 }, hull: 100, o2: 100, inv: 0, dark: 0, scraped: -9, chain: 0,
            ents: [], next: 0, torps: [], charges: [], shots: [],
            damage: 0, damageText: '', reload: 0, chargeReload: 0, ping: 1.5, ring: 9, engine: 0, alarm: 0, gulp: 0, flow: null, boss: null
        };
        buildCave(s, rnd);
        s.sub.y = (topAt(s, s.sub.x) + botAt(s, s.sub.x)) / 2;     // start mid-channel, wherever that is
        s.pending = populate(s, rnd);
        s.cols = buildColumns(s, level);
        s.currents = buildZones(s, rnd, cfg.currents, 520);
        s.darks = buildZones(s, rnd, cfg.dark, 1300);
        if (cfg.boss) s.boss = newKraken(s);
        return s;
    }

    // ------------------------------------------------------------------
    // The submarine
    // ------------------------------------------------------------------

    // The hull is long, so it is tested as two circles side by side.
    function subHits(s, x, y, r) {
        var b = s.sub;
        return G.circ(b.x - 14, b.y, SUB_R + 1, x, y, r) || G.circ(b.x + 14, b.y, SUB_R + 1, x, y, r);
    }

    function currentAt(s, x) {
        for (var i = 0; i < s.currents.length; i++) {
            if (x > s.currents[i].x0 && x < s.currents[i].x1) return s.currents[i];
        }
        return null;
    }

    // Thrust against water drag gives the boat its weight: it takes a moment
    // to get going and a moment to stop. Left alone it slowly sinks.
    function moveSub(s, dt) {
        var b = s.sub, k = G.key, zone = currentAt(s, b.x), f = zone ? zone.flow : { x: 0, y: 0 };
        if (zone && zone !== s.flow) SND.whoosh();
        s.flow = zone;
        b.vx += (((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 560 + f.x - b.vx * 2.6) * dt;
        b.vy += (((k.down ? 1 : 0) - (k.up ? 1 : 0)) * 640 + SINK + f.y - b.vy * 2.4) * dt;
        b.x += (s.scroll + b.vx) * dt;
        b.y += b.vy * dt;
        if (b.x < s.cam + SUB_MIN) { b.x = s.cam + SUB_MIN; b.vx = Math.max(0, b.vx); }
        if (b.x > s.cam + SUB_MAX) { b.x = s.cam + SUB_MAX; b.vx = Math.min(0, b.vx); }
        s.engine -= dt;
        if ((k.left || k.right || k.up || k.down) && s.engine <= 0) {
            s.engine = 0.22;
            SND.engine();
            G.burst(b.x - 30, b.y, { n: 2, color: C.foam, speed: 60, life: 0.5, size: 2, angle: Math.PI, spread: 1 });
        }
    }

    // The cave has no overhangs, so rock is always straight above or below:
    // the boat is pushed back into the channel and bounced away.
    function hitCave(s) {
        var b = s.sub;
        for (var i = -1; i <= 1; i++) {
            var x = b.x + i * 20, top = topAt(s, x) + SUB_R, bot = botAt(s, x) - SUB_R;
            if (b.y < top) { b.y = top; b.vy = Math.abs(b.vy) * 0.3 + 35; scrape(s); }
            else if (b.y > bot) { b.y = bot; b.vy = -Math.abs(b.vy) * 0.3 - 35; scrape(s); }
        }
    }

    // Rock gives a shorter grace than other hits, and scrapes that follow
    // each other within GRIND seconds cost two and then three times as much:
    // a glancing touch is cheap (7), but a boat left to grind along the
    // floor must not survive the trench.
    function scrape(s) {
        var chain = s.t - s.scraped < GRIND ? Math.min(3, s.chain + 1) : 1;
        if (!hurt(s, 7 * chain, 0.5)) return;
        s.scraped = s.t; s.chain = chain;
        G.burst(s.sub.x, s.sub.y, { n: 8, color: C.aqua, speed: 120, life: 0.4 });
    }

    // A short spell of invulnerability after each hit keeps one mistake from
    // costing the whole hull (`grace` seconds, 0.7 unless given). Returns
    // whether the hit counted.
    function hurt(s, dmg, grace) {
        if (s.inv > 0 || dmg <= 0) return false;
        s.hull -= dmg;
        s.damage = 0.9; s.damageText = '-' + dmg + ' HULL';
        s.inv = grace || 0.7;
        G.popup(s.sub.x, s.sub.y - 22, '-' + dmg, C.coral);
        G.shake(5, 0.2);
        SND.clang();
        if (s.hull <= 0) sink(s, 'HULL BREACH');
        return true;
    }

    // Costs a life but the run goes on: a fresh boat, mid-channel, with a
    // few seconds of grace.
    function sink(s, why) {
        var b = s.sub;
        G.burst(b.x, b.y, { n: 40, color: C.foam, speed: 260, life: 1 });
        G.popup(b.x, b.y - 40, why, C.coral);
        SND.blast();
        if (G.loseLife() <= 0) return;
        s.hull = 100; s.o2 = 100; s.inv = 2.6;
        b.vx = 0; b.vy = 0;
        b.y = (topAt(s, b.x) + botAt(s, b.x)) / 2;
    }

    function fire(s, dt) {
        var b = s.sub;
        s.reload -= dt; s.chargeReload -= dt;
        if (G.key.a && s.reload <= 0) {
            s.reload = 0.32;
            s.torps.push({ x: b.x + 28, y: b.y + 3, vx: s.scroll + 480 });
            SND.torpedo();
        }
        // A charge is lobbed slightly ahead so it lands on what is coming,
        // not on what has already gone by.
        if (G.key.b && s.chargeReload <= 0) {
            s.chargeReload = 0.8;
            s.charges.push({ x: b.x, y: b.y + 12, vx: s.scroll + 70 + b.vx * 0.5, vy: 40 });
            SND.drop();
        }
    }

    function breathe(s, dt) {
        var b = s.sub, inCol = s.cols.some(function (c) { return Math.abs(b.x - c.x) < COL_W / 2; });
        s.o2 = G.clamp(s.o2 + (inCol ? 36 : -s.drain) * dt, 0, 100);
        s.gulp -= dt; s.alarm -= dt;
        if (inCol && s.o2 < 100 && s.gulp <= 0) {
            s.gulp = 0.12;
            SND.gulp(s.o2);
            G.burst(b.x, b.y - 8, { n: 2, color: C.foam, speed: 70, life: 0.5, angle: -Math.PI / 2, spread: 1.2 });
        }
        if (s.o2 < 25 && !inCol && s.alarm <= 0) { s.alarm = 0.7; G.sfx('alarm'); }
        if (s.o2 <= 0) sink(s, 'OUT OF AIR');
    }

    // ------------------------------------------------------------------
    // Creatures and hazards
    // ------------------------------------------------------------------

    function updateJelly(s, e, dt) {
        e.x -= e.drift * dt;
        e.y = G.clamp(e.y0 + Math.sin(e.t * 1.6 + e.ph) * e.amp, topAt(s, e.x) + 18, botAt(s, e.x) - 18);
    }

    // The mine sways on its chain around an anchor on the floor or ceiling.
    function updateMine(s, e) {
        var a = Math.sin(e.t * 0.9 + e.ph) * 0.4;
        e.ay = e.up ? topAt(s, e.ax) : botAt(s, e.ax);
        e.x = e.ax + Math.sin(a) * e.len;
        e.y = e.ay + (e.up ? 1 : -1) * Math.cos(a) * e.len;
    }

    // Lurk, flash the lure as a warning, lunge in a straight line at where
    // the boat was, then swim home. The straight line is what makes it fair.
    function updateAngler(s, e, dt) {
        var b = s.sub, dx = e.x - b.x;
        e.timer -= dt;
        if (e.state === 'lurk') {
            e.y = e.hy + Math.sin(e.t * 1.2) * 8;
            if (dx > 40 && dx < 330 && Math.abs(e.y - b.y) < 170) { e.state = 'warn'; e.timer = 0.5; SND.growl(); }
        } else if (e.state === 'warn' && e.timer <= 0) {
            var tx = b.x + s.scroll * 0.3, d = G.dist(e.x, e.y, tx, b.y) || 1;
            e.vx = (tx - e.x) / d * 520; e.vy = (b.y - e.y) / d * 520;
            e.state = 'lunge'; e.timer = 0.6;
        } else if (e.state === 'lunge') {
            e.x += e.vx * dt;
            e.y = G.clamp(e.y + e.vy * dt, topAt(s, e.x) + 18, botAt(s, e.x) - 18);
            if (e.timer <= 0) { e.state = 'back'; e.timer = 2.2; }
        } else if (e.state === 'back') {
            e.x += (e.hx - e.x) * dt * 1.5; e.y += (e.hy - e.y) * dt * 1.5;
            if (e.timer <= 0) e.state = 'lurk';
        }
    }

    // An enemy boat holds station at the right of the screen, follows the
    // player's depth with a lag and fires along it, slowly enough that each
    // torpedo can be shot down or stepped out of. It gives up after a while
    // so they never pile up.
    function updateEsub(s, e, dt) {
        e.life -= dt;
        e.sx += G.clamp((e.life > 0 ? 830 : G.W + 140) - e.sx, -140 * dt, 140 * dt);
        e.x = s.cam + e.sx;
        e.y += G.clamp(s.sub.y - e.y, -70 * dt, 70 * dt);
        e.y = G.clamp(e.y, topAt(s, e.x) + 26, botAt(s, e.x) - 26);
        if (e.life <= 0 && e.sx > G.W + 100) { e.dead = true; return; }
        e.fire -= dt;
        if (e.fire <= 0 && e.sx < 900 && e.life > 0) {
            e.fire = 2.4;
            s.shots.push({ x: e.x - 26, y: e.y, vx: s.scroll - 280, vy: 0, r: 6, dmg: 20, torp: true });
            SND.enemyShot();
        }
    }

    // A vent erupts on a fixed rhythm. The plume stops short of the ceiling,
    // so there is always a way over as well as a moment to slip through.
    function updateVent(s, e) {
        var ph = (e.t + e.ph) % 3.2, was = e.on, b = s.sub;
        e.on = ph < 1.3;
        e.warn = ph > 2.5;
        e.h = (botAt(s, e.x) - topAt(s, e.x)) * 0.62;
        if (e.on && !was) SND.hiss();
        if (e.on && Math.abs(b.x - e.x) < 40 && b.y > e.y - e.h) hurt(s, 15);
    }

    // A stalactite shakes loose as the boat comes near and then falls. The
    // trigger distance is what the boat covers during the shake and the drop
    // to mid-channel, so a boat that just carries on is hit: trim back (or
    // shoot it) to let it fall ahead.
    function updateStal(s, e, dt) {
        var dx = e.x - s.sub.x;
        if (e.state === 'hang' && dx < 60 + s.scroll * 0.55 && dx > -20) { e.state = 'shake'; e.timer = 0.5; SND.crack(); }
        else if (e.state === 'shake') { e.timer -= dt; if (e.timer <= 0) e.state = 'fall'; }
        else if (e.state === 'fall') {
            e.vy += 620 * dt; e.y += e.vy * dt;
            if (e.y < botAt(s, e.x) - 8) return;
            e.dead = true;
            G.burst(e.x, e.y, { n: 8, color: C.aqua, speed: 110, life: 0.4 });
            SND.fizz();
        }
    }

    // One torpedo removes a single jellyfish, and the hole that leaves in a
    // curtain is only 8 px taller than the boat while the torpedo may have
    // struck up to 19 px off the jellyfish's centre: the boat following its
    // own torpedo would still be stung. So a shot curtain jellyfish shorts
    // out its two neighbours as well. Ramming gets no such help.
    function zapJelly(s, e, rammed) {
        SND.zap();
        if (!e.link || rammed) return;
        s.ents.forEach(function (o) {
            if (o.dead || o.link !== e.link || Math.abs(o.y0 - e.y0) > CURTAIN_STEP + 1) return;
            o.link = 0;             // the neighbours do not pass it on
            kill(s, o);
        });
    }

    function repair(s, e) {
        s.hull = Math.min(100, s.hull + 20);
        G.popup(e.x, e.y - 34, 'HULL +20', C.amber);
        G.sfx('power');
    }

    // r: hit radius (0 = cannot be torpedoed or touched). touch: 'burst' dies
    // on contact, 'bite' survives it. dmg: hull lost on contact.
    var KINDS = {
        jelly: { r: 14, hp: 1, dmg: 15, score: 40, touch: 'burst', color: C.jelly, update: updateJelly, draw: drawJelly, die: zapJelly },
        mine: { r: 13, hp: 1, dmg: 0, score: 60, touch: 'burst', color: C.coral, update: updateMine, draw: drawMine, die: function (s, e, rammed) { blast(s, e.x, e.y, 80, rammed); } },
        angler: { r: 18, hp: 2, dmg: 25, score: 150, touch: 'bite', color: C.amber, update: updateAngler, draw: drawAngler, die: SND.pop },
        esub: { r: 20, hp: 3, dmg: 25, score: 250, touch: 'bite', color: C.coral, update: updateEsub, draw: drawEsub, die: SND.blast },
        vent: { r: 0, hp: 1, dmg: 0, score: 80, color: C.amber, update: updateVent, draw: drawVent, die: SND.pop },
        stal: { r: 11, hp: 1, dmg: 20, score: 30, touch: 'burst', color: C.aqua, update: updateStal, draw: drawStal, die: SND.fizz },
        crate: { r: 12, hp: 1, dmg: 0, score: 150, color: C.amber, update: function () {}, draw: drawCrate, die: repair }
    };

    // `rammed` means the boat ran into it (or into the mine whose blast did
    // this): that earns no points, and it is the only way a mine's blast is
    // turned against the boat.
    function kill(s, e, rammed) {
        var k = KINDS[e.kind];
        if (e.dead) return;
        e.dead = true;              // set first: a mine's blast must not kill it twice
        if (!rammed) {
            G.addScore(k.score);
            G.popup(e.x, e.y - 16, k.score, C.foam);
        }
        G.burst(e.x, e.y, { n: 14, color: k.color, speed: 170, life: 0.7, drag: 2 });
        k.die(s, e, rammed);
    }

    // `rammed` is passed on by a blast the boat set off with its own hull.
    function damage(s, e, n, rammed) {
        e.hp -= n;
        if (e.hp <= 0) kill(s, e, rammed); else G.sfx('hit');
    }

    // An explosion hurts everything in reach, so mines set each other off.
    // Only a hostile blast (a mine the boat ran into, and the mines that one
    // sets off) hurts the player and scores nothing for what it destroys:
    // depth charges, and mines set off by the boat's own weapons, are friendly.
    function blast(s, x, y, r, hostile) {
        G.burst(x, y, { n: 26, color: C.foam, speed: 240, life: 0.7, drag: 2.5 });
        G.burst(x, y, { n: 10, color: C.amber, speed: 120, life: 0.4 });
        G.shake(6, 0.25);
        SND.blast();
        s.ents.forEach(function (e) {
            if (!e.dead && G.dist(x, y, e.x, e.y) < r + KINDS[e.kind].r) damage(s, e, 3, hostile);
        });
        var k = s.boss;
        if (k && k.awake && G.dist(x, y, k.x - 64, k.y) < r + 24) hitEye(s, 2);
        if (hostile && subHits(s, x, y, r * 0.8)) hurt(s, 30);
    }

    function touchSub(s, e) {
        var k = KINDS[e.kind];
        if (e.dead || !k.touch || !subHits(s, e.x, e.y, k.r)) return;
        if (k.touch === 'burst') kill(s, e, true);
        hurt(s, k.dmg);
    }

    // Entities wait in s.pending (sorted by x) until the view reaches them,
    // so only what is on screen is ever simulated.
    function updateEnts(s, dt) {
        while (s.next < s.pending.length && s.pending[s.next].x < s.cam + G.W + 80) s.ents.push(s.pending[s.next++]);
        s.ents.forEach(function (e) {
            if (e.dead) return;         // killed earlier this tick: must not act again
            e.t += dt;
            KINDS[e.kind].update(s, e, dt);
            touchSub(s, e);
        });
        s.ents = s.ents.filter(function (e) { return !e.dead && e.x > s.cam - 120; });
    }

    // ------------------------------------------------------------------
    // Projectiles
    // ------------------------------------------------------------------

    function torpHit(s, t) {
        var i, e, h;
        for (i = 0; i < s.ents.length; i++) {
            e = s.ents[i];
            if (!e.dead && KINDS[e.kind].r && G.circ(t.x, t.y, 5, e.x, e.y, KINDS[e.kind].r)) { damage(s, e, 1); return true; }
        }
        // Enemy torpedoes can be shot down.
        for (i = 0; i < s.shots.length; i++) {
            h = s.shots[i];
            if (h.torp && !h.dead && G.circ(t.x, t.y, 6, h.x, h.y, h.r + 4)) {
                h.dead = true;
                G.burst(h.x, h.y, { n: 10, color: C.coral, speed: 150, life: 0.4 });
                SND.pop();
                return true;
            }
        }
        return !!s.boss && s.boss.awake && torpBoss(s, t);
    }

    function updateTorps(s, dt) {
        s.torps = s.torps.filter(function (t) {
            t.x += t.vx * dt;
            if (t.x > s.cam + G.W + 30) return false;
            if (t.y < topAt(s, t.x) || t.y > botAt(s, t.x)) {
                G.burst(t.x, t.y, { n: 5, color: C.aqua, speed: 90, life: 0.3 });
                SND.fizz();
                return false;
            }
            return !torpHit(s, t);
        });
    }

    function updateCharges(s, dt) {
        s.charges = s.charges.filter(function (c) {
            c.vy = Math.min(230, c.vy + 420 * dt);
            c.x += c.vx * dt; c.y += c.vy * dt;
            var hit = c.y > botAt(s, c.x) - 6 || s.ents.some(function (e) {
                return !e.dead && KINDS[e.kind].r && G.circ(c.x, c.y, 8, e.x, e.y, KINDS[e.kind].r);
            });
            if (hit) blast(s, c.x, c.y, 78, false);
            return !hit;
        });
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (h) {
            h.x += h.vx * dt; h.y += h.vy * dt;
            if (h.dead || h.x < s.cam - 30 || h.x > s.cam + G.W + 60) return false;
            if (h.y < topAt(s, h.x) || h.y > botAt(s, h.x)) return false;
            if (!subHits(s, h.x, h.y, h.r)) return true;
            hurt(s, h.dmg);
            G.burst(h.x, h.y, { n: 8, color: C.coral, speed: 130, life: 0.4 });
            return false;
        });
    }

    // ------------------------------------------------------------------
    // The kraken
    // ------------------------------------------------------------------

    // Position of segment j of an arm: it reaches left from the body and
    // sways more the further out it is.
    function armPoint(k, arm, j) {
        var f = j / (ARM_SEGS - 1);
        return {
            x: k.x - 60 - j * 34 * arm.reach,
            y: k.y + arm.off + Math.sin(k.t * (k.raged ? 2.3 : 1.7) + arm.ph + j * 0.5) * 95 * f * arm.reach
        };
    }

    function hitEye(s, n) {
        var k = s.boss;
        k.hp -= n; k.hurt = 0.25;
        G.addScore(100);
        G.burst(k.x - 64, k.y, { n: 12, color: C.coral, speed: 200, life: 0.5 });
        G.sfx('boom');
        if (k.hp > 0) return;
        for (var i = 0; i < 6; i++) G.burst(k.x + G.rnd(-80, 60), k.y + G.rnd(-90, 90), { n: 30, color: G.pick([C.coral, C.amber, C.foam]), speed: 300, life: 1.2 });
        G.shake(14, 0.8); G.flash(C.foam, 0.4);
        SND.roar(); SND.blast();
        G.win(3000 + Math.round(s.hull) * 10);
    }

    // A torpedo that strikes an arm makes it recoil, which is how the lane
    // to the eye is opened. The body itself is armoured.
    function torpBoss(s, t) {
        var k = s.boss;
        for (var i = 0; i < k.arms.length; i++) {
            var arm = k.arms[i];
            if (arm.reach < 0.15) continue;
            for (var j = 1; j < ARM_SEGS; j++) {
                var p = armPoint(k, arm, j);
                if (!G.circ(t.x, t.y, 5, p.x, p.y, 13)) continue;
                arm.stun = 1.8;
                G.burst(p.x, p.y, { n: 8, color: C.teal, speed: 140, life: 0.4 });
                SND.pop();
                return true;
            }
        }
        if (G.circ(t.x, t.y, 5, k.x - 64, k.y, 24)) { hitEye(s, 1); return true; }
        if (!G.circ(t.x, t.y, 5, k.x + 10, k.y, 80)) return false;
        SND.fizz();
        return true;
    }

    function spit(s, k) {
        var b = s.sub, ex = k.x - 70, base = Math.atan2(b.y - k.y, b.x - ex), n = k.raged ? 1 : 0;
        for (var i = -n; i <= n; i++) {
            var a = base + i * 0.26;
            s.shots.push({ x: ex, y: k.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 9, dmg: 12 });
        }
        G.sfx('splash');
    }

    function updateArms(s, k, dt) {
        k.arms.forEach(function (arm, i) {
            arm.stun = Math.max(0, arm.stun - dt);
            // The third arm, guarding the eye itself, only joins in when enraged.
            var want = arm.stun > 0 ? 0 : (i < 2 || k.raged ? 1 : 0);
            arm.reach += G.clamp(want - arm.reach, -2.5 * dt, 0.8 * dt);
            if (arm.reach < 0.15) return;
            for (var j = 1; j < ARM_SEGS; j++) {
                var p = armPoint(k, arm, j);
                if (subHits(s, p.x, p.y, 12)) hurt(s, 20);
            }
        });
    }

    function updateBoss(s, dt) {
        var k = s.boss;
        if (!k) return;
        if (!k.awake) {
            if (s.cam < s.cfg.len) return;
            k.awake = true;
            SND.roar(); G.shake(10, 0.6);
        }
        k.t += dt;
        k.hurt = Math.max(0, k.hurt - dt);
        k.y = MID + Math.sin(k.t * 0.6) * 50;
        if (!k.raged && k.hp <= k.max / 2) { k.raged = true; SND.roar(); G.shake(10, 0.5); G.flash(C.coral, 0.2); }
        updateArms(s, k, dt);
        k.ink -= dt;
        // Ink comes slowly enough to leave a gap for the dash to the air.
        if (k.ink <= 0) { k.ink = k.raged ? 1.5 : 2; spit(s, k); }
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    function darkness(s) {
        var x = s.sub.x, d = 0;
        s.darks.forEach(function (z) { d = Math.max(d, G.clamp(Math.min(x - z.x0, z.x1 - x) / 160, 0, 1)); });
        return d;
    }

    // The view stops at the end of the trench: that is the exit on most
    // levels, and the kraken's lair on the last.
    function advance(s, dt) {
        s.scroll = s.cam < s.cfg.len ? s.cfg.speed : 0;
        s.cam = Math.min(s.cfg.len, s.cam + s.scroll * dt);
        G.cam.x = s.cam;
        s.inv = Math.max(0, s.inv - dt);
        s.damage = Math.max(0, s.damage - dt);
        s.ping -= dt; s.ring += dt;
        if (s.ping <= 0) { s.ping = 3.5; s.ring = 0; SND.ping(); }
    }

    function update(s, dt) {
        s.t += dt;
        advance(s, dt);
        moveSub(s, dt);
        hitCave(s);
        fire(s, dt);
        updateEnts(s, dt);
        updateTorps(s, dt);
        updateCharges(s, dt);
        updateShots(s, dt);
        updateBoss(s, dt);
        breathe(s, dt);
        s.dark = darkness(s);
        if (!s.boss && s.cam >= s.cfg.len) G.win(500 + Math.round(s.hull) * 5 + G.lives * 200);
    }

    // ------------------------------------------------------------------
    // Drawing: the world
    // ------------------------------------------------------------------

    function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

    // Water gets darker with every level; light shafts only reach the
    // shallow ones. The drifting snow keeps the picture alive at all times.
    function drawWater(s, ctx) {
        var g = ctx.createLinearGradient(0, 0, 0, G.H), i;
        g.addColorStop(0, C.deep); g.addColorStop(1, C.navy);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = 'rgba(1,4,20,' + (0.06 * (G.level - 1)) + ')';
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = 'rgba(202,240,248,' + Math.max(0, 0.07 - G.level * 0.012) + ')';
        for (i = 0; i < 5; i++) {
            var sx = ((i * 260 - s.cam * 0.3) % 1300 + 1300) % 1300 - 200, w = 50 + Math.sin(s.t * 0.7 + i) * 14;
            ctx.beginPath();
            ctx.moveTo(sx, 0); ctx.lineTo(sx + w, 0); ctx.lineTo(sx + w - 150, G.H); ctx.lineTo(sx - 190, G.H);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(202,240,248,0.35)';
        for (i = 0; i < (s.phone ? 24 : 46); i++) {
            var px = ((i * 137 - s.cam * 0.5 - s.t * 9) % G.W + G.W) % G.W;
            ctx.fillRect(px, (i * 71 + s.t * 7 * (i % 3 + 1)) % G.H, 1 + i % 2, 1 + i % 2);
        }
    }

    function caveEdge(s, ctx, arr, base, inset) {
        var i0 = Math.max(0, Math.floor(s.cam / CS)), i1 = Math.min(arr.length - 1, i0 + Math.ceil(G.W / CS) + 1);
        ctx.beginPath();
        ctx.moveTo(i0 * CS, base);
        for (var i = i0; i <= i1; i++) ctx.lineTo(i * CS, arr[i] + inset);
        ctx.lineTo(i1 * CS, base);
        ctx.closePath();
    }

    // Rock is drawn twice: a lit rim along the water, and a darker core
    // further in, which gives the walls some depth.
    function drawCave(s, ctx) {
        [[s.top, 0, -1], [s.bot, G.H, 1]].forEach(function (d) {
            caveEdge(s, ctx, d[0], d[1], 0);
            ctx.fillStyle = C.rock; ctx.fill();
            ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.stroke();
            caveEdge(s, ctx, d[0], d[1], d[2] * 16);
            ctx.fillStyle = C.rockDark; ctx.fill();
        });
    }

    function onScreen(s, z) { return z.x1 > s.cam && z.x0 < s.cam + G.W; }

    // Streaks running the way the water pushes.
    function drawCurrents(s, ctx) {
        ctx.strokeStyle = 'rgba(72,202,228,0.4)';
        ctx.lineWidth = 2;
        s.currents.forEach(function (z) {
            if (!onScreen(s, z)) return;
            var w = z.x1 - z.x0, f = z.flow, ux = f.x / 330, uy = f.y / 300;
            ctx.beginPath();
            for (var i = 0; i < 26; i++) {
                var px = z.x0 + (((i * 97 + ux * s.t * 200) % w) + w) % w;
                var py = G.HUD + (((i * 53 + uy * s.t * 200) % 500) + 500) % 500;
                ctx.moveTo(px, py); ctx.lineTo(px + ux * 30, py + uy * 30);
            }
            ctx.stroke();
        });
    }

    function drawColumns(s, ctx) {
        s.cols.forEach(function (c) {
            if (c.x < s.cam - COL_W || c.x > s.cam + G.W + COL_W) return;
            var top = topAt(s, c.x), bot = botAt(s, c.x), h = bot - top;
            ctx.fillStyle = 'rgba(202,240,248,0.08)';
            ctx.fillRect(c.x - COL_W / 2, top, COL_W, h);
            if (c.hint || s.phone) G.text('AIR', c.x, top + (s.phone ? 38 : 30), { size: s.phone ? 30 : 22, bold: true, align: 'center', color: s.o2 < 50 && Math.sin(s.t * 10) > 0 ? C.coral : C.foam });
            ctx.strokeStyle = 'rgba(202,240,248,0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (var i = 0; i < (s.phone ? 8 : 12); i++) {
                var y = bot - ((s.t * 70 + i * 61) % h), x = c.x + Math.sin(s.t * 2 + i * 1.7) * (COL_W / 2 - 14);
                ctx.moveTo(x + 3 + i % 4, y); ctx.arc(x, y, 3 + i % 4, 0, TAU);
            }
            ctx.stroke();
        });
    }

    // The exit: a beacon line in open water where the trench ends.
    function drawExit(s, ctx) {
        var x = s.cfg.len + 220;
        if (s.boss || x > s.cam + G.W + 40) return;
        ctx.fillStyle = 'rgba(202,240,248,' + (0.16 + 0.1 * Math.sin(s.t * 5)) + ')';
        ctx.fillRect(x - 14, topAt(s, x), 28, botAt(s, x) - topAt(s, x));
        G.text('OPEN SEA', x + 26, MID, { size: 22, bold: true, color: C.foam, glow: C.teal });
    }

    // ------------------------------------------------------------------
    // Drawing: creatures and hazards
    // ------------------------------------------------------------------

    function drawJelly(s, e, ctx) {
        var pulse = 1 + Math.sin(e.t * 4 + e.ph) * 0.12;
        ctx.fillStyle = 'rgba(227,155,255,0.75)';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 14 * pulse, 12 / pulse, 0, Math.PI, TAU); ctx.fill();
        ctx.strokeStyle = C.jelly; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = -2; i <= 2; i++) {
            ctx.moveTo(e.x + i * 5, e.y);
            ctx.quadraticCurveTo(e.x + i * 5 + Math.sin(e.t * 5 + i) * 5, e.y + 9, e.x + i * 5, e.y + 17);
        }
        ctx.stroke();
    }

    function drawMine(s, e, ctx) {
        ctx.strokeStyle = 'rgba(202,240,248,0.5)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(e.ax, e.ay == null ? e.y : e.ay); ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#7d8aa8'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (var i = 0; i < 8; i++) {
            var a = i * TAU / 8;
            ctx.moveTo(e.x + Math.cos(a) * 9, e.y + Math.sin(a) * 9); ctx.lineTo(e.x + Math.cos(a) * 17, e.y + Math.sin(a) * 17);
        }
        ctx.stroke();
        ctx.fillStyle = '#3a4668'; disc(ctx, e.x, e.y, 12);
        ctx.fillStyle = Math.sin(e.t * 6) > 0 ? C.coral : '#7a2c3c'; disc(ctx, e.x, e.y, 4);
    }

    function drawAngler(s, e, ctx) {
        var open = e.state === 'lunge' ? 0.7 : (e.state === 'warn' ? 0.45 : 0.2), lit = e.state === 'warn' && Math.sin(e.t * 40) > 0;
        ctx.fillStyle = '#0b5a78';
        ctx.beginPath(); ctx.moveTo(e.x + 16, e.y); ctx.lineTo(e.x + 32, e.y - 11); ctx.lineTo(e.x + 32, e.y + 11); ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, 18, Math.PI + open, Math.PI - open); ctx.lineTo(e.x, e.y); ctx.fill();
        ctx.strokeStyle = C.foam; ctx.lineWidth = 2;        // teeth along both jaws
        ctx.beginPath();
        for (var i = 0; i < 4; i++) {
            var r = 17 - i * 4, cx = Math.cos(Math.PI - open) * r, sy = Math.sin(Math.PI - open) * r;
            ctx.moveTo(e.x + cx, e.y + sy); ctx.lineTo(e.x + cx - 1, e.y + sy - 5);
            ctx.moveTo(e.x + cx, e.y - sy); ctx.lineTo(e.x + cx - 1, e.y - sy + 5);
        }
        ctx.stroke();
        ctx.fillStyle = C.foam; disc(ctx, e.x - 2, e.y - 8, 3.5);
        ctx.strokeStyle = '#0b5a78';
        ctx.beginPath(); ctx.moveTo(e.x + 2, e.y - 17); ctx.quadraticCurveTo(e.x - 10, e.y - 36, e.x - 24, e.y - 22); ctx.stroke();
        ctx.fillStyle = C.amber; ctx.shadowColor = C.amber; ctx.shadowBlur = lit ? 22 : 10;
        disc(ctx, e.x - 24, e.y - 22, lit ? 7 : 4);
        ctx.shadowBlur = 0;
        // The flashing lure is tiny on a phone, so the warning is spelled out.
        if (!s.phone && e.state === 'warn') G.text('!', e.x, e.y - 36, { size: 26, bold: true, align: 'center', color: C.amber });
    }

    function drawEsub(s, e, ctx) {
        ctx.fillStyle = '#b3475a';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 28, 11, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a2c3c';
        ctx.fillRect(e.x - 4, e.y - 19, 14, 10);
        ctx.fillRect(e.x + 26, e.y - 9, 4, 18);
        ctx.fillStyle = C.coral; disc(ctx, e.x - 14, e.y - 1, 3 + (e.fire < 0.4 ? 2 : 0));
        for (var i = 0; i < e.hp; i++) ctx.fillRect(e.x - 10 + i * 8, e.y - 30, 6, 3);
    }

    function drawVent(s, e, ctx) {
        ctx.fillStyle = '#2a3f6e';
        ctx.beginPath(); ctx.moveTo(e.x - 22, e.y + 2); ctx.lineTo(e.x - 8, e.y - 16); ctx.lineTo(e.x + 8, e.y - 16); ctx.lineTo(e.x + 22, e.y + 2); ctx.fill();
        ctx.fillStyle = e.on || e.warn ? C.amber : '#7a5a2c';
        ctx.fillRect(e.x - 8, e.y - 18, 16, 4);
        // The lamp alone is a few pixels on a phone: while a vent builds up,
        // the plume to come shimmers faintly over its full height.
        if (e.warn) {
            ctx.fillStyle = 'rgba(255,209,102,' + (0.14 + 0.08 * Math.sin(e.t * 30)) + ')';
            ctx.fillRect(e.x - 18, e.y - e.h, 36, e.h - 16);
        }
        if (!e.on) return;
        var g = ctx.createLinearGradient(0, e.y - e.h, 0, e.y);
        g.addColorStop(0, 'rgba(255,209,102,0)'); g.addColorStop(1, 'rgba(255,140,90,0.75)');
        ctx.fillStyle = g;
        ctx.fillRect(e.x - 18, e.y - e.h, 36, e.h - 16);
        ctx.fillStyle = 'rgba(255,240,210,0.8)';
        for (var i = 0; i < 9; i++) disc(ctx, e.x + Math.sin(e.t * 9 + i * 2) * 13, e.y - 16 - ((e.t * 260 + i * 47) % Math.max(1, e.h - 16)), 2 + i % 3);
    }

    function drawStal(s, e, ctx) {
        var x = e.x + (e.state === 'shake' ? Math.sin(e.t * 70) * 2.5 : 0);
        ctx.fillStyle = e.state === 'hang' ? '#0a4a86' : C.aqua;
        ctx.beginPath(); ctx.moveTo(x - 10, e.y - 20); ctx.lineTo(x + 10, e.y - 20); ctx.lineTo(x, e.y + 16); ctx.fill();
        ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5; ctx.stroke();
    }

    function drawCrate(s, e, ctx) {
        ctx.fillStyle = '#8a6a2c';
        ctx.fillRect(e.x - 13, e.y - 11, 26, 22);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
        ctx.strokeRect(e.x - 13, e.y - 11, 26, 22);
        ctx.beginPath(); ctx.moveTo(e.x - 13, e.y - 11); ctx.lineTo(e.x + 13, e.y + 11); ctx.moveTo(e.x + 13, e.y - 11); ctx.lineTo(e.x - 13, e.y + 11); ctx.stroke();
    }

    function drawArm(k, arm, ctx) {
        ctx.strokeStyle = '#0f7fa3'; ctx.lineCap = 'round';
        for (var j = ARM_SEGS - 1; j >= 1; j--) {
            var a = armPoint(k, arm, j - 1), b = armPoint(k, arm, j);
            ctx.lineWidth = 26 - j * 1.8;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.fillStyle = arm.stun > 0 ? C.coral : C.aqua; disc(ctx, b.x, b.y + 4, 2.5);
        }
        ctx.lineCap = 'butt';
    }

    function drawBoss(s, ctx) {
        var k = s.boss, b = s.sub, a = Math.atan2(b.y - k.y, b.x - (k.x - 64));
        if (k.x > s.cam + G.W + 200) return;
        k.arms.forEach(function (arm) { if (arm.reach > 0.05) drawArm(k, arm, ctx); });
        ctx.fillStyle = k.hurt > 0 ? C.foam : '#0b5a78';
        ctx.beginPath(); ctx.ellipse(k.x + 20, k.y, 96, 118 + Math.sin(k.t * 2) * 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(72,202,228,0.35)';
        for (var i = 0; i < 6; i++) disc(ctx, k.x + 30 + Math.cos(i * 2.3) * 48, k.y + Math.sin(i * 1.9) * 78, 9 + i % 3 * 3);
        ctx.fillStyle = k.raged ? C.coral : C.amber; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
        disc(ctx, k.x - 64, k.y, 24);
        ctx.shadowBlur = 0;
        ctx.fillStyle = C.rockDark;
        ctx.beginPath(); ctx.ellipse(k.x - 64 + Math.cos(a) * 8, k.y + Math.sin(a) * 8, 6, 14, 0, 0, TAU); ctx.fill();
    }

    function drawShots(s, ctx) {
        ctx.fillStyle = C.foam;
        s.torps.forEach(function (t) {
            ctx.fillRect(t.x - 10, t.y - 2, 14, 4);
            ctx.fillStyle = 'rgba(202,240,248,0.35)'; ctx.fillRect(t.x - 30, t.y - 1, 20, 2);
            ctx.fillStyle = C.foam;
        });
        s.charges.forEach(function (c) {
            ctx.fillStyle = '#7d8aa8'; ctx.fillRect(c.x - 5, c.y - 7, 10, 14);
            ctx.fillStyle = C.amber; ctx.fillRect(c.x - 5, c.y - 2, 10, 3);
        });
        s.shots.forEach(function (h) {
            ctx.fillStyle = h.torp ? C.coral : '#4a1d7a';
            ctx.strokeStyle = h.torp ? C.amber : C.jelly; ctx.lineWidth = 2;
            ctx.beginPath();
            if (h.torp) ctx.ellipse(h.x, h.y, 11, 4, 0, 0, TAU); else ctx.arc(h.x, h.y, h.r, 0, TAU);
            ctx.fill(); ctx.stroke();
        });
    }

    // ------------------------------------------------------------------
    // Drawing: darkness, the boat, the gauges
    // ------------------------------------------------------------------

    // One path covers the whole view except a teardrop around the boat and
    // its headlight beam; even-odd filling leaves that hole lit. The beam
    // then fades out toward its far end: the fade is the outer part of the
    // same wedge, drawn 2 px larger all round so that it overlaps the dark
    // instead of meeting it edge to edge (which left a bright seam, and a
    // lit sliver along both sides where the two shapes disagreed).
    function drawDarkness(s, ctx) {
        if (s.dark <= 0.01) return;
        var cx = s.sub.x - s.cam, y = s.sub.y, far = cx + 360, a = 0.5, r = 46, dark = 'rgba(1,4,20,' + (0.92 * s.dark) + ')';
        var nx = cx + Math.cos(a) * r, nh = Math.sin(a) * r;      // where the wedge leaves the teardrop
        var fx = cx + 140, fh = nh + (105 - nh) * (fx - nx) / (far - nx) + 2;
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.rect(0, G.HUD, G.W, G.H - G.HUD);
        ctx.moveTo(far, y - 105);
        ctx.lineTo(nx, y - nh);
        ctx.arc(cx, y, r, -a, a, true);
        ctx.lineTo(far, y + 105);
        ctx.closePath();
        ctx.fill('evenodd');
        var g = ctx.createLinearGradient(cx + 150, 0, far - 20, 0);
        g.addColorStop(0, 'rgba(1,4,20,0)'); g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(fx, y - fh); ctx.lineTo(far + 2, y - 107); ctx.lineTo(far + 2, y + 107); ctx.lineTo(fx, y + fh);
        ctx.fill();
    }

    // In the dark every creature still gives itself away by a small light.
    function drawGlows(s, ctx) {
        if (s.dark <= 0.01) return;
        ctx.globalAlpha = s.dark * (0.6 + 0.4 * Math.sin(s.t * 5));
        ctx.shadowBlur = s.phone ? 0 : 12;
        s.ents.forEach(function (e) {
            var k = KINDS[e.kind], lure = e.kind === 'angler';
            ctx.fillStyle = k.color; ctx.shadowColor = k.color;
            disc(ctx, e.x - (lure ? 24 : 0), e.y - (lure ? 22 : 0), s.phone ? 5 : 3.5);
        });
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    function drawSub(s, ctx) {
        var b = s.sub, spin = Math.sin(s.t * 30) * 9;
        if (s.inv > 0 && Math.floor(s.t * 20) % 2) return;       // blink while invulnerable
        var g = ctx.createLinearGradient(b.x + 24, 0, b.x + 330, 0);
        g.addColorStop(0, 'rgba(202,240,248,0.26)'); g.addColorStop(1, 'rgba(202,240,248,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(b.x + 24, b.y - 4); ctx.lineTo(b.x + 330, b.y - 90); ctx.lineTo(b.x + 330, b.y + 90); ctx.lineTo(b.x + 24, b.y + 4); ctx.fill();
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(G.clamp(b.vy / 600, -0.3, 0.3));
        ctx.fillStyle = C.teal;
        ctx.fillRect(-8, -19, 15, 11); ctx.fillRect(-1, -26, 3, 8); ctx.fillRect(-1, -26, 8, 3);
        ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-33, -10); ctx.lineTo(-33, 10); ctx.fill();
        ctx.fillStyle = C.aqua;
        ctx.beginPath(); ctx.ellipse(0, 0, 28, 11, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = C.amber; disc(ctx, 12, -1, 4); disc(ctx, 0, -1, 3);
        ctx.strokeStyle = C.foam; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-35, -spin); ctx.lineTo(-35, spin); ctx.stroke();
        ctx.restore();
    }

    // A bar starting at x with its label to the left of it. Label and bar are
    // sized to stay readable on a phone, where the canvas is drawn at 40%.
    function gauge(ctx, x, label, frac, color, phone) {
        var y = phone ? 40 : 35, w = phone ? 180 : 120, h = phone ? 20 : 13;
        G.text(label, x - 7, phone ? 60 : 49, { size: phone ? 30 : 20, bold: true, color: C.foam, align: 'right' });
        ctx.fillStyle = 'rgba(3,4,94,0.75)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w * G.clamp(frac, 0, 1), h);
        ctx.strokeStyle = 'rgba(202,240,248,0.55)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }

    // Gauges sit just under the engine's HUD strip. The third one shows the
    // way through the trench, or the kraken's health once it is awake.
    function drawGauges(s, ctx) {
        var low = s.o2 < 25 && Math.sin(s.t * 14) > 0, k = s.boss, phone = s.phone;
        gauge(ctx, phone ? 90 : 56, 'AIR', s.o2 / 100, low ? C.coral : C.foam, phone);
        gauge(ctx, phone ? 410 : 270, 'HULL', s.hull / 100, s.hull < 35 ? C.coral : C.aqua, phone);
        if (k && k.awake) gauge(ctx, phone ? 772 : 832, 'KRAKEN', k.hp / k.max, C.coral, phone);
        else gauge(ctx, phone ? 772 : 832, 'TRIP', s.cam / s.cfg.len, C.teal, phone);
        if (s.ring < 1.2) {
            ctx.strokeStyle = 'rgba(202,240,248,' + (0.35 * (1 - s.ring / 1.2)) + ')'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(s.sub.x - s.cam, s.sub.y, 20 + s.ring * 260, 0, TAU); ctx.stroke();
        }
    }

    // These are the existing attack tells, painted after darkness so a tiny
    // lure or shaking tooth still gives a thumb time to react. Edge markers
    // retain the warning when trimming moves its source beyond the view.
    function drawPhoneWarnings(s, ctx) {
        if (!s.phone) return;
        s.ents.forEach(function (e) {
            var warn = e.kind === 'angler' && e.state === 'warn' ||
                e.kind === 'vent' && e.warn || e.kind === 'stal' && e.state === 'shake' ||
                e.kind === 'esub' && e.fire < 0.4 && e.life > 0;
            if (!warn) return;
            var x = G.clamp(e.x - s.cam, 18, G.W - 18), y = G.clamp(e.y - 38, 104, G.H - 70);
            G.text('!', x, y, { size: 34, bold: true, align: 'center', color: C.amber });
        });
        if (s.o2 >= 25 && s.hull >= 35 && s.damage <= 0) return;
        // The cave reaches y=524 and y=50: full-width backplates would hide
        // the submarine and hazards there. Outline only the warning letters.
        if (s.o2 < 25) G.text('AIR LOW', 16, G.H - 12, { size: 30, bold: true, color: C.coral, glow: C.navy });
        if (s.damage > 0) G.text(s.damageText, G.W / 2, G.H - 12,
            { size: 30, bold: true, align: 'center', color: C.coral, glow: C.navy });
        if (s.hull < 35) G.text('HULL LOW', G.W - 16, G.H - 12,
            { size: 30, bold: true, align: 'right', color: C.coral, glow: C.navy });
    }

    function draw(s, ctx) {
        drawWater(s, ctx);
        ctx.save();
        ctx.translate(-s.cam, 0);
        drawCurrents(s, ctx);
        drawCave(s, ctx);
        drawExit(s, ctx);
        s.ents.forEach(function (e) { KINDS[e.kind].draw(s, e, ctx); });
        if (s.boss) drawBoss(s, ctx);
        ctx.restore();
        drawDarkness(s, ctx);
        // Drawn after the darkness: bubbles, weapons and lights show in it.
        ctx.save();
        ctx.translate(-s.cam, 0);
        drawColumns(s, ctx);
        drawShots(s, ctx);
        drawGlows(s, ctx);
        drawSub(s, ctx);
        ctx.restore();
        drawGauges(s, ctx);
        drawPhoneWarnings(s, ctx);
    }

    function hud(s) {
        return 'AIR ' + Math.ceil(s.o2) + '  HULL ' + Math.max(0, Math.ceil(s.hull));
    }

    G.register('ocean', {
        title: 'DEEP CHANNEL',
        blurb: 'Fly the sub through the trench. Breathe in the bubble columns, mind the hull.',
        controls: [
            '↑ ↓ ballast · ← → trim speed — the boat sinks if left alone',
            'SPACE / TORP torpedoes ahead · X / CHRG depth charges below',
            'Linger in bubble columns for air · blow up crates to repair the hull',
            'Kraken: a hit arm recoils — shoot the eye, dash for its air'
        ],
        levelNames: ['Sunlit Shelf', 'Jelly Bloom', 'Chain Mines', 'Angler Hollow', 'Rip Current',
            'Wolf Pack', 'The Blackout', 'Vent Garden', 'Falling Teeth', 'Kraken\'s Maw'],
        colors: { bg: C.navy, fg: C.foam, accent: C.aqua, dim: '#7fb6cf' },
        lives: 3,
        // Slow and floating: long held lydian notes over a sparse pulse, with
        // the raised fourth (degree 3) giving it the underwater shimmer. The
        // engine does not transpose the lead, so each bar is written to sit
        // on its own chord from `prog`.
        music: {
            bpm: 80, root: 41, scale: 'lydian', prog: [0, 1, 0, 4, 0, 1, 5, 4],
            bass: 'x.......5...x...',
            lead: ['4---..3-4---6---', '8-----6-5---3---', '2---..4-6---8---', '8---6---4-------',
                '4---..6-7---9---', 'a-----8-5---3---', '9---7---5---4---', '4-----------....'],
            arp: '0.2.1.3.2.1.',
            drums: { k: 'x...............', h: '....x.......x.x.' },
            leadWave: 'sine', bassWave: 'sine', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // Everything is on the pad and all six buttons are used: the 8-way
        // stick steers (diagonals matter: rise while trimming back), A and B
        // are the two weapons.
        touch: { a: 'TORP', b: 'CHRG' }
    });
})();
