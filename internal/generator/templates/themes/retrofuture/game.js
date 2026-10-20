/*
 * Atomic Defense — the retrofuture theme's game (missile command).
 *
 * Six domed cities and three missile batteries sit on the horizon. Warheads
 * streak down in waves; the player puts a counter-missile where a warhead
 * WILL be, and its expanding blast takes out everything it touches. Every
 * kill leaves a smaller blast of its own, so a well placed shot chains
 * through a whole salvo for multiplied points. Ammunition is limited per
 * wave, batteries can be knocked out, and the level is lost when the last
 * city falls. Points earn bonus cities.
 *
 * Three levels: plain warheads first; then salvos, MIRVs that split, smart
 * bombs that dodge blasts and saucers that bomb; then the final assault with
 * heavy warheads that need two blasts and flatten the neighbours, low cruise
 * missiles from the sides, a blackout wave (only trails show, blasts light
 * up what is near them) and a mothership. Saving the cities opens the
 * ending: the skyline rises under searchlights and atomic starbursts.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var GROUND = 496, CUR_TOP = 44, CUR_BOTTOM = 456, AMMO = 10, SHOT_SPEED = 760, BLAST_R = 40, BONUS_AT = 3000;
    var BOSS_GUARD = 0.9, FREE_VOLLEYS = 14;
    var PINK = '#ff6b9d', TEAL = '#00d9c0', ORANGE = '#ff8c42', CREAM = '#f0efe4', BG = '#0a0121';
    var BLAST_HUES = [CREAM, TEAL, PINK, ORANGE];
    // Batteries stand at the ends and in the middle, three cities between each pair.
    var SITE_X = [70, 170, 260, 350, 480, 610, 700, 790, 890];
    var TOWERS = [[12, 21, 9], [19, 11, 16], [9, 17, 22]];

    // r: hit radius, speed: multiple of the level's warhead speed, hp: blasts needed.
    var KIND = {
        icbm: { color: PINK, pts: 25, r: 4, speed: 1, hp: 1 },
        mirv: { color: ORANGE, pts: 60, r: 5, speed: 0.9, hp: 1 },
        smart: { color: TEAL, pts: 125, r: 5, speed: 0.95, hp: 1 },
        heavy: { color: CREAM, pts: 150, r: 9, speed: 0.7, hp: 2 },
        cruise: { color: ORANGE, pts: 80, r: 6, speed: 1.7, hp: 1 },
        bomb: { color: PINK, pts: 20, r: 4, speed: 1.4, hp: 1 }
    };
    var SPECIALS = ['mirv', 'smart', 'heavy', 'cruise'];

    // n: warheads per wave; speed: px/s; gap: seconds between launches (or
    // between salvos); salvo: launches per group; mirv/smart/heavy/cruise:
    // share of launches of that kind; saucers and night: per wave; boss: the
    // last wave brings the mothership.
    var LEVELS = [
        { n: [8, 10, 12], speed: 44, gap: 1.6 },
        { n: [10, 12, 14], speed: 54, gap: 2.6, salvo: 2, mirv: 0.3, smart: 0.1, saucers: [0, 1, 2] },
        { n: [10, 10, 8], speed: 62, gap: 1.35, mirv: 0.2, smart: 0.12, heavy: 0.12, cruise: 0.14, saucers: [1, 1, 0], night: [false, true, false], boss: true }
    ];

    // ------------------------------------------------------------------
    // Sounds: sine slides for the theremin feel, noise for the blasts
    // ------------------------------------------------------------------

    var SND = {
        fire: function () { G.tone(260, 0.28, { type: 'sine', slide: 1500, vol: 0.14 }); },
        dry: function () { G.tone(130, 0.07, { vol: 0.12 }); },
        low: function () { G.tone(1100, 0.05, { type: 'sine', vol: 0.1, delay: 0.1 }); },
        blast: function () {
            G.noise(0.45, { freq: 800, slide: 70, vol: 0.2 });
            G.tone(170, 0.4, { type: 'sine', slide: 45, vol: 0.2 });
        },
        // Each link of a chain rings one step higher, so a long chain plays a run.
        kill: function (chain) { G.tone(440 * Math.pow(1.19, Math.min(chain, 8)), 0.16, { type: 'triangle', vol: 0.17 }); },
        clang: function () { G.tone(1900, 0.09, { type: 'triangle', slide: 900, vol: 0.14 }); },
        split: function () {
            [1300, 1000, 760].forEach(function (f, i) { G.tone(f, 0.09, { type: 'sine', slide: f * 0.7, vol: 0.12, delay: i * 0.05 }); });
        },
        zip: function () { G.tone(500, 0.12, { type: 'sine', slide: 1900, vol: 0.09 }); },
        thud: function () { G.noise(0.25, { freq: 300, slide: 60, vol: 0.2 }); },
        city: function () {
            G.sfx('bigboom');
            G.tone(420, 0.9, { type: 'sawtooth', slide: 50, vol: 0.14 });
        },
        base: function () {
            G.sfx('boom');
            G.tone(900, 0.3, { type: 'square', slide: 120, vol: 0.1 });
        },
        siren: function () {
            G.tone(380, 0.5, { type: 'sine', slide: 820, vol: 0.12 });
            G.tone(820, 0.5, { type: 'sine', slide: 380, vol: 0.12, delay: 0.5 });
        },
        hum: function (up) { G.tone(up ? 560 : 700, 0.4, { type: 'sine', slide: up ? 700 : 560, vol: 0.05, attack: 0.08 }); },
        drop: function () { G.tone(900, 0.3, { type: 'sine', slide: 240, vol: 0.09 }); },
        buzz: function () { G.tone(95, 0.5, { type: 'sawtooth', slide: 140, vol: 0.08 }); },
        tick: function (n) { G.tone(700 + n * 25, 0.03, { type: 'triangle', vol: 0.1 }); },
        saved: function (n) { G.tone(523 * Math.pow(1.122, n * 2), 0.18, { type: 'triangle', vol: 0.16 }); },
        bossHit: function () {
            G.sfx('hit');
            G.tone(240, 0.2, { type: 'sawtooth', slide: 620, vol: 0.12 });
        }
    };

    // ------------------------------------------------------------------
    // Level set-up
    // ------------------------------------------------------------------

    function newSite(x, i) {
        var base = i % 4 === 0;
        return { x: x, i: i, base: base, alive: true, ammo: base ? AMMO : 0, rise: 0 };
    }

    function buildStars(level) {
        var rnd = G.rng(level + 99), stars = [];
        for (var i = 0; i < 70; i++) {
            stars.push({ x: rnd() * G.W, y: G.HUD + rnd() * (GROUND - 110), p: rnd() * 6.28, big: rnd() < 0.15 });
        }
        return stars;
    }

    function pickKind(cfg, r) {
        for (var i = 0; i < SPECIALS.length; i++) {
            var share = cfg[SPECIALS[i]] || 0;
            if (r < share) return SPECIALS[i];
            r -= share;
        }
        return 'icbm';
    }

    // The launch schedule of the current wave, sorted by time.
    function buildWave(s) {
        var cfg = s.cfg, n = cfg.n[s.wave], group = cfg.salvo || 1, q = [];
        for (var i = 0; i < n; i++) {
            q.push({ t: 1.6 + Math.floor(i / group) * cfg.gap + s.rnd() * 0.5, kind: pickKind(cfg, s.rnd()) });
        }
        var ships = cfg.saucers ? cfg.saucers[s.wave] : 0, span = 1.6 + n / group * cfg.gap;
        for (var j = 0; j < ships; j++) q.push({ t: span * (j + 0.4) / (ships + 0.3), kind: 'saucer' });
        q.sort(function (a, b) { return a.t - b.t; });
        return q;
    }

    // The aiming cursor starts where the pointer already is (the engine's
    // default is the screen centre), so a click without moving the mouse
    // after a restart still lands under the visible crosshair.
    function init(level) {
        var s = {
            touch: G.isTouch(), cfg: LEVELS[level - 1], rnd: G.rng(level * 7919), wave: 0, waveT: 0, phase: 'wave', tally: null,
            sites: SITE_X.map(newSite), cur: { x: G.clamp(G.mouse.x, 8, G.W - 8), y: G.clamp(G.mouse.y, CUR_TOP, CUR_BOTTOM), hold: 0 }, mx: G.mouse.x, my: G.mouse.y,
            shots: [], blasts: [], foes: [], saucers: [], boss: null, queue: [],
            earned: 0, nextBonus: BONUS_AT, spare: 0, nextId: 1, cool: 0, hum: 0, warble: false,
            regen: 0, sirened: false, stars: buildStars(level)
        };
        s.queue = buildWave(s);
        return s;
    }

    // The blackout is one wave of the finale: only trails show.
    function night(s) { return !!(s.cfg.night && s.cfg.night[s.wave]); }

    function cities(s, alive) {
        return s.sites.filter(function (c) { return !c.base && c.alive === alive; });
    }

    function ammoLeft(s) {
        return s.sites.reduce(function (sum, c) { return sum + (c.alive ? c.ammo : 0); }, 0);
    }

    // ------------------------------------------------------------------
    // Score and bonus cities
    // ------------------------------------------------------------------

    // Rebuilds one ruined city from the bank; false when there is nothing to
    // spend or nothing to rebuild (the spare then stays banked).
    function useSpare(s) {
        var dead = cities(s, false);
        if (!s.spare || !dead.length) return false;
        var c = dead[0];
        s.spare--; c.alive = true; c.rise = 1;
        G.sfx('power');
        G.popup(c.x, GROUND - 50, 'BONUS CITY', TEAL);
        return true;
    }

    // Points are tracked per level in s.earned as well, because the bonus-city
    // threshold must not depend on the score of earlier levels.
    function score(s, n) {
        G.addScore(n);
        s.earned += n;
        if (s.earned < s.nextBonus) return;
        s.nextBonus += BONUS_AT;
        s.spare++;
        if (!useSpare(s)) { G.sfx('coin'); G.popup(G.W / 2, 120, 'BONUS CITY BANKED', TEAL); }
    }

    // ------------------------------------------------------------------
    // Player: cursor, counter-missiles, blasts
    // ------------------------------------------------------------------

    // A tap of a key nudges and a held key sweeps (the speed ramps up while
    // a direction is held); the pointer takes over whenever it moves, and
    // also on every press: a finger on a phone cannot hover, so a tap must
    // aim where it lands even if the pad has moved the cursor away since
    // the last tap on that very spot.
    function moveCursor(s, dt) {
        var c = s.cur, k = G.key;
        var dx = (k.right ? 1 : 0) - (k.left ? 1 : 0), dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        c.hold = dx || dy ? Math.min(1, c.hold + dt * 2.2) : 0;
        var sp = (240 + 520 * c.hold) * (dx && dy ? 0.7071 : 1);
        c.x += dx * sp * dt; c.y += dy * sp * dt;
        if (G.mouse.hit || G.mouse.x !== s.mx || G.mouse.y !== s.my) { c.x = s.mx = G.mouse.x; c.y = s.my = G.mouse.y; }
        c.x = G.clamp(c.x, 8, G.W - 8);
        // Blasts stay above the skyline, so the rooftops are never hidden by them.
        c.y = G.clamp(c.y, CUR_TOP, CUR_BOTTOM);
    }

    function nearestBattery(s) {
        var best = null;
        s.sites.forEach(function (b) {
            if (!b.base || !b.alive || b.ammo <= 0) return;
            if (!best || Math.abs(b.x - s.cur.x) < Math.abs(best.x - s.cur.x)) best = b;
        });
        return best;
    }

    function fire(s) {
        var b = nearestBattery(s), c = s.cur, sy = GROUND - 24;
        if (!b) { SND.dry(); s.cool = 0.15; return; }
        b.ammo--; s.cool = 0.09;
        var d = G.dist(b.x, sy, c.x, c.y) || 1;
        s.shots.push({
            x: b.x, y: sy, sx: b.x, sy: sy, tx: c.x, ty: c.y,
            vx: (c.x - b.x) / d * SHOT_SPEED, vy: (c.y - sy) / d * SHOT_SPEED, left: d
        });
        SND.fire();
        if (ammoLeft(s) <= 5) SND.low();
        G.burst(b.x, sy, { n: 5, color: ORANGE, speed: 90, life: 0.3, angle: Math.PI / 2, spread: 1.2 });
    }

    function addBlast(s, x, y, max, chain, hostile) {
        s.blasts.push({ id: s.nextId++, x: x, y: y, r: 0, max: max, t: 0, dur: max / BLAST_R * 1.1, chain: chain, hostile: !!hostile });
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (sh) {
            sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.left -= SHOT_SPEED * dt;
            if (sh.left > 0) return true;
            addBlast(s, sh.tx, sh.ty, BLAST_R, 0);
            SND.blast();
            return false;
        });
    }

    // A blast swells fast, lingers near its full size and collapses: the
    // square root of a half sine gives exactly that shape.
    function updateBlasts(s, dt) {
        s.blasts = s.blasts.filter(function (b) {
            b.t += dt;
            b.r = b.max * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, b.t / b.dur))));
            return b.t < b.dur;
        });
    }

    // ------------------------------------------------------------------
    // Warheads
    // ------------------------------------------------------------------

    // Cities nobody is aiming at yet come first, so a wave spreads over the
    // whole skyline instead of wasting itself on one dome; batteries draw
    // roughly a quarter of the fire.
    function pickTarget(s) {
        var claimed = {};
        s.foes.forEach(function (f) { claimed[f.tx] = true; });
        var alive = s.sites.filter(function (c) { return c.alive; });
        var town = alive.filter(function (c) { return !c.base; });
        var fresh = town.filter(function (c) { return !claimed[c.x]; });
        var pool = s.rnd() < 0.72 ? (fresh.length ? fresh : town) : alive.filter(function (c) { return c.base; });
        if (!pool.length) pool = alive.length ? alive : s.sites;
        return pool[Math.floor(s.rnd() * pool.length)];
    }

    function makeFoe(s, kind, x, y) {
        var k = KIND[kind], site = pickTarget(s);
        var speed = s.cfg.speed * (1 + s.wave * 0.07) * k.speed * (0.85 + s.rnd() * 0.3);
        var d = G.dist(x, y, site.x, GROUND) || 1;
        var f = {
            id: s.nextId++, kind: kind, x: x, y: y, tx: site.x, speed: speed, hp: k.hp, seen: 0, hurt: 0, zip: 0,
            vx: (site.x - x) / d * speed, vy: (GROUND - y) / d * speed, trail: [{ x: x, y: y }]
        };
        if (kind === 'mirv') f.splitY = 150 + s.rnd() * 110;
        return f;
    }

    // Cruise missiles come in level from a screen edge and only dive once
    // they are over their target. One aimed near an edge enters from the far
    // side, so every cruise missile flies level for at least 250px and even
    // the corner batteries get a fair warning.
    function makeCruise(s) {
        var f = makeFoe(s, 'cruise', 0, 250 + s.rnd() * 90), left = s.rnd() < 0.5;
        if (f.tx < 262) left = false;
        if (f.tx > G.W - 262) left = true;
        f.x = left ? -12 : G.W + 12;
        f.trail = [{ x: f.x, y: f.y }];
        f.vx = left ? f.speed : -f.speed; f.vy = 0; f.dive = false;
        SND.buzz();
        return f;
    }

    function launch(s, ev) {
        if (ev.kind === 'saucer') { s.saucers.push(makeSaucer(s)); return; }
        if (ev.kind === 'cruise') { s.foes.push(makeCruise(s)); return; }
        s.foes.push(makeFoe(s, ev.kind, 40 + s.rnd() * (G.W - 80), G.HUD + 2));
    }

    // Smart bombs head for their target but veer away from any blast that
    // comes close. Only a blast that opens right on top of one, or a second
    // blast on its escape side, catches it.
    function steerSmart(s, f, dt) {
        var d = G.dist(f.x, f.y, f.tx, GROUND) || 1;
        var wx = (f.tx - f.x) / d * f.speed, wy = (GROUND - f.y) / d * f.speed, dodging = false;
        s.blasts.forEach(function (b) {
            var gap = G.dist(f.x, f.y, b.x, b.y);
            if (b.hostile || gap > b.r + 50 || gap < 1) return;
            wx += (f.x - b.x) / gap * 240; wy += (f.y - b.y) / gap * 120; dodging = true;
        });
        var k = Math.min(1, dt * 5);
        f.vx += (wx - f.vx) * k; f.vy += (wy - f.vy) * k;
        f.x = G.clamp(f.x, 8, G.W - 8); f.y = Math.max(f.y, G.HUD + 4);
        f.zip -= dt;
        if (dodging && f.zip <= 0) { SND.zip(); f.zip = 0.6; }
    }

    function moveFoe(s, f, dt) {
        if (f.kind === 'smart') steerSmart(s, f, dt);
        if (f.kind === 'cruise' && !f.dive && (f.x - f.tx) * f.vx >= 0) {
            f.dive = true; f.vx = 0; f.vy = f.speed * 1.1;
            SND.drop();
        }
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.hurt > 0) f.hurt -= dt;
        // The trail is a capped list of points, so curving paths draw right
        // and the blackout can show just its last stretch.
        var last = f.trail[f.trail.length - 1];
        if (G.dist(last.x, last.y, f.x, f.y) < 14) return;
        f.trail.push({ x: f.x, y: f.y });
        if (f.trail.length > 64) f.trail.shift();
    }

    // The bus carries on as a plain warhead and releases two more.
    function splitMirv(s, f, born) {
        f.kind = 'icbm';
        for (var i = 0; i < 2; i++) born.push(makeFoe(s, 'icbm', f.x, f.y));
        SND.split();
        G.burst(f.x, f.y, { n: 8, color: ORANGE, speed: 120, life: 0.4 });
    }

    function chainFactor(chain) { return Math.min(5, 1 + chain); }

    function killFoe(s, f, b) {
        // Warheads of the mothership's late volleys are worth nothing (f.free).
        var pts = f.free ? 0 : KIND[f.kind].pts * chainFactor(b.chain);
        score(s, pts);
        addBlast(s, f.x, f.y, f.kind === 'heavy' ? 44 : 30, b.chain + 1);
        SND.kill(b.chain);
        G.burst(f.x, f.y, { n: 10, color: KIND[f.kind].color, speed: 170, life: 0.5 });
        if (pts) G.popup(f.x, f.y - 12, b.chain ? 'x' + chainFactor(b.chain) + ' ' + pts : pts, b.chain ? ORANGE : CREAM);
    }

    // One blast hurts a warhead only once, so a heavy one needs two blasts.
    // The blasts of ground impacts are the enemy's own and spare the enemy.
    function blastKills(s, f) {
        for (var i = 0; i < s.blasts.length; i++) {
            var b = s.blasts[i];
            if (b.hostile || f.seen === b.id || !G.circ(f.x, f.y, KIND[f.kind].r, b.x, b.y, b.r)) continue;
            f.seen = b.id;
            if (--f.hp > 0) { f.hurt = 0.25; SND.clang(); continue; }
            killFoe(s, f, b);
            return true;
        }
        return false;
    }

    function wreck(site) {
        site.alive = false; site.ammo = 0;
        if (site.base) SND.base(); else SND.city();
        G.shake(site.base ? 6 : 10, 0.4);
        G.flash(site.base ? ORANGE : PINK, 0.12);
        G.burst(site.x, GROUND - 10, { n: 26, color: site.base ? ORANGE : TEAL, speed: 240, life: 0.9, gravity: 420, angle: -Math.PI / 2, spread: 2.6 });
    }

    // A heavy warhead also flattens the neighbours of what it lands on.
    function impact(s, f) {
        var heavy = f.kind === 'heavy', reach = heavy ? 100 : 30, hit = false;
        addBlast(s, f.x, GROUND - 4, heavy ? 60 : 30, 0, true);
        s.sites.forEach(function (site) {
            if (!site.alive || Math.abs(site.x - f.x) > reach) return;
            wreck(site);
            hit = true;
        });
        if (!hit) { SND.thud(); G.burst(f.x, GROUND - 4, { n: 8, color: PINK, speed: 120, life: 0.4, angle: -Math.PI / 2, spread: 2 }); }
    }

    function updateFoes(s, dt) {
        var born = [];
        s.foes = s.foes.filter(function (f) {
            moveFoe(s, f, dt);
            if (f.kind === 'mirv' && f.y >= f.splitY) splitMirv(s, f, born);
            if (f.y >= GROUND - 6) { impact(s, f); return false; }
            return !blastKills(s, f);
        });
        s.foes = s.foes.concat(born);
    }

    // ------------------------------------------------------------------
    // Saucers and the mothership
    // ------------------------------------------------------------------

    function makeSaucer(s) {
        var dir = s.rnd() < 0.5 ? 1 : -1;
        return { x: dir > 0 ? -30 : G.W + 30, y0: 70 + s.rnd() * 90, y: 0, vx: dir * (70 + G.level * 4), drop: 1 + s.rnd(), p: s.rnd() * 6 };
    }

    function blastOn(s, x, y, w, h, fresh) {
        for (var i = 0; i < s.blasts.length; i++) {
            var b = s.blasts[i];
            if (b.hostile || (fresh && b.boss) || !G.circRect(b.x, b.y, b.r, x - w / 2, y - h / 2, w, h)) continue;
            return b;
        }
        return null;
    }

    function killSaucer(s, sc, b) {
        var pts = 100 * chainFactor(b.chain);
        score(s, pts);
        addBlast(s, sc.x, sc.y, 38, b.chain + 1);
        G.sfx('boom'); SND.kill(b.chain + 2);
        G.burst(sc.x, sc.y, { n: 22, color: CREAM, speed: 220, life: 0.7, gravity: 200 });
        G.popup(sc.x, sc.y - 16, pts, TEAL);
    }

    function updateSaucers(s, dt) {
        s.saucers = s.saucers.filter(function (sc) {
            sc.x += sc.vx * dt;
            sc.y = sc.y0 + Math.sin(G.t * 2.4 + sc.p) * 10;
            sc.drop -= dt;
            if (sc.drop <= 0 && sc.x > 40 && sc.x < G.W - 40) {
                sc.drop = 1.6 + s.rnd() * 1.4;
                s.foes.push(makeFoe(s, 'bomb', sc.x, sc.y + 8));
                SND.drop();
            }
            var b = blastOn(s, sc.x, sc.y, 40, 16, false);
            if (b) { killSaucer(s, sc, b); return false; }
            return sc.x > -40 && sc.x < G.W + 40;
        });
        // The theremin warble plays for as long as something alien is overhead.
        s.hum -= dt;
        if ((s.saucers.length || s.boss) && s.hum <= 0) { s.hum = 0.42; s.warble = !s.warble; SND.hum(s.warble); }
    }

    function killBoss(s, m) {
        for (var i = 0; i < 7; i++) addBlast(s, m.x + (i - 3) * 22, m.y + (i % 2 ? 14 : -10), 34 + i * 2, 1);
        score(s, 2500);
        G.sfx('bigboom'); SND.split();
        G.flash(CREAM, 0.3); G.shake(12, 0.6);
        G.burst(m.x, m.y, { n: 60, color: TEAL, speed: 320, life: 1.2, gravity: 160 });
        G.popup(m.x, m.y - 30, 'MOTHERSHIP DOWN 2500', ORANGE);
        s.boss = null;
    }

    // While the mothership lives the batteries are resupplied, because the
    // fight has no fixed length and must not be decided by an empty magazine;
    // for the same reason a wrecked battery is rebuilt every eight seconds
    // (there is no next wave that would do it).
    function resupply(s, m, dt) {
        s.regen -= dt;
        if (s.regen <= 0) {
            s.regen = 1.3;
            s.sites.forEach(function (b) { if (b.base && b.alive && b.ammo < AMMO) b.ammo++; });
        }
        m.rebuild -= dt;
        if (m.rebuild > 0) return;
        m.rebuild = 8;
        var down = s.sites.filter(function (b) { return b.base && !b.alive; })[0];
        if (!down) return;
        down.alive = true; down.ammo = 4;
        G.sfx('power');
        G.popup(down.x, GROUND - 40, 'BATTERY REBUILT', ORANGE);
    }

    // Volleys come faster and faster, so the fight cannot be dragged out, but
    // never closer than 1.8s: each brings two warheads, and a casual player
    // gets off about two shots a second and must spend some on the hull.
    // After FREE_VOLLEYS of them the warheads stop scoring: with resupplied
    // magazines the mothership would otherwise be an endless source of points
    // and bonus cities.
    function bossVolley(s, m) {
        m.volley++;
        m.fire = Math.max(1.8, 2.8 - m.volley * 0.1);
        var pair = [makeFoe(s, 'icbm', m.x - 30, m.y + 16), makeFoe(s, m.volley % 3 ? 'icbm' : 'smart', m.x + 30, m.y + 16)];
        pair.forEach(function (f) { f.free = m.volley > FREE_VOLLEYS; s.foes.push(f); });
        SND.drop();
    }

    // The hull is shielded until the first volley and for BOSS_GUARD seconds
    // after every bite, so no amount of rapid fire shortens the fight below
    // hp * BOSS_GUARD seconds; a blast absorbed by the shield is spent.
    function biteBoss(s, m) {
        var b = blastOn(s, m.x, m.y, 116, 34, true);
        if (!b) return;
        b.boss = true;
        if (m.hurt > 0 || !m.volley) { if (m.ping <= 0) { SND.clang(); m.ping = 0.3; } return; }
        m.hp--; m.hurt = BOSS_GUARD;
        SND.bossHit();
        G.burst(b.x, m.y, { n: 12, color: ORANGE, speed: 200, life: 0.5 });
        if (m.hp <= 0) killBoss(s, m);
    }

    function updateBoss(s, dt) {
        var m = s.boss;
        if (!m) return;
        m.t += dt;
        m.x = G.W / 2 + 330 * Math.sin(m.t * 0.4);
        m.y = 96 + 12 * Math.sin(m.t * 1.7);
        if (m.hurt > 0) m.hurt -= dt;
        if (m.ping > 0) m.ping -= dt;
        resupply(s, m, dt);
        m.fire -= dt;
        if (m.fire <= 0) bossVolley(s, m);
        biteBoss(s, m);
    }

    // ------------------------------------------------------------------
    // Waves and the end-of-wave tally
    // ------------------------------------------------------------------

    function isLastWave(s) { return s.wave >= s.cfg.n.length - 1; }

    function startTally(s) {
        var items = [];
        while (useSpare(s)) { /* spend every banked city before counting */ }
        s.sites.forEach(function (b) {
            for (var i = 0; b.base && b.alive && i < b.ammo; i++) items.push({ site: b, pts: 5 });
        });
        cities(s, true).forEach(function (c) { items.push({ site: c, pts: 100 }); });
        s.phase = 'tally';
        s.tally = { items: items, i: 0, t: 0.6, sum: 0, towns: 0, done: false };
        G.sfx('coin');
    }

    function nextWave(s) {
        s.wave++; s.waveT = 0; s.phase = 'wave'; s.tally = null; s.sirened = false;
        s.sites.forEach(function (b) { if (b.base) { b.alive = true; b.ammo = AMMO; } });
        s.queue = buildWave(s);
        if (s.cfg.boss && isLastWave(s)) s.boss = { x: G.W / 2, y: 96, hp: 15, max: 15, t: 0, fire: 3, hurt: 0, ping: 0, volley: 0, rebuild: 8 };
    }

    // Counts the unused missiles and the surviving cities one by one, then
    // moves on to the next wave or finishes the level.
    function runTally(s, dt) {
        var ta = s.tally;
        ta.t -= dt;
        if (ta.t > 0) return;
        if (ta.i < ta.items.length) {
            var it = ta.items[ta.i++], town = !it.site.base;
            ta.sum += it.pts; score(s, it.pts);
            if (town) { SND.saved(ta.towns++); G.popup(it.site.x, GROUND - 44, it.pts, TEAL); }
            else { it.site.ammo--; SND.tick(ta.i); }
            ta.t = town ? 0.24 : 0.045;
        } else if (!ta.done) {
            ta.done = true; ta.t = 1.2;
        } else if (isLastWave(s)) {
            G.win(cities(s, true).length * 150 + G.level * 200);
        } else {
            nextWave(s);
        }
    }

    function runWave(s) {
        if (!s.sirened && s.waveT > 0.3) { s.sirened = true; SND.siren(); }
        while (s.queue.length && s.queue[0].t <= s.waveT) launch(s, s.queue.shift());
        if (!cities(s, true).length && !useSpare(s)) { G.die(); return; }
        var busy = s.queue.length || s.foes.length || s.saucers.length || s.boss || s.blasts.length || s.shots.length;
        if (!busy) startTally(s);
    }

    function update(s, dt) {
        s.waveT += dt;
        moveCursor(s, dt);
        if (s.cool > 0) s.cool -= dt;
        // No firing during the tally: the magazines are being counted.
        if (s.phase === 'wave' && s.cool <= 0 && (G.hit.a || G.mouse.hit)) fire(s);
        updateShots(s, dt);
        updateBlasts(s, dt);
        updateFoes(s, dt);
        updateSaucers(s, dt);
        updateBoss(s, dt);
        s.sites.forEach(function (c) { if (c.rise > 0) c.rise = Math.max(0, c.rise - dt * 1.3); });
        if (s.phase === 'wave') runWave(s); else runTally(s, dt);
    }

    // ------------------------------------------------------------------
    // Drawing: sky and ground
    // ------------------------------------------------------------------

    function drawPlanet(ctx, night) {
        var x = 800, y = 112;
        ctx.globalAlpha = night ? 0.35 : 0.9;
        ctx.fillStyle = ORANGE;
        ctx.beginPath(); ctx.arc(x, y, 30, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(10,1,33,0.35)';
        ctx.beginPath(); ctx.arc(x + 9, y + 6, 27, 0, 6.3); ctx.fill();
        ctx.strokeStyle = TEAL; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, 52, 11, -0.35, 0, 6.3); ctx.stroke();
        // A sputnik circles the planet, so the sky is never still.
        var a = G.t * 0.9;
        ctx.fillStyle = CREAM;
        ctx.fillRect(x + Math.cos(a) * 66 - 2, y + Math.sin(a) * 20 - 2, 4, 4);
        ctx.globalAlpha = 1;
    }

    function drawSky(s, ctx) {
        var dark = night(s), g = ctx.createLinearGradient(0, G.HUD, 0, GROUND);
        g.addColorStop(0, dark ? '#020007' : BG);
        g.addColorStop(0.7, dark ? '#06010f' : '#24093f');
        g.addColorStop(1, dark ? '#12041f' : '#6a2360');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, G.W, GROUND);
        s.stars.forEach(function (st, i) {
            if (s.touch && i % 2) return;
            ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(G.t * 1.6 + st.p));
            ctx.fillStyle = st.big ? TEAL : CREAM;
            ctx.fillRect(st.x, st.y, st.big ? 3 : 2, st.big ? 3 : 2);
        });
        drawPlanet(ctx, dark);
    }

    // A perspective grid below the horizon, in the theme's own style.
    function drawGround(s, ctx) {
        ctx.fillStyle = night(s) ? '#07020f' : '#160633';
        ctx.fillRect(0, GROUND, G.W, G.H - GROUND);
        ctx.strokeStyle = TEAL; ctx.lineWidth = 1; ctx.globalAlpha = night(s) ? 0.12 : 0.28;
        ctx.beginPath();
        for (var i = -14; i <= 14; i++) { ctx.moveTo(G.W / 2 + i * 38, GROUND); ctx.lineTo(G.W / 2 + i * 92, G.H); }
        for (var y = GROUND + 8; y < G.H; y += 12) { ctx.moveTo(0, y); ctx.lineTo(G.W, y); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = PINK;
        ctx.fillRect(0, GROUND - 1, G.W, 2);
    }

    // ------------------------------------------------------------------
    // Drawing: cities and batteries
    // ------------------------------------------------------------------

    function drawRubble(ctx, x) {
        ctx.fillStyle = '#2a1840';
        ctx.beginPath();
        ctx.moveTo(x - 24, GROUND); ctx.lineTo(x - 14, GROUND - 7); ctx.lineTo(x - 6, GROUND - 3);
        ctx.lineTo(x + 4, GROUND - 10); ctx.lineTo(x + 13, GROUND - 4); ctx.lineTo(x + 24, GROUND);
        ctx.fill();
        // Embers keep glowing in the ruin.
        ctx.fillStyle = ORANGE; ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(G.t * 3 + x));
        ctx.fillRect(x - 3, GROUND - 5, 3, 2); ctx.fillRect(x + 8, GROUND - 3, 2, 2);
        ctx.globalAlpha = 1;
    }

    function drawTowers(ctx, c, night) {
        var hs = TOWERS[c.i % 3];
        for (var i = 0; i < 3; i++) {
            var tx = -15 + i * 11, h = hs[i];
            ctx.fillStyle = night ? '#1c1030' : (i === 1 ? PINK : CREAM);
            ctx.fillRect(tx, -h, 8, h);
            // Windows: lit and flickering at night, dark by day.
            ctx.fillStyle = night ? ORANGE : BG;
            for (var wy = 3; wy < h - 2; wy += 5) {
                if (!night || Math.sin(G.t * 2 + c.x + wy * 3 + i) > -0.5) ctx.fillRect(tx + 2, -h + wy, 4, 2);
            }
        }
    }

    // A glass dome over three towers and a starburst spire. A rebuilt city
    // rises out of the ground (c.rise runs from 1 to 0).
    function drawCity(ctx, c, night) {
        if (!c.alive) { drawRubble(ctx, c.x); return; }
        ctx.save();
        ctx.translate(c.x, GROUND - 1);
        ctx.scale(1, 1 - c.rise * 0.95);
        drawTowers(ctx, c, night);
        ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(15, -27); ctx.stroke();
        for (var a = 0; a < 3; a++) {
            var ang = a * Math.PI / 3 + G.t;
            ctx.beginPath();
            ctx.moveTo(15 - Math.cos(ang) * 5, -29 - Math.sin(ang) * 5); ctx.lineTo(15 + Math.cos(ang) * 5, -29 + Math.sin(ang) * 5);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,217,192,' + (night ? 0.05 : 0.13) + ')';
        ctx.strokeStyle = TEAL; ctx.lineWidth = 2; ctx.globalAlpha = night ? 0.45 : 1;
        ctx.beginPath(); ctx.arc(0, 0, 27, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    // The magazine is drawn as a pyramid of rockets under the battery, so the
    // remaining ammunition can be read without looking at the HUD.
    function drawAmmo(ctx, b, touch) {
        // Tiny rocket icons disappear in portrait; a count also makes each
        // battery's supply visible without crowding the engine's HUD.
        if (touch) {
            var label = b.ammo > 3 ? String(b.ammo) : (b.ammo ? 'LOW ' + b.ammo : 'OUT');
            G.text(label, b.x, GROUND + 32, { size: 26, color: b.ammo > 3 ? TEAL : PINK, align: 'center', bold: true });
            return;
        }
        var n = 0;
        ctx.fillStyle = TEAL;
        for (var row = 0; row < 4; row++) {
            for (var i = 0; i <= row && n < b.ammo; i++, n++) {
                var x = b.x + (i - row / 2) * 11, y = GROUND + 8 + row * 9;
                ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x - 3, y + 3); ctx.fill();
            }
        }
        if (b.ammo > 3) return;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.t * 9);
        G.text(b.ammo ? 'LOW' : 'OUT', b.x, GROUND + 40, { size: 18, color: PINK, align: 'center', bold: true });
        ctx.globalAlpha = 1;
    }

    function drawBattery(ctx, b, touch) {
        if (!b.alive) {
            drawRubble(ctx, b.x);
            if (touch) G.text('LOST', b.x, GROUND + 32, { size: 26, color: PINK, align: 'center', bold: true });
            return;
        }
        ctx.fillStyle = '#2a1150'; ctx.strokeStyle = ORANGE; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - 30, GROUND); ctx.lineTo(b.x - 14, GROUND - 16); ctx.lineTo(b.x + 14, GROUND - 16); ctx.lineTo(b.x + 30, GROUND);
        ctx.fill(); ctx.stroke();
        // A sweeping radar dish on every battery.
        var a = -Math.PI / 2 + Math.sin(G.t * 1.5 + b.x) * 1.1;
        ctx.strokeStyle = CREAM;
        ctx.beginPath(); ctx.moveTo(b.x, GROUND - 16); ctx.lineTo(b.x + Math.cos(a) * 12, GROUND - 16 + Math.sin(a) * 12); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * 12, GROUND - 16 + Math.sin(a) * 12, 4, a - 1.4, a + 1.4); ctx.stroke();
        drawAmmo(ctx, b, touch);
    }

    function drawSites(s, ctx) {
        s.sites.forEach(function (c) {
            if (c.base) drawBattery(ctx, c, s.touch); else drawCity(ctx, c, night(s));
        });
    }

    // ------------------------------------------------------------------
    // Drawing: warheads, saucers, mothership
    // ------------------------------------------------------------------

    // At night anything is only seen in the glow of a nearby blast.
    function lit(s, x, y) {
        if (!night(s)) return true;
        return s.blasts.some(function (b) { return G.dist(x, y, b.x, b.y) < b.r + 90; });
    }

    function drawTrail(ctx, f, night) {
        var tr = f.trail, from = night ? Math.max(0, tr.length - 5) : 0;
        // Wide enough to survive a phone, where the canvas is drawn at 40-60%.
        ctx.strokeStyle = KIND[f.kind].color; ctx.lineWidth = f.kind === 'heavy' ? 5 : 3;
        ctx.globalAlpha = night ? 0.95 : 0.6;
        ctx.beginPath(); ctx.moveTo(tr[from].x, tr[from].y);
        for (var i = from + 1; i < tr.length; i++) ctx.lineTo(tr[i].x, tr[i].y);
        ctx.lineTo(f.x, f.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function diamond(ctx, x, y, r) {
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.fill();
    }

    // A cruise missile is a dart that points where it flies: level, then down.
    function dart(ctx, f) {
        var ux = f.dive ? 0 : (f.vx > 0 ? 1 : -1), uy = f.dive ? 1 : 0;
        ctx.beginPath();
        ctx.moveTo(f.x + ux * 10, f.y + uy * 10);
        ctx.lineTo(f.x - ux * 7 - uy * 6, f.y - uy * 7 + ux * 6);
        ctx.lineTo(f.x - ux * 7 + uy * 6, f.y - uy * 7 - ux * 6);
        ctx.fill();
    }

    // Every kind has its own silhouette so it can be told apart at a glance.
    // The heads are drawn larger than their hit radius (KIND.r): on a phone
    // a true-to-size warhead would be a two-pixel dot.
    function drawHead(ctx, f) {
        var k = KIND[f.kind], pulse = 0.5 + 0.5 * Math.sin(G.t * 16 + f.id);
        ctx.fillStyle = f.hurt > 0 || pulse > 0.8 ? '#ffffff' : k.color;
        if (f.kind === 'mirv') { diamond(ctx, f.x, f.y, 8); return; }
        if (f.kind === 'cruise') { dart(ctx, f); return; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.kind === 'heavy' ? 10 : 5.5, 0, 6.3); ctx.fill();
        if (f.kind === 'heavy' && f.hp > 1) { ctx.fillStyle = PINK; ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, 6.3); ctx.fill(); }
        if (f.kind !== 'smart') return;
        ctx.strokeStyle = TEAL; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 9 + pulse * 4, 0, 6.3); ctx.stroke();
    }

    function drawFoes(s, ctx) {
        var dark = night(s);
        s.foes.forEach(function (f) {
            drawTrail(ctx, f, dark);
            if (lit(s, f.x, f.y)) drawHead(ctx, f);
        });
    }

    function drawSaucer(s, ctx, sc) {
        if (lit(s, sc.x, sc.y)) {
            ctx.fillStyle = TEAL;
            ctx.beginPath(); ctx.arc(sc.x, sc.y - 3, 9, Math.PI, 0); ctx.fill();
            ctx.fillStyle = CREAM;
            ctx.beginPath(); ctx.ellipse(sc.x, sc.y, 21, 7, 0, 0, 6.3); ctx.fill();
        }
        // The running lights show even at night; they are all a night gunner gets.
        for (var i = -1; i <= 1; i++) {
            ctx.fillStyle = Math.floor(G.t * 6 + i) % 3 === 0 ? ORANGE : PINK;
            ctx.fillRect(sc.x + i * 12 - 2, sc.y - 1, 4, 3);
        }
    }

    function drawBoss(ctx, m, touch) {
        var stung = m.hurt > BOSS_GUARD - 0.15;
        ctx.fillStyle = stung ? '#ffffff' : TEAL;
        ctx.beginPath(); ctx.arc(m.x, m.y - 8, 24, Math.PI, 0); ctx.fill();
        ctx.fillStyle = stung ? '#ffffff' : CREAM;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, 58, 17, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#2a1150';
        ctx.beginPath(); ctx.ellipse(m.x, m.y + 8, 34, 6, 0, 0, 6.3); ctx.fill();
        for (var i = -3; i <= 3; i++) {
            ctx.fillStyle = Math.floor(G.t * 8 + i + 9) % 4 === 0 ? ORANGE : PINK;
            ctx.beginPath(); ctx.arc(m.x + i * 15, m.y, 3, 0, 6.3); ctx.fill();
        }
        // A shimmering shield shows when shots are wasted on it.
        if (m.hurt > 0 || !m.volley) {
            ctx.strokeStyle = TEAL; ctx.lineWidth = 2; ctx.globalAlpha = 0.45 + 0.35 * Math.sin(G.t * 22);
            ctx.beginPath(); ctx.ellipse(m.x, m.y - 2, 70, 30, 0, 0, 6.3); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        // Hull gauge right under the HUD.
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(G.W / 2 - 122, 36, 244, touch ? 14 : 10);
        ctx.fillStyle = PINK; ctx.fillRect(G.W / 2 - 120, 38, 240 * m.hp / m.max, touch ? 10 : 6);
        G.text('MOTHERSHIP', touch ? G.W / 2 + 140 : G.W / 2, touch ? 52 : 62, { size: touch ? 22 : 14, color: CREAM, align: touch ? 'left' : 'center' });
    }

    // ------------------------------------------------------------------
    // Drawing: shots, blasts, cursor, banners
    // ------------------------------------------------------------------

    function drawShots(s, ctx) {
        s.shots.forEach(function (sh) {
            ctx.strokeStyle = TEAL; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.moveTo(sh.sx, sh.sy); ctx.lineTo(sh.x, sh.y); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = CREAM; ctx.fillRect(sh.x - 2, sh.y - 2, 4, 4);
            // The spot the shot was aimed at keeps blinking until it bursts.
            ctx.strokeStyle = Math.floor(G.t * 12) % 2 ? CREAM : PINK; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sh.tx - 5, sh.ty - 5); ctx.lineTo(sh.tx + 5, sh.ty + 5);
            ctx.moveTo(sh.tx + 5, sh.ty - 5); ctx.lineTo(sh.tx - 5, sh.ty + 5);
            ctx.stroke();
        });
    }

    function drawBlasts(s, ctx) {
        s.blasts.forEach(function (b) {
            var hue = b.hostile ? (Math.floor(G.t * 18) % 2 ? ORANGE : PINK) : BLAST_HUES[(Math.floor(G.t * 18) + b.id) % 4];
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = hue;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.5, 0, 6.3); ctx.fill();
            ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, 6.3); ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function drawCursor(s, ctx) {
        var c = s.cur, a = G.t * 2;
        ctx.strokeStyle = nearestBattery(s) ? CREAM : PINK; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i < 4; i++) {
            var ca = Math.cos(a + i * Math.PI / 2), sa = Math.sin(a + i * Math.PI / 2);
            ctx.moveTo(c.x + ca * 6, c.y + sa * 6); ctx.lineTo(c.x + ca * 15, c.y + sa * 15);
        }
        ctx.stroke();
        ctx.strokeStyle = PINK; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, 6.3); ctx.stroke();
    }

    // Wave announcements and the tally. Nothing is shown on a state that has
    // never been updated, so the title screen stays clean.
    function drawBanner(s, ctx) {
        var waves = s.cfg.n.length;
        if (s.phase === 'tally') {
            G.text('WAVE ' + (s.wave + 1) + ' REPELLED', G.W / 2, 190, { size: 30, bold: true, color: TEAL, align: 'center', glow: TEAL });
            G.text('BONUS ' + s.tally.sum, G.W / 2, 226, { size: 20, color: CREAM, align: 'center' });
            return;
        }
        if (s.waveT <= 0.05 || s.waveT > 2.4) return;
        var note = s.boss ? 'MOTHERSHIP INBOUND' : (night(s) ? 'BLACKOUT: WATCH THE TRAILS' : 'DEFEND THE DOMES');
        ctx.globalAlpha = Math.min(1, (2.4 - s.waveT) * 2);
        G.text('WAVE ' + (s.wave + 1) + ' OF ' + waves, G.W / 2, 190, { size: 30, bold: true, color: ORANGE, align: 'center', glow: ORANGE });
        G.text(note, G.W / 2, 226, { size: 20, color: CREAM, align: 'center' });
        ctx.globalAlpha = 1;
    }

    function draw(s, ctx) {
        drawSky(s, ctx);
        drawGround(s, ctx);
        drawSites(s, ctx);
        drawFoes(s, ctx);
        s.saucers.forEach(function (sc) { drawSaucer(s, ctx, sc); });
        if (s.boss) drawBoss(ctx, s.boss, s.touch);
        drawShots(s, ctx);
        drawBlasts(s, ctx);
        drawBanner(s, ctx);
        drawCursor(s, ctx);
    }

    // ------------------------------------------------------------------
    // The ending: the skyline the player saved
    // ------------------------------------------------------------------

    // Six domes rise one after another, as a rebuilt city does, in a fresh
    // foreground strip that covers the batteries' tally (and stays under the
    // engine's small print); searchlights sweep the sky and atomic
    // starbursts twinkle in the corners, clear of the engine's text.
    var END_K = 1.2;
    var BURSTS = [[70, 80], [890, 90], [250, 60], [710, 70], [130, 240], [830, 250], [60, 350], [900, 360]];

    function drawSkyline(ctx, t) {
        var span = G.W / END_K;
        ctx.fillStyle = '#160633';
        ctx.fillRect(0, GROUND, G.W, G.H - GROUND);
        ctx.fillStyle = PINK;
        ctx.fillRect(0, GROUND - 1, G.W, 2);
        ctx.save();
        ctx.translate(0, G.H - GROUND * END_K);
        ctx.scale(END_K, END_K);
        for (var i = 0; i < 6; i++) {
            drawCity(ctx, { x: span * (i + 0.5) / 6, i: i, alive: true, rise: G.clamp(1 - (t - 0.3 * i) / 0.8, 0, 1) }, false);
        }
        ctx.restore();
    }

    function drawSearchlights(ctx, t) {
        ctx.fillStyle = CREAM;
        ctx.globalAlpha = 0.09;
        for (var i = 0; i < 3; i++) {
            var x = G.W * (0.2 + 0.3 * i), y = GROUND - 40, a = -Math.PI / 2 + Math.sin(t * 0.7 + i * 2) * 0.6;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a - 0.07) * 700, y + Math.sin(a - 0.07) * 700);
            ctx.lineTo(x + Math.cos(a + 0.07) * 700, y + Math.sin(a + 0.07) * 700);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // A Googie starburst: four spokes that turn and breathe.
    function drawStarbursts(ctx, t) {
        ctx.lineWidth = 2;
        BURSTS.forEach(function (p, i) {
            var r = 8 + 6 * Math.abs(Math.sin(t * 2 + i)), a = t * 0.8 + i;
            ctx.strokeStyle = BLAST_HUES[(i + Math.floor(t * 2)) % 4];
            ctx.beginPath();
            for (var k = 0; k < 4; k++) {
                var c = Math.cos(a + k * Math.PI / 4) * r, sn = Math.sin(a + k * Math.PI / 4) * r;
                ctx.moveTo(p[0] - c, p[1] - sn); ctx.lineTo(p[0] + c, p[1] + sn);
            }
            ctx.stroke();
        });
    }

    var ENDING = {
        title: 'CITIES SAVED',
        text: 'The domes shine on into the atomic age.',
        colors: [TEAL, PINK, ORANGE, CREAM],
        draw: function (e, ctx) { drawSearchlights(ctx, e.t); drawStarbursts(ctx, e.t); drawSkyline(ctx, e.t); }
    };

    function hud(s) {
        if (s.touch) return 'W' + (s.wave + 1) + '/' + s.cfg.n.length + ' AMMO ' + ammoLeft(s) + (s.spare ? ' +' + s.spare + ' CITY' : '');
        return 'WAVE ' + (s.wave + 1) + '/' + s.cfg.n.length + '  AMMO ' + ammoLeft(s) + (s.spare ? '  +' + s.spare + ' CITY' : '');
    }

    G.register('retrofuture', {
        title: 'ATOMIC DEFENSE',
        blurb: 'Burst your missiles where the warheads will be. Keep one dome standing.',
        controls: [
            'Click / TAP the sky to aim and fire',
            'Arrows / pad aim · SPACE / FIRE shoots',
            'Lead the warheads · Blasts chain together',
            'Ammo refills each wave · 3000 points restore a city'
        ],
        levelNames: ['First Light', 'Split Atoms', 'Doomsday'],
        colors: { bg: BG, fg: CREAM, accent: TEAL, dim: '#a595c4' },
        lives: 3,
        // A bright, bouncy major tune with a sine lead for the theremin feel.
        music: {
            bpm: 132, root: 48, scale: 'major', prog: [0, 3, 4, 0, 0, 5, 3, 4],
            bass: 'x..o..x.5..o.x..',
            lead: [
                '0.2.4.7.9-7.4...', '3.5.7.a.c-a.7...', '4.6.8.b.d-b.8...', '9.7.4.7.9---7...',
                '7...9.7.4.2.4...', '5.7.9.c.9-7.5...', 'a.9.7.5.3-5.7...', '8.6.4.6.8---....'
            ],
            arp: '0.1.2.3.2.1.', drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: '..x...x...x...x.' },
            leadWave: 'sine', bassWave: 'triangle', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud, cursor: 'crosshair', ending: ENDING,
        // A tap on the canvas aims and fires at once, which is all a phone
        // needs; the stick plus FIRE stays for those whose finger would hide
        // the target. Nothing is on B.
        touch: { a: 'FIRE', hide: ['b'] }
    });
})();
