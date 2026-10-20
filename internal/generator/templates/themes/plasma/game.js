/*
 * Plasma Storm — the plasma theme's game: a vertical bullet-hell shooter.
 *
 * Enemies arrive in scripted waves and fill the sky with aimed, radial and
 * spiral bullet patterns; each of the three levels ends with a boss that
 * fights in phases, and THE EYE at the end of level 3 blooms into the
 * finale's plasma fireworks.
 * Holding fire slows the ship and shows its tiny hitbox, so the player can
 * thread through the gaps. Passing close to a bullet ("graze") scores and
 * slowly earns bombs. Killed enemies drop plasma orbs that cycle through three
 * colours while they fall: three of one colour merge into a level of that
 * weapon (cyan spread, magenta beam, yellow homing).
 *
 * Bullet colours tell the pattern: magenta is aimed at you, cyan is a radial
 * ring, yellow is everything else (spirals, rain, trails, straight drops).
 *
 * On a phone (coarse pointer) the ship fires by itself, so no thumb has to
 * hold a button down: a finger dragged anywhere on the canvas steers (the
 * ship copies the finger's movement, it does not jump under it, so the thumb
 * never hides the ship), or the pad steers with A to slow down. Bullets fly
 * a little slower there, because the picture is small and partly covered.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var CY = '#00f0ff', MG = '#ff00e0', YL = '#ffee00', FG = '#e8e0ff', BG = '#050008';
    var TAU = Math.PI * 2, DOWN = Math.PI / 2;
    var SPEED = 340, FOCUS = 170;          // ship speed, and while firing
    // Phone only: how far the ship moves per unit of finger travel (a thumb
    // must cross the field without leaving the canvas), the ship's top speed
    // under a finger, and the factor on every bullet's speed.
    var DRAG_GAIN = 1.5, DRAG_SPEED = 425, TOUCH_BULLETS = 0.85;
    var HIT_R = 3, GRAZE_R = 24;           // the real hitbox is a dot; grazing is generous
    var MAX_BULLETS = 700, MAX_BOMBS = 5, MAX_WEAPON = 3;
    var LANE_W = 26, LANE_WARN = 1.0, LANE_LIVE = 0.55;
    var CROWD = 12;                        // more enemies than this hold the next wave back
    var FINALE = 3;                        // the last level: the storm's eye
    var WEAPONS = ['spread', 'beam', 'homing'];
    var WCOL = { spread: CY, beam: MG, homing: YL };

    // One string per level; each word is a wave, each letter a squad that
    // arrives with it. Level 1 teaches drones, spinners and weavers; level 2
    // brings lancers, darts, turrets and mines; level 3 adds wardens and
    // prisms to everything, with more squads to a wave.
    var WAVES = [
        'd d s ds w dw sd sdw',
        'l a ld t as lw m dm ta ml lsa tmw',
        'g p gd pw ga pm gl pt gsa pdm gtl pmw'
    ];
    var LETTER = { d: 'drone', s: 'spinner', w: 'weaver', l: 'lancer', t: 'turret', a: 'dart', m: 'mine', g: 'warden', p: 'prism' };

    // A boss fights through its phases in order; each phase runs one or more
    // of the PATTERNS below at the same time and owns an equal share of hp.
    // Each boss has one phase more than the last and teaches what the next
    // one combines: EMBER fans and rings, CYCLONE crosses, lances and
    // spirals, THE EYE all of it with curving rings and a summoned swarm.
    var BOSSES = [
        { name: 'EMBER', hp: 320, phases: [['fan'], ['rings']] },
        { name: 'CYCLONE', hp: 1200, phases: [['cross'], ['lances', 'rain'], ['spiral', 'fan']] },
        { name: 'THE EYE', hp: 2200, phases: [['lances', 'curve'], ['cross', 'rain'], ['spiral', 'fan'], ['summon', 'rings', 'lances']] }
    ];

    // The weapons a level starts with: weapon levels do not carry over
    // (each level starts from init), so later levels hand out a kit.
    var KITS = [
        { spread: 0, beam: 0, homing: 0 },
        { spread: 1, beam: 0, homing: 0 },
        { spread: 1, beam: 1, homing: 1 }
    ];

    // ------------------------------------------------------------------
    // Small helpers: gated sounds, bullets and bullet patterns
    // ------------------------------------------------------------------

    // Returns true at most once per `gap` seconds for a key, so sounds fired
    // from per-bullet or per-tick code never stack into a buzz.
    function gated(s, key, gap) {
        if (s.snd[key] > 0) return false;
        s.snd[key] = gap;
        return true;
    }

    function boomSound(s, size) {
        if (!gated(s, 'boom', 0.05)) return;
        G.noise(0.16 + size * 0.012, { freq: 1700 - size * 28, slide: 80, vol: 0.12 + size * 0.006 });
        G.tone(230 - size * 4, 0.14, { type: 'triangle', slide: 45, vol: 0.12 });
    }

    // o: {r, w (turn rate in rad/s, for curving bullets), life}
    function shoot(s, x, y, ang, speed, col, o) {
        if (s.bullets.length >= MAX_BULLETS) return;
        var v = speed * s.bk;
        s.bullets.push({
            x: x, y: y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, col: col, grazed: false,
            // The turn rate scales with the speed, so a curve keeps its shape.
            r: (o && o.r) || 5, w: ((o && o.w) || 0) * s.bk / s.k, life: (o && o.life) || 12
        });
    }

    function aimAt(s, x, y) { return Math.atan2(s.p.y - y, s.p.x - x); }

    function fan(s, e, n, gap, speed, col, o) {
        var a = aimAt(s, e.x, e.y);
        for (var i = 0; i < n; i++) shoot(s, e.x, e.y, a + (i - (n - 1) / 2) * gap, speed, col, o);
    }

    function ring(s, x, y, n, speed, off, col, o) {
        for (var i = 0; i < n; i++) shoot(s, x, y, off + i * TAU / n, speed, col, o);
    }

    // A lane is a vertical beam that shows a thin warning line first. It dies
    // with its owner, so killing a warden mid-charge cancels its shot.
    function addLane(s, x, owner) {
        s.lanes.push({ x: x, y: owner.y, t: 0, owner: owner });
        if (gated(s, 'charge', 0.2)) G.tone(240, LANE_WARN, { type: 'sawtooth', slide: 1500, vol: 0.07 });
    }

    // Turns every bullet into a spark; a bomb or a broken boss phase pays for them.
    function cancelBullets(s, reward) {
        s.bullets.forEach(function (b) {
            G.burst(b.x, b.y, { n: 1, color: b.col, speed: 70, life: 0.4, size: 3 });
        });
        if (reward) G.addScore(s.bullets.length * 5 * s.level);
        s.bullets = [];
        s.lanes = [];
    }

    // ------------------------------------------------------------------
    // Enemies: movement and fire per type
    // ------------------------------------------------------------------

    function moveDrone(e, s, dt) {
        e.y += 92 * dt;
        e.x = e.x0 + Math.sin(e.age * 1.8 + e.ph) * 85;
        if (e.y > G.H + 30) e.gone = true;
    }

    // Drones low on the screen hold fire: a point-blank aimed shot is not fair.
    function fireDrone(e, s) {
        if (e.y < 380) fan(s, e, s.level >= 2 ? 3 : 1, 0.26, 170, MG);
    }

    // Slides to its post, holds it for def.stay seconds, then retreats upward.
    // Types with def.track also drift toward the player's column.
    function moveHover(e, s, dt) {
        var d = TYPES[e.type];
        if (e.age > d.stay) {
            e.y -= 130 * dt;
            if (e.y < -40) e.gone = true;
            return;
        }
        e.y += (e.ty - e.y) * Math.min(1, dt * 2.5);
        if (e.lock > 0) e.lock -= dt;
        else if (d.track) e.x += G.clamp(s.p.x - e.x, -1, 1) * d.track * dt;
    }

    function fireSpinner(e, s) {
        ring(s, e.x, e.y, 10 + s.level * 2, 115, e.age, CY);
        G.tone(520, 0.08, { type: 'triangle', slide: 260, vol: 0.06 });
    }

    function moveWeaver(e, s, dt) {
        e.x += e.dir * 150 * dt;
        e.y = e.ty + Math.sin(e.age * 3 + e.ph) * 18;
        if (e.dir > 0 ? e.x > G.W + 40 : e.x < -40) e.gone = true;
    }

    function fireWeaver(e, s) { shoot(s, e.x, e.y, DOWN, 175, YL); }

    // Five shots on one line at rising speed: they arrive as a stretched lance.
    function fireLancer(e, s) {
        var a = aimAt(s, e.x, e.y);
        for (var i = 0; i < 5; i++) shoot(s, e.x, e.y, a, 190 + i * 28, MG, { r: 4 });
        G.tone(900, 0.1, { type: 'sawtooth', slide: 300, vol: 0.06 });
    }

    function moveTurret(e, s, dt) {
        e.y += 38 * dt;
        if (e.y > G.H + 40) e.gone = true;
    }

    // Like drones, a turret that has sunk to the player's altitude holds fire.
    function fireTurret(e, s) {
        if (e.y < 380) ring(s, e.x, e.y, 3, 135, e.age * 2.4, YL);
    }

    // Hangs at the top for a moment, locks on to where the player is, then
    // dashes along that line. The lock is what makes it dodgeable.
    function moveDart(e, s, dt) {
        if (e.ang == null) {
            e.y += (e.ty - e.y) * Math.min(1, dt * 4);
            if (e.age < 0.9) return;
            e.ang = aimAt(s, e.x, e.y);
            e.sp = 60;
            if (gated(s, 'dart', 0.1)) G.tone(1900, 0.25, { type: 'sawtooth', slide: 320, vol: 0.07 });
            return;
        }
        e.sp = Math.min(560, e.sp + 800 * dt);
        e.x += Math.cos(e.ang) * e.sp * dt;
        e.y += Math.sin(e.ang) * e.sp * dt;
        if (e.x < -40 || e.x > G.W + 40 || e.y > G.H + 40 || e.y < -60) e.gone = true;
    }

    // A dashing dart leaves a short-lived wall of nearly still bullets behind.
    function fireDart(e, s) {
        if (e.ang != null) shoot(s, e.x, e.y, DOWN, 18, YL, { r: 4, life: 2.4 });
    }

    function moveMine(e, s, dt) {
        e.y += 55 * dt;
        e.x = e.x0 + Math.sin(e.age + e.ph) * 20;
        if (e.y > G.H + 30) e.gone = true;
    }

    // A mine's "shot" is its fuse running out: shoot it first and it dies quietly.
    function detonateMine(e, s) {
        ring(s, e.x, e.y, 14, 150, e.ph, CY);
        e.gone = true;
        G.burst(e.x, e.y, { n: 16, color: YL, speed: 240, life: 0.5 });
        boomSound(s, 22);
    }

    // The warden stops tracking while its lane charges and fires.
    function fireWarden(e, s) {
        e.lock = LANE_WARN + LANE_LIVE;
        addLane(s, e.x, e);
    }

    // Aimed fans whose bullets curve, alternately left and right.
    function firePrism(e, s) {
        e.flip = !e.flip;
        fan(s, e, 8, 0.2, 150, MG, { w: e.flip ? 0.6 : -0.6 });
        G.tone(660, 0.12, { type: 'sine', slide: 1320, vol: 0.07 });
    }

    // hp, radius, score, colour, seconds between shots, orb drop chance, and
    // the look: polygon sides, spin (rad/s), fixed rotation, spiky outline.
    // `swarm` marks the weak types that arrive many to a squad.
    var TYPES = {
        drone: { swarm: true, hp: 3, r: 13, pts: 50, col: CY, rate: 1.9, drop: 0.2, move: moveDrone, fire: fireDrone, sides: 3, rot: DOWN },
        spinner: { hp: 14, r: 17, pts: 150, col: MG, rate: 1.9, drop: 0.6, move: moveHover, fire: fireSpinner, stay: 7, sides: 6, spin: 2 },
        weaver: { swarm: true, hp: 4, r: 12, pts: 70, col: YL, rate: 1.15, drop: 0.2, move: moveWeaver, fire: fireWeaver, sides: 4 },
        lancer: { hp: 12, r: 15, pts: 180, col: MG, rate: 1.7, drop: 0.5, move: moveHover, fire: fireLancer, stay: 8, track: 40, sides: 5, rot: DOWN },
        turret: { hp: 45, r: 22, pts: 400, col: YL, rate: 0.12, drop: 1, move: moveTurret, fire: fireTurret, sides: 8, spin: 0.6 },
        dart: { swarm: true, hp: 4, r: 11, pts: 90, col: MG, rate: 0.13, drop: 0.15, move: moveDart, fire: fireDart, sides: 3, rot: DOWN },
        mine: { swarm: true, hp: 8, r: 14, pts: 120, col: YL, rate: 5.5, first: 1, drop: 0.25, move: moveMine, fire: detonateMine, sides: 16, spin: 1, star: true },
        warden: { hp: 22, r: 18, pts: 300, col: CY, rate: 3.4, drop: 0.6, move: moveHover, fire: fireWarden, stay: 11, track: 80, sides: 4, rot: Math.PI / 4 },
        prism: { hp: 30, r: 20, pts: 350, col: CY, rate: 1.5, drop: 0.8, move: moveHover, fire: firePrism, stay: 10, sides: 3, spin: -1.5 }
    };

    function addEnemy(s, type, x, y, o) {
        var d = TYPES[type], e = {
            type: type, squad: s.squad, x: x, y: y, x0: x, ty: y, ph: 0, dir: 1, delay: 0, age: 0, flash: 0, lock: 0,
            hp: Math.ceil(d.hp * (1 + (s.level - 1) * 0.2)),
            cool: d.rate * (d.first || 0.4 + s.rnd() * 0.6)
        };
        for (var k in o) e[k] = o[k];
        s.enemies.push(e);
    }

    // Formations, one per wave letter. They draw from the level's seeded
    // generator, so a level's waves are the same on every visit.
    var SPAWN = {
        d: function (s, n) {
            var x = 150 + s.rnd() * 660, ph = s.rnd() * TAU;
            for (var i = 0; i < 4 + n; i++) addEnemy(s, 'drone', x, -30 - i * 40, { ph: ph - i * 0.75 });
        },
        s: function (s) {
            for (var i = 0; i < (s.level >= FINALE ? 2 : 1); i++) addEnemy(s, 'spinner', 120 + s.rnd() * 720, -30, { ty: 90 + s.rnd() * 100 });
        },
        w: function (s, n) {
            var dir = s.rnd() < 0.5 ? 1 : -1, ty = 70 + s.rnd() * 110;
            for (var i = 0; i < 5 + n; i++) addEnemy(s, 'weaver', dir > 0 ? -30 - i * 64 : G.W + 30 + i * 64, ty, { dir: dir, ph: i * 0.6 });
        },
        l: function (s) {
            addEnemy(s, 'lancer', 160 + s.rnd() * 220, -30, { ty: 80 });
            addEnemy(s, 'lancer', 580 + s.rnd() * 220, -30, { ty: 80 });
        },
        t: function (s) {
            for (var i = 0; i < (s.level >= FINALE ? 2 : 1); i++) addEnemy(s, 'turret', 200 + s.rnd() * 560, -30);
        },
        a: function (s, n) {
            for (var i = 0; i < 3 + n; i++) addEnemy(s, 'dart', 80 + s.rnd() * 800, -20, { ty: 50 + s.rnd() * 40, delay: i * 0.4 });
        },
        m: function (s, n) {
            for (var i = 0; i < 3 + n; i++) addEnemy(s, 'mine', 90 + s.rnd() * 780, -20 - s.rnd() * 70, { ph: s.rnd() * TAU });
        },
        g: function (s) {
            addEnemy(s, 'warden', 120 + s.rnd() * 300, -30, { ty: 62 });
            addEnemy(s, 'warden', 540 + s.rnd() * 300, -30, { ty: 62 });
        },
        p: function (s) {
            addEnemy(s, 'prism', 180 + s.rnd() * 600, -30, { ty: 100 + s.rnd() * 40 });
        }
    };

    // An enemy can be hit and can fire only once it is really on the screen.
    function live(e) { return !e.gone && e.delay <= 0 && e.y > G.HUD - 4 && e.x > -10 && e.x < G.W + 10; }

    function dropOrb(s, x, y) {
        s.drops.push({ x: x, y: y, t: s.rnd() * 4.8 });
    }

    function kill(s, e) {
        var d = TYPES[e.type];
        e.gone = true;
        G.addScore(d.pts * s.level);
        G.popup(e.x, Math.max(G.HUD + 30, e.y - d.r), d.pts * s.level, d.col);   // popups rise: keep them off the HUD
        G.burst(e.x, e.y, { n: 8 + d.r, color: d.col, speed: 220, life: 0.5 });
        boomSound(s, d.r);
        // The last of a swarm always drops an orb, so even level 1 (drones
        // only) hands out enough orbs to merge; the rest drop by chance.
        var last = d.swarm && !s.enemies.some(function (o) { return o !== e && !o.gone && o.squad === e.squad; });
        if (last || s.rnd() < d.drop) dropOrb(s, e.x, e.y);
        // The storm's eye: on the finale every wreck fires one parting
        // shot, unless it died too close for that to be dodgeable. The shot
        // is slower than a drone's: a swarm dying at once fires a whole volley.
        if (s.level === FINALE && s.stage !== 'outro' && e.y < s.p.y - 200) fan(s, e, 1, 0, 150, MG, { r: 4 });
    }

    function damage(s, e, dmg) {
        if (e.gone) return;
        e.hp -= dmg;
        e.flash = 0.06;
        if (gated(s, 'hit', 0.06)) G.tone(340 + e.hp * 6, 0.03, { type: 'square', vol: 0.045 });
        if (e.hp <= 0) kill(s, e);
    }

    function updateEnemy(s, e, dt) {
        if (e.delay > 0) { e.delay -= dt; return; }
        var d = TYPES[e.type];
        e.age += dt;
        if (e.flash > 0) e.flash -= dt;
        d.move(e, s, dt);
        if (e.gone) return;
        if (G.circ(s.p.x, s.p.y, HIT_R, e.x, e.y, d.r * 0.7)) s.struck = true;
        e.cool -= dt;
        if (e.cool <= 0 && live(e) && e.y < G.H) {
            d.fire(e, s);
            e.cool = d.rate / s.k;
        }
    }

    function updateEnemies(s, dt) {
        s.enemies.forEach(function (e) { updateEnemy(s, e, dt); });
        s.enemies = s.enemies.filter(function (e) { return !e.gone; });
    }

    // ------------------------------------------------------------------
    // Boss
    // ------------------------------------------------------------------

    // Per-pattern stopwatch: true once every `interval` seconds.
    function every(b, key, interval, dt) {
        b.pt[key] = (b.pt[key] || 0) + dt;
        if (b.pt[key] < interval) return false;
        b.pt[key] -= interval;
        return true;
    }

    var PATTERNS = {
        fan: function (s, b, dt) {
            if (!every(b, 'fan', 0.9 / s.k, dt)) return;
            // 5, 7, 9 wide: nine is the widest that leaves room beside a spiral.
            fan(s, b, 3 + 2 * s.level, 0.17, 185, MG);
            G.tone(700, 0.1, { type: 'sawtooth', slide: 250, vol: 0.06 });
        },
        rings: function (s, b, dt) {
            if (!every(b, 'rings', 1.1 / s.k, dt)) return;
            var n = 14 + s.level * 4;
            b.flip = !b.flip;
            ring(s, b.x, b.y, n, 125, b.flip ? 0 : Math.PI / n, CY);
            G.tone(420, 0.12, { type: 'triangle', slide: 210, vol: 0.07 });
        },
        spiral: function (s, b, dt) {
            // Five arms at most (level 3): a sixth closes the gaps a casual
            // player can still steer through at the finale's bullet speed.
            if (every(b, 'spiral', 0.09, dt)) ring(s, b.x, b.y, 2 + s.level, 150, b.age * 1.9, YL);
        },
        cross: function (s, b, dt) {
            if (!every(b, 'cross', 0.13, dt)) return;
            var arms = 1 + s.level;
            ring(s, b.x, b.y, arms, 150, b.age * 2.1, YL);
            ring(s, b.x, b.y, arms, 130, -b.age * 2.1, YL);
        },
        rain: function (s, b, dt) {
            if (!every(b, 'rain', 0.09 / s.k, dt)) return;
            shoot(s, b.x + (s.rnd() - 0.5) * 420, b.y, DOWN + (s.rnd() - 0.5) * 0.5, 150 + s.rnd() * 70, YL, { r: 4 });
        },
        curve: function (s, b, dt) {
            if (!every(b, 'curve', 1.5 / s.k, dt)) return;
            b.flip = !b.flip;
            ring(s, b.x, b.y, 10 + s.level * 3, 135, b.age, CY, { w: b.flip ? 0.55 : -0.55 });
            G.tone(560, 0.14, { type: 'sine', slide: 1120, vol: 0.07 });
        },
        lances: function (s, b, dt) {
            if (!every(b, 'lances', 2.9 / s.k, dt)) return;
            addLane(s, s.p.x, b);
            addLane(s, 80 + s.rnd() * 800, b);
            addLane(s, 80 + s.rnd() * 800, b);
        },
        summon: function (s, b, dt) {
            if (!every(b, 'summon', 4.5 / s.k, dt) || s.enemies.length >= 6) return;
            s.squad++;
            SPAWN.d(s, -1);
        }
    };

    function spawnBoss(s) {
        var def = BOSSES[s.level - 1], n = def.phases.length;
        // `hold` is a spell of invulnerability with no attacks: the entrance,
        // and the breather after each broken phase.
        s.boss = { x: G.W / 2, y: -70, r: 44, age: 0, phase: 0, n: n, per: def.hp / n, hp: def.hp / n, pt: {}, hold: 2, flash: 0, flip: false, dead: false };
    }

    function bossOpen(s) { return !!s.boss && !s.boss.dead && s.boss.hold <= 0; }

    function bossDown(s) {
        var b = s.boss;
        b.dead = true;
        s.stage = 'outro';
        s.stageT = 1.8;
        s.enemies.forEach(function (e) { if (live(e)) kill(s, e); });
        G.addScore(2000 * s.level);
        G.popup(b.x, b.y, 2000 * s.level, YL);
        G.sfx('bigboom');
        G.shake(14, 0.8);
        G.flash('#fff', 0.3);
    }

    function nextPhase(s) {
        var b = s.boss;
        b.phase++;
        cancelBullets(s, true);
        if (b.phase >= b.n) { bossDown(s); return; }
        b.hp = b.per; b.hold = 1.4; b.pt = {};
        dropOrb(s, b.x, b.y + 30);
        G.burst(b.x, b.y, { n: 40, color: MG, speed: 320, life: 0.7 });
        G.noise(0.5, { freq: 2400, slide: 120, vol: 0.3 });
        G.tone(110, 0.5, { type: 'sawtooth', slide: 440, vol: 0.14 });
        G.shake(9, 0.4);
    }

    function damageBoss(s, dmg) {
        var b = s.boss;
        if (!bossOpen(s)) return;
        b.hp -= dmg;
        b.flash = 0.06;
        if (gated(s, 'hit', 0.06)) G.tone(180, 0.03, { type: 'square', vol: 0.05 });
        if (b.hp <= 0) nextPhase(s);
    }

    function updateBoss(s, dt) {
        var b = s.boss;
        b.age += dt;
        if (b.flash > 0) b.flash -= dt;
        b.x = G.W / 2 + Math.sin(b.age * 0.55) * 230;
        b.y += (96 + Math.sin(b.age * 1.1) * 14 - b.y) * Math.min(1, dt * 2);
        if (G.circ(s.p.x, s.p.y, HIT_R, b.x, b.y, b.r * 0.7)) s.struck = true;
        if (b.hold > 0) { b.hold -= dt; return; }
        BOSSES[s.level - 1].phases[b.phase].forEach(function (name) { PATTERNS[name](s, b, dt); });
    }

    // ------------------------------------------------------------------
    // Level flow: waves, boss warning, boss, outro
    // ------------------------------------------------------------------

    function spawnWave(s, word) {
        var n = s.level - 1;          // extra ships per swarm squad
        for (var i = 0; i < word.length; i++) { s.squad++; SPAWN[word.charAt(i)](s, n); }
    }

    function runWaves(s, dt) {
        var busy = s.enemies.length > 0;
        s.waveT -= dt;
        // An empty sky is dead time: bring the next wave in right away
        // (but never cut the opening pause before the first wave short).
        if (!busy && s.wave > 0 && s.waveT > 0.6) s.waveT = 0.6;
        if (s.wave >= s.waves.length) {
            if (!busy) { s.stage = 'warning'; s.stageT = 2.4; }
            return;
        }
        // A crowded sky holds the next wave back: waves must not pile up
        // faster than they can be cleared. This cannot stall a level, since
        // every enemy leaves the screen by itself sooner or later.
        if (s.waveT > 0 || s.enemies.length > CROWD) return;
        spawnWave(s, s.waves[s.wave++]);
        s.waveT = 6.2 - s.level * 0.8;
    }

    function outro(s, dt) {
        var b = s.boss;
        s.stageT -= dt;
        if (gated(s, 'outro', 0.14)) {
            G.burst(b.x + G.rnd(-50, 50), b.y + G.rnd(-40, 40), { n: 14, color: G.pick([CY, MG, YL]), speed: 260, life: 0.6 });
            G.noise(0.2, { freq: 1200, slide: 90, vol: 0.2 });
        }
        if (s.stageT <= 0) G.win(1000 * s.level + G.lives * 500 + s.bombs * 200);
    }

    function updateStage(s, dt) {
        if (s.stage === 'waves') { runWaves(s, dt); return; }
        if (s.stage === 'boss') { updateBoss(s, dt); return; }
        if (s.stage === 'outro') { outro(s, dt); return; }
        s.stageT -= dt;
        if (gated(s, 'siren', 0.6)) G.tone(330, 0.5, { type: 'sawtooth', slide: 660, vol: 0.12 });
        if (s.stageT <= 0) { s.stage = 'boss'; spawnBoss(s); }
    }

    // ------------------------------------------------------------------
    // Player: movement, weapons, bomb, orbs
    // ------------------------------------------------------------------

    // Phone: while a finger rests on the canvas, the point the ship flies to.
    // It starts at the ship and then moves as the finger moves, wherever the
    // finger is (a phone has no hover, and a ship under the thumb is unseen).
    function dragTarget(s) {
        var m = G.mouse, d = s.drag;
        if (!s.touch || !m.down) { s.drag = null; return null; }
        if (!d) d = s.drag = { mx: m.x, my: m.y, x: s.p.x, y: s.p.y };
        d.x = G.clamp(d.x + (m.x - d.mx) * DRAG_GAIN, 14, G.W - 14);
        d.y = G.clamp(d.y + (m.y - d.my) * DRAG_GAIN, G.HUD + 14, G.H - 14);
        d.mx = m.x; d.my = m.y;
        return d;
    }

    // The ship chases the drag point at a capped speed: an instant jump would
    // carry it straight through a wall of bullets.
    function followDrag(p, d, dt) {
        var speed = G.key.a ? FOCUS : DRAG_SPEED;
        var dist = G.dist(p.x, p.y, d.x, d.y), step = Math.min(dist, speed * dt);
        if (dist < 0.01) return 0;
        p.x += (d.x - p.x) / dist * step;
        p.y += (d.y - p.y) / dist * step;
        return G.clamp((d.x - p.x) / 12, -1, 1);
    }

    function movePlayer(s, dt) {
        var p = s.p, d = dragTarget(s);
        var dx = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0), dy = (G.key.down ? 1 : 0) - (G.key.up ? 1 : 0);
        var sp = (G.key.a ? FOCUS : SPEED) / (dx && dy ? Math.SQRT2 : 1);
        if (d) dx = followDrag(p, d, dt);
        else {
            p.x = G.clamp(p.x + dx * sp * dt, 14, G.W - 14);
            p.y = G.clamp(p.y + dy * sp * dt, G.HUD + 14, G.H - 14);
        }
        p.lean += (dx - p.lean) * Math.min(1, dt * 10);   // the ship banks into a turn
        p.focus = s.touch || G.key.a;                     // a phone fires by itself: A only slows
    }

    function pushShot(s, x, y, ang, speed, dmg, homing) {
        s.shots.push({ x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: dmg, homing: homing, life: homing ? 2.2 : 1 });
    }

    function volley(s) {
        var p = s.p;
        pushShot(s, p.x - 7, p.y - 10, -DOWN, 760, 1, false);
        pushShot(s, p.x + 7, p.y - 10, -DOWN, 760, 1, false);
        for (var i = 1; i <= s.lv.spread; i++) {
            // A narrow fan: from the lower screen it still reaches a boss.
            pushShot(s, p.x, p.y - 8, -DOWN - i * 0.07, 760, 1, false);
            pushShot(s, p.x, p.y - 8, -DOWN + i * 0.07, 760, 1, false);
        }
        if (gated(s, 'shot', 0.17)) G.tone(1250, 0.04, { type: 'triangle', slide: 700, vol: 0.035 });
    }

    function launchMissiles(s) {
        var p = s.p, n = s.lv.homing;
        for (var i = 0; i < n; i++) pushShot(s, p.x, p.y, -DOWN + (i - (n - 1) / 2) * 0.8, 420, 3, true);
        G.noise(0.1, { filter: 'bandpass', freq: 900, slide: 2600, vol: 0.05 });
    }

    // The beam pierces: it burns everything in the ship's column at once.
    function beamDamage(s, dt) {
        var p = s.p, half = 3 + s.lv.beam * 2, dmg = 14 * s.lv.beam * dt;
        s.enemies.forEach(function (e) {
            if (live(e) && e.y < p.y && Math.abs(e.x - p.x) < TYPES[e.type].r + half) damage(s, e, dmg);
        });
        if (bossOpen(s) && Math.abs(s.boss.x - p.x) < s.boss.r + half) damageBoss(s, dmg);
        if (gated(s, 'beam', 0.12)) G.tone(96 + s.lv.beam * 12, 0.14, { type: 'sawtooth', vol: 0.045 });
    }

    function fireWeapons(s, dt) {
        var p = s.p;
        s.beamOn = p.focus && s.lv.beam > 0;
        if (p.cool > 0) p.cool -= dt;
        if (p.missile > 0) p.missile -= dt;
        if (!p.focus) return;
        if (p.cool <= 0) { p.cool = 0.085; volley(s); }
        if (s.lv.homing && p.missile <= 0) { p.missile = 0.42; launchMissiles(s); }
        if (s.beamOn) beamDamage(s, dt);
    }

    function nearestTarget(s, x, y) {
        var best = bossOpen(s) ? s.boss : null, bd = best ? G.dist(x, y, best.x, best.y) : Infinity;
        s.enemies.forEach(function (e) {
            var d = live(e) ? G.dist(x, y, e.x, e.y) : Infinity;
            if (d < bd) { bd = d; best = e; }
        });
        return best;
    }

    // Missiles turn toward the nearest target at a limited rate, so they arc.
    function steer(s, sh, dt) {
        var t = nearestTarget(s, sh.x, sh.y);
        if (!t) return;
        var cur = Math.atan2(sh.vy, sh.vx), want = Math.atan2(t.y - sh.y, t.x - sh.x);
        var d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        cur += G.clamp(d, -7 * dt, 7 * dt);
        sh.vx = Math.cos(cur) * 420; sh.vy = Math.sin(cur) * 420;
    }

    function shotHits(s, sh) {
        for (var i = 0; i < s.enemies.length; i++) {
            var e = s.enemies[i];
            if (!live(e) || !G.circ(sh.x, sh.y, 4, e.x, e.y, TYPES[e.type].r)) continue;
            damage(s, e, sh.dmg);
            return true;
        }
        if (!bossOpen(s) || !G.circ(sh.x, sh.y, 4, s.boss.x, s.boss.y, s.boss.r)) return false;
        damageBoss(s, sh.dmg);
        return true;
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (sh) {
            if (sh.homing) steer(s, sh, dt);
            sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
            if (sh.life <= 0 || sh.y < G.HUD - 10 || sh.y > G.H + 10 || sh.x < -10 || sh.x > G.W + 10) return false;
            return !shotHits(s, sh);
        });
    }

    function gainBomb(s) {
        // With a full rack the bomb is paid out in points instead.
        if (s.bombs >= MAX_BOMBS) { payMerge(s); return; }
        s.bombs++;
        G.popup(s.p.x, s.p.y - 26, '+BOMB', FG);
        G.tone(784, 0.1, { type: 'triangle', vol: 0.14 });
        G.tone(1568, 0.25, { type: 'triangle', vol: 0.14, delay: 0.1 });
    }

    // A merge on a weapon already at its top level is paid in points, not in
    // a bomb: the finale showers orbs on a maxed ship, and a bomb for each
    // would make it easier than the level before.
    function payMerge(s) {
        G.addScore(2000 * s.level);
        G.popup(s.p.x, s.p.y - 26, '+' + 2000 * s.level, FG);
        G.sfx('coin');
    }

    function useBomb(s) {
        if (!G.hit.b || s.bombs <= 0 || s.bombT > 0 || s.stage === 'outro') return;
        s.bombs--;
        s.bombT = 0.9;
        s.p.inv = Math.max(s.p.inv, 2);
        s.enemies.forEach(function (e) { if (live(e)) damage(s, e, 30); });
        damageBoss(s, 60);
        cancelBullets(s, true);
        G.noise(0.9, { freq: 300, slide: 5000, vol: 0.35 });
        G.tone(60, 0.8, { type: 'sine', slide: 28, vol: 0.4 });
        G.flash(CY, 0.25);
        G.shake(10, 0.4);
    }

    // The orb's colour follows its own clock, so the player can wait for the
    // colour they are collecting.
    function orbKind(o) { return WEAPONS[Math.floor(o.t / 1.6) % 3]; }

    function collect(s, kind) {
        var n = ++s.orbs[kind];
        G.addScore(100 * s.level);
        G.tone(520 * n, 0.12, { type: 'sine', vol: 0.16 });
        if (n < 3) return;
        s.orbs[kind] = 0;
        if (s.lv[kind] >= MAX_WEAPON) { payMerge(s); return; }
        s.lv[kind]++;
        G.popup(s.p.x, s.p.y - 26, kind.toUpperCase() + ' LV' + s.lv[kind], WCOL[kind]);
        G.flash(WCOL[kind], 0.18);
        [392, 523, 659, 1047].forEach(function (f, i) {
            G.tone(f, 0.16, { type: 'sawtooth', vol: 0.1, delay: i * 0.07 });
        });
    }

    function updateDrops(s, dt) {
        var p = s.p;
        s.drops = s.drops.filter(function (o) {
            var d = G.dist(o.x, o.y, p.x, p.y);
            o.t += dt;
            o.y += 70 * dt;
            // Close orbs are pulled in, so collecting never needs pixel work.
            if (d < 110 && d > 1) { o.x += (p.x - o.x) / d * 320 * dt; o.y += (p.y - o.y) / d * 320 * dt; }
            if (d < 22) { collect(s, orbKind(o)); return false; }
            return o.y < G.H + 20;
        });
    }

    // ------------------------------------------------------------------
    // Bullets, lanes and getting hit
    // ------------------------------------------------------------------

    function graze(s, b) {
        b.grazed = true;
        s.graze++;
        G.addScore(10 * s.level);
        G.burst(b.x, b.y, { n: 1, color: '#fff', speed: 60, life: 0.25, size: 2 });
        if (gated(s, 'graze', 0.05)) G.tone(1800 + (s.graze % 8) * 90, 0.03, { type: 'sine', vol: 0.05 });
        if (s.graze % 40 === 0) gainBomb(s);
    }

    function updateBullets(s, dt) {
        var p = s.p;
        s.bullets = s.bullets.filter(function (b) {
            if (b.w) {
                var c = Math.cos(b.w * dt), sn = Math.sin(b.w * dt), vx = b.vx;
                b.vx = vx * c - b.vy * sn; b.vy = vx * sn + b.vy * c;
            }
            b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
            if (b.life <= 0 || b.x < -20 || b.x > G.W + 20 || b.y < -20 || b.y > G.H + 20) return false;
            var d = G.dist(b.x, b.y, p.x, p.y);
            if (d < b.r * 0.6 + HIT_R) { s.struck = true; return false; }
            if (d < GRAZE_R && !b.grazed && p.inv <= 0) graze(s, b);
            return true;
        });
    }

    function updateLanes(s, dt) {
        var p = s.p;
        s.lanes = s.lanes.filter(function (l) {
            if (l.owner.gone || l.owner.dead) return false;
            var warned = l.t < LANE_WARN;
            l.t += dt;
            if (l.t < LANE_WARN) return true;
            if (warned) {
                G.noise(LANE_LIVE, { filter: 'highpass', freq: 3000, vol: 0.16 });
                G.tone(1500, LANE_LIVE, { type: 'sawtooth', slide: 500, vol: 0.08 });
            }
            if (Math.abs(p.x - l.x) < LANE_W / 2 + HIT_R && p.y > l.y) s.struck = true;
            return l.t < LANE_WARN + LANE_LIVE;
        });
    }

    // Everything that can hurt the ship only raises s.struck; the life is
    // taken here, once per tick, and never while the ship is invulnerable.
    function resolveHit(s) {
        var p = s.p;
        if (!s.struck) return;
        s.struck = false;
        if (p.inv > 0 || s.stage === 'outro') return;
        if (G.loseLife() <= 0) return;
        p.inv = 2.6;
        cancelBullets(s, false);
        G.burst(p.x, p.y, { n: 30, color: CY, speed: 300, life: 0.7 });
        G.noise(0.4, { freq: 2000, slide: 100, vol: 0.3 });
        G.flash(MG, 0.2);
    }

    function tickTimers(s, dt) {
        for (var k in s.snd) if (s.snd[k] > 0) s.snd[k] -= dt;
        if (s.p.inv > 0) s.p.inv -= dt;
        if (s.bombT > 0) s.bombT -= dt;
    }

    function update(s, dt) {
        tickTimers(s, dt);
        movePlayer(s, dt);
        useBomb(s);
        fireWeapons(s, dt);
        updateShots(s, dt);
        updateStage(s, dt);
        updateEnemies(s, dt);
        updateBullets(s, dt);
        updateLanes(s, dt);
        updateDrops(s, dt);
        resolveHit(s);
    }

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    function buildStars(rnd) {
        var stars = [];
        for (var i = 0; i < 70; i++) stars.push({ x: rnd() * G.W, y: rnd() * G.H, v: 60 + rnd() * 240 });
        return stars;
    }

    // A phone: its main pointer is a finger, and the engine shows the pad.
    function coarse() {
        return G.isTouch();
    }

    // Fire rates and bullet speeds rise 10% per level (k), a slope gentle
    // enough that the finale is still readable at an average player's reactions.
    function init(level) {
        var rnd = G.rng(level * 7919 + 13), touch = coarse(), k = 1 + (level - 1) * 0.1;
        return {
            level: level, rnd: rnd, touch: touch, drag: null,
            k: k, bk: k * (touch ? TOUCH_BULLETS : 1),           // k scales fire rates, bk bullet speed
            p: { x: G.W / 2, y: G.H - 70, inv: 1.5, cool: 0, missile: 0, lean: 0, focus: false },
            lv: Object.assign({}, KITS[level - 1]), orbs: { spread: 0, beam: 0, homing: 0 },
            bombs: 3, bombT: 0, graze: 0, struck: false, beamOn: false,
            shots: [], bullets: [], enemies: [], drops: [], lanes: [],
            waves: WAVES[level - 1].split(' '), wave: 0, squad: 0,
            waveT: level === 1 ? 3 : 1.2,                        // level 1 leaves time to read the hint
            stage: 'waves', stageT: 0, boss: null,
            stars: buildStars(rnd), snd: {}
        };
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    function blob(ctx, x, y, r, rgb, a) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Three drifting plasma clouds in the theme colours over a falling
    // starfield; the clouds thicken while a boss is on the field.
    function drawBackdrop(s, ctx) {
        var t = G.t, a = s.stage === 'waves' ? 0.13 : 0.2;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, G.W, G.H);
        blob(ctx, G.W * (0.3 + 0.2 * Math.sin(t * 0.31)), G.H * (0.4 + 0.25 * Math.cos(t * 0.23)), 400, '0,240,255', a);
        blob(ctx, G.W * (0.7 + 0.2 * Math.cos(t * 0.27)), G.H * (0.6 + 0.25 * Math.sin(t * 0.19)), 420, '255,0,224', a);
        blob(ctx, G.W * (0.5 + 0.3 * Math.sin(t * 0.17 + 2)), G.H * 0.85, 300, '255,238,0', a * 0.5);
        ctx.fillStyle = 'rgba(232,224,255,0.5)';
        // The phone starfield needs one fill instead of seventy tiny draws.
        if (s.touch) ctx.beginPath();
        s.stars.forEach(function (st) {
            if (s.touch) ctx.rect(st.x, (st.y + t * st.v) % G.H, 1.5, st.v * 0.05);
            else ctx.fillRect(st.x, (st.y + t * st.v) % G.H, 1.5, st.v * 0.05);
        });
        if (s.touch) ctx.fill();
    }

    // Regular polygon, or a spiky star when `star` shortens every other corner.
    function poly(ctx, x, y, r, sides, rot, star) {
        ctx.beginPath();
        for (var i = 0; i < sides; i++) {
            var a = rot + i * TAU / sides, rr = star && i % 2 ? r * 0.6 : r;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
    }

    function drawEnemy(ctx, e) {
        var d = TYPES[e.type], rot = (d.rot || 0) + (d.spin || 0) * e.age;
        if (e.delay > 0) return;
        if (e.type === 'dart' && e.ang != null) rot = e.ang;
        poly(ctx, e.x, e.y, d.r, d.sides, rot, d.star);
        ctx.fillStyle = e.flash > 0 ? '#fff' : 'rgba(20,0,30,0.85)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = d.col;
        ctx.stroke();
        // The core pulses; a mine's core blinks faster as its fuse runs down.
        var pulse = e.type === 'mine' ? Math.sin(e.age * (4 + 30 / (0.4 + Math.max(0, e.cool)))) : Math.sin(e.age * 6);
        ctx.fillStyle = pulse > 0 ? '#fff' : d.col;
        ctx.beginPath();
        ctx.arc(e.x, e.y, d.r * 0.28, 0, TAU);
        ctx.fill();
    }

    function drawLanes(s, ctx) {
        s.lanes.forEach(function (l) {
            var fired = l.t >= LANE_WARN, w = fired ? LANE_W : 3 + 6 * l.t / LANE_WARN;
            ctx.fillStyle = fired ? 'rgba(255,255,255,0.92)' : 'rgba(255,238,0,' + (0.6 + 0.3 * Math.sin(l.t * 40)) + ')';
            ctx.fillRect(l.x - w / 2, l.y, w, G.H - l.y);
            if (s.touch && !fired) {
                G.text('!', G.clamp(l.x, 18, G.W - 18), G.H - 64,
                    { size: 32, bold: true, color: YL, align: 'center', glow: BG });
            }
            if (!fired) return;
            ctx.fillStyle = 'rgba(0,240,255,0.35)';
            ctx.fillRect(l.x - w * 0.7, l.y, w * 1.4, G.H - l.y);
        });
    }

    function drawBoss(s, ctx) {
        var b = s.boss, sides = 2 + s.level * 2;   // a square, a hexagon, an octagon
        if (!b || (b.dead && Math.sin(G.t * 50) > 0)) return;
        ctx.globalAlpha = b.hold > 0 ? 0.55 + 0.3 * Math.sin(b.age * 22) : 1;
        ctx.lineWidth = 4;
        poly(ctx, b.x, b.y, b.r, sides, b.age * 0.7, false);
        ctx.fillStyle = b.flash > 0 ? '#fff' : 'rgba(30,0,40,0.9)';
        ctx.fill();
        ctx.strokeStyle = MG;
        ctx.stroke();
        poly(ctx, b.x, b.y, b.r * 0.62, sides, -b.age * 1.3, false);
        ctx.strokeStyle = CY;
        ctx.stroke();
        ctx.fillStyle = YL;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 9 + 3 * Math.sin(b.age * 5), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // One bar for the whole fight, with a notch at every phase break.
    function drawBossBar(s, ctx) {
        var b = s.boss, x = s.touch ? 220 : 280, w = 400, y = 38, h = s.touch ? 12 : 7;
        if (!b || b.dead) return;
        var left = ((b.n - b.phase - 1) * b.per + Math.max(0, b.hp)) / (b.n * b.per);
        ctx.fillStyle = 'rgba(232,224,255,0.18)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = MG;
        ctx.fillRect(x, y, w * left, h);
        ctx.fillStyle = BG;
        for (var i = 1; i < b.n; i++) ctx.fillRect(x + w * i / b.n - 1, y, 2, h);
        G.text(BOSSES[s.level - 1].name, x + w + 12, y + (s.touch ? 16 : 8),
            { size: s.touch ? 26 : 13, color: FG, max: G.W - x - w - 24, glow: s.touch ? BG : undefined });
    }

    function pathBullets(s, ctx, col, k) {
        ctx.beginPath();
        s.bullets.forEach(function (b) {
            if (col && b.col !== col) return;
            ctx.moveTo(b.x + b.r * k, b.y);
            ctx.arc(b.x, b.y, b.r * k, 0, TAU);
        });
    }

    // Bullets are drawn in one path per colour (a soft halo, then the body)
    // and get a white core on top, so hundreds stay cheap and readable.
    function drawBullets(s, ctx) {
        [CY, MG, YL].forEach(function (col) {
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.3;
            pathBullets(s, ctx, col, 1.9);
            ctx.fill();
            ctx.globalAlpha = 1;
            pathBullets(s, ctx, col, 1);
            ctx.fill();
        });
        ctx.fillStyle = '#fff';
        pathBullets(s, ctx, null, 0.5);
        ctx.fill();
    }

    function drawShots(s, ctx) {
        var p = s.p;
        if (s.beamOn) {
            var w = (6 + s.lv.beam * 4) * (0.8 + 0.2 * Math.sin(G.t * 60));
            ctx.fillStyle = 'rgba(255,0,224,0.45)';
            ctx.fillRect(p.x - w / 2, G.HUD, w, p.y - 12 - G.HUD);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillRect(p.x - w / 6, G.HUD, w / 3, p.y - 12 - G.HUD);
        }
        s.shots.forEach(function (sh) {
            ctx.fillStyle = sh.homing ? YL : 'rgba(232,224,255,0.75)';
            if (sh.homing) ctx.fillRect(sh.x - 3, sh.y - 3, 6, 6);
            else ctx.fillRect(sh.x - 1.5 - sh.vx * 0.012, sh.y - 8, 3, 14);
        });
    }

    // Orbs are diamonds (bullets are round), ringed by a clock that shows how
    // long the current colour lasts.
    function drawDrops(s, ctx) {
        s.drops.forEach(function (o) {
            var col = WCOL[orbKind(o)], left = 1 - (o.t % 1.6) / 1.6;
            poly(ctx, o.x, o.y, 11, 4, 0, false);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(o.x, o.y, 17, -DOWN, -DOWN + TAU * left);
            ctx.strokeStyle = col;
            ctx.stroke();
        });
    }

    function drawShip(s, ctx) {
        var p = s.p, wing = 15 - Math.abs(p.lean) * 5;
        if (p.inv > 0 && Math.sin(G.t * 40) > 0) ctx.globalAlpha = 0.35;
        ctx.fillStyle = Math.sin(G.t * 45) > 0 ? YL : MG;          // engine flicker
        ctx.fillRect(p.x - 3, p.y + 10, 6, 7 + 5 * Math.sin(G.t * 30));
        ctx.beginPath();
        ctx.moveTo(p.x + p.lean * 3, p.y - 18);
        ctx.lineTo(p.x + wing, p.y + 12);
        ctx.lineTo(p.x, p.y + 6);
        ctx.lineTo(p.x - wing, p.y + 12);
        ctx.closePath();
        ctx.fillStyle = 'rgba(10,0,25,0.9)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = CY;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (!p.focus) return;
        // Focus mode: show the real hitbox and how far a graze reaches.
        ctx.strokeStyle = 'rgba(232,224,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, GRAZE_R, 0, TAU); ctx.stroke();
        ctx.fillStyle = MG;
        ctx.beginPath(); ctx.arc(p.x, p.y, HIT_R + 3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, HIT_R, 0, TAU); ctx.fill();
    }

    function drawBombWave(s, ctx) {
        if (s.bombT <= 0) return;
        var k = 1 - s.bombT / 0.9;
        ctx.strokeStyle = CY;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 14 * (1 - k) + 2;
        ctx.beginPath();
        ctx.arc(s.p.x, s.p.y, 40 + k * 900, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Bottom-left tray: each weapon's level and how many of its three orbs
    // are collected; bombs sit bottom-right. A phone shows the canvas at about
    // half size, so there the tray is drawn half as large again.
    function drawTray(s, ctx) {
        var z = s.touch ? 1.5 : 1, y = G.H - 12;
        WEAPONS.forEach(function (kind, i) {
            var x = 14 + i * (s.touch ? 232 : 136);
            G.text(kind.toUpperCase() + ' ' + s.lv[kind], x, y,
                { size: s.touch ? 26 : Math.round(13.4 * z), bold: true, color: WCOL[kind], max: s.touch ? 144 : undefined, glow: s.touch ? BG : undefined });
            for (var n = 0; n < 3; n++) {
                ctx.fillStyle = n < s.orbs[kind] ? WCOL[kind] : 'rgba(232,224,255,0.2)';
                ctx.fillRect(x + (s.touch ? 154 + n * 16 : 88 + n * 10), y - 9 * z, 7 * z, 9 * z);
            }
        });
        for (var b = 0; b < s.bombs; b++) {
            ctx.strokeStyle = CY;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(G.W - (20 + b * 22) * z, G.H - 18 * z + 6 * (z - 1), 7 * z, 0, TAU);
            ctx.stroke();
        }
    }

    function drawMessages(s, ctx) {
        if (s.stage === 'warning') {
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.t * 14);
            G.text('WARNING', G.W / 2, 230, { size: 54, bold: true, color: MG, align: 'center', glow: MG });
            ctx.globalAlpha = 1;
            G.text(BOSSES[s.level - 1].name + ' APPROACHING', G.W / 2, 266,
                { size: s.touch ? 26 : 18, color: FG, align: 'center', max: G.W - 40 });
        } else if (s.level === 1 && s.stage === 'waves') drawHint(s);
    }

    // The rules a new player must learn, kept up for the whole wave stage of
    // level 1 and out of the ship's starting column. A phone gets its own
    // controls, in type large enough to read on a small screen.
    function drawHint(s) {
        var dim = 'rgba(232,224,255,0.6)';
        if (s.touch) {
            G.text('DRAG / PAD steer · SLOW focus', 14, G.H - 78, { size: 26, color: FG, glow: BG, max: 440 });
            G.text('Auto fire · BOMB clears bullets', 14, G.H - 48, { size: 26, color: FG, glow: BG, max: 440 });
            return;
        }
        G.text('HOLD SPACE: fire and focus  ·  X: bomb', 14, G.H - 52, { size: 15, color: dim });
        G.text('three orbs of one colour: weapon up', 14, G.H - 33, { size: 15, color: dim });
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        // Enemies fly in through the top edge; clipping there keeps the
        // engine's HUD strip free of half-drawn shapes and bullets.
        ctx.beginPath();
        ctx.rect(0, G.HUD, G.W, G.H - G.HUD);
        ctx.clip();
        drawLanes(s, ctx);
        drawShots(s, ctx);
        s.enemies.forEach(function (e) { drawEnemy(ctx, e); });
        drawBoss(s, ctx);
        drawDrops(s, ctx);
        drawShip(s, ctx);
        drawBullets(s, ctx);
        drawBombWave(s, ctx);
        drawBossBar(s, ctx);
        drawTray(s, ctx);
        drawMessages(s, ctx);
    }

    function hud(s) { return 'GRAZE ' + s.graze + '  BOMB ' + s.bombs; }

    // The ending: THE EYE blooms. Twelve plasma petals open around its core
    // and a ring of sparks leaves it every 0.7 s, cycling the three colours.
    // Everything follows from e.t, so the scene needs no state of its own.
    var BLOOM_X = G.W / 2, BLOOM_Y = 270, PETALS = 12, RING_GAP = 0.7, RING_DOTS = 24;

    function drawPetals(ctx, t) {
        var open = Math.min(1, t / 1.6), len = 40 + 110 * open;
        for (var i = 0; i < PETALS; i++) {
            var a = i * TAU / PETALS + t * 0.25, col = [CY, MG, YL][i % 3];
            ctx.globalAlpha = 0.28 + 0.14 * Math.sin(t * 3 + i);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(BLOOM_X + Math.cos(a) * len * 0.55, BLOOM_Y + Math.sin(a) * len * 0.55, len * 0.5, 9 + 7 * open, a, 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        blob(ctx, BLOOM_X, BLOOM_Y, 60 + 12 * Math.sin(t * 4), '255,238,0', 0.8);
    }

    function drawRings(ctx, t) {
        for (var k = Math.max(0, Math.floor((t - 2.4) / RING_GAP)); k * RING_GAP <= t; k++) {
            var age = t - k * RING_GAP, r = age * 230;
            ctx.globalAlpha = Math.max(0, 1 - age / 2.4);
            ctx.fillStyle = [CY, MG, YL][k % 3];
            ctx.beginPath();
            for (var i = 0; i < RING_DOTS; i++) {
                var a = i * TAU / RING_DOTS + k * 0.4;
                ctx.rect(BLOOM_X + Math.cos(a) * r - 3, BLOOM_Y + Math.sin(a) * r * 0.8 - 3, 6, 6);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    var ENDING = {
        title: 'STORM BROKEN',
        text: 'The Eye blooms into plasma fireworks.',
        colors: [CY, MG, YL, FG],
        draw: function (e, ctx) { drawRings(ctx, e.t); drawPetals(ctx, e.t); }
    };

    G.register('plasma', {
        title: 'PLASMA STORM',
        blurb: 'Thread the bullet storm, merge plasma orbs into weapons, break the boss.',
        controls: [
            '← ↑ → ↓ move · hold SPACE: fire, fly slower and show the tiny hitbox',
            'X / BOMB wipes every bullet · grazing bullets scores and earns bombs',
            'Phone: it fires by itself · drag on the screen (or the pad) to steer · SLOW for fine moves',
            'Orbs change colour: three alike upgrade cyan SPREAD · magenta BEAM · yellow HOMING'
        ],
        levelNames: ['First Sparks', 'Cyclone Front', 'Eye of the Storm'],
        colors: { bg: BG, fg: FG, accent: CY, dim: '#9a8fc0' },
        // Four lives: the late bosses cost an average player two or three.
        lives: 4,
        // E minor at speed: a galloping saw bass under a lead that climbs
        // through i - i - VI - VII, then i - i - iv - v.
        music: {
            bpm: 168, root: 40, scale: 'minor', prog: [0, 0, 5, 6, 0, 0, 3, 4],
            bass: 'x.xx.xx.x.xx.xo.',
            lead: [
                '4...7.4.2.4.7-..', '9.7.4.7.9---7.4.', '5...7.5.9.7.5-..', '6.8.a.8.6---8.a.',
                'b.9.7.9.b-9.7...', '7.9.b.9.e---b.9.', 'c.a.7.a.c-a.7.5.', 'b.8.6.8.b---....'
            ],
            arp: '0213',
            drums: { k: 'x...x...x...x.x.', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
            leadWave: 'sawtooth', bassWave: 'sawtooth', arpWave: 'square', leadOct: 1
        },
        init: init, update: update, draw: draw, hud: hud, ending: ENDING,
        // The full 8-way pad. A is SLOW, not fire: on a phone the ship fires
        // by itself, so A only does the other half of what SPACE does.
        touch: { a: 'SLOW', b: 'BOMB' }
    });
})();
