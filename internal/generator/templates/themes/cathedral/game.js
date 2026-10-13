/*
 * Gargoyle — the cathedral theme's game: joust-style flapping combat.
 *
 * A stone gargoyle defends the nave. SPACE flaps against gravity, the arrows
 * steer, and the nave wraps left/right. When gargoyle and demon collide, the
 * higher one wins: a beaten demon bursts into a soul orb that must be caught
 * before it hatches again as a tougher demon. Holy fire along the floor, the
 * swinging censer and fire geysers smite whatever touches them — demons
 * included, but that only turns them into orbs that hatch again, so hazards
 * never clear a wave for the player.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var FIRE_Y = 506, LEDGE_H = 16, GRAV = 720, DEMON_GRAV = 520, MAX_VX = 280;
    // Orbs hover on the fire's updraft, within reach of a gargoyle that
    // stands on the altar.
    var ORB_FLOOR = FIRE_Y - 70;
    // Demons follow the gargoyle down to here, so skimming the fire is no
    // refuge: nothing fits between a demon at this height and the flames.
    var DEMON_FLOOR = FIRE_Y - 50;
    // The gargoyle's ceiling is this much lower than the demons': the vault
    // tracery (see drawVault) stops stone, not spirits.
    var PLAYER_ROOF = 24;
    // The joust is lopsided in the gargoyle's favour: it wins when it is
    // STRIKE_EDGE px higher, a demon only when it is LOSE_EDGE px higher, and
    // everything in between is a harmless clash, so a near miss costs
    // nothing. The archdemon is twice the size and needs a cleaner dive (see
    // joust), but has to be well above the gargoyle (BOSS_LOSE_EDGE) to win:
    // brushing its flank on the way up is a clash, not a death.
    var STRIKE_EDGE = 5, LOSE_EDGE = 13, BOSS_LOSE_EDGE = 20;
    // Lives at the start, and the most a cleared wave blesses back up to.
    var LIVES = 4;
    var BUMP = 170;                             // the gargoyle's rebound off the underside of a ledge
    var HOLD_FLAP = 0.51, COMBO_T = 4, COMBO_MAX = 5, PORTAL_GRACE = 0.5;
    var TOUCH_FLAP = 0.32, TOUCH_CATCH = 34;
    var CRUMBLE_T = 1.2, REGROW_T = 6;
    var GEYSER_WARN = 1.2, GEYSER_BURN = 0.9, GEYSER_H = 300;
    var SPAWNS = [150, 810, 370, 590], SPAWN_Y = 60;
    var COL = { gold: '#e0c47f', violet: '#6f4fae', ruby: '#8e2f49', glass: '#7bc2ff', chalk: '#f0e8d9', bright: '#fff3c8' };
    var GLASS = [COL.glass, COL.ruby, COL.gold, COL.violet];
    var LANCETS = [110, 285, 675, 850];
    var HERO = { body: '#b9b2c4', wing: '#7d768c', eye: COL.gold, horn: COL.chalk, k: 1, tail: false };
    var TOUCH_HERO = { body: COL.chalk, wing: '#b9b2c4', eye: COL.gold, horn: COL.bright, k: 1.2, tail: false };

    // Demon tiers: how fast they fly, how often they may flap, how hard a
    // flap lifts, how likely each decision is to go for the gargoyle, and
    // `top`, the highest they dare to aim. Every tier can rise above the
    // gargoyle's own ceiling, so the vault is never a safe perch; the lesser
    // ones only get there less often.
    // `lag` is the longest a demon takes to change its mind: the Fallen are
    // relentless but slow to re-aim, which is the opening to climb past them.
    // Even the Fallen fly well below the gargoyle's top speed (MAX_VX) and
    // drift off now and then, so a casual player can always break away.
    var TIERS = [
        { name: 'IMP', body: '#c0506c', wing: '#7a2f45', eye: COL.bright, horn: '#3a1622', speed: 85, flap: 0.34, lift: 200, hunt: 0.3, top: 62, lag: 1.5, score: 100 },
        { name: 'FIEND', body: '#9a78e0', wing: '#5a3f9a', eye: COL.bright, horn: '#2a1c4a', speed: 115, flap: 0.3, lift: 215, hunt: 0.5, top: 60, lag: 1.5, score: 200 },
        { name: 'WRAITH', body: '#7bc2ff', wing: '#3f6f9e', eye: '#ffffff', horn: '#1c3550', speed: 145, flap: 0.26, lift: 230, hunt: 0.65, top: 57, lag: 1.3, score: 300 },
        { name: 'FALLEN', body: '#f0e8d9', wing: '#a89f8c', eye: '#ff5a6e', horn: COL.ruby, speed: 170, flap: 0.23, lift: 240, hunt: 0.85, top: 54, lag: 1.7, score: 500 }
    ];
    // The archdemon gets faster and flies higher with every strike it takes
    // (index = strikes).
    var BOSS = [
        { speed: 100, flap: 0.3, lift: 215, hunt: 1, top: 76, lag: 1.6 },
        { speed: 130, flap: 0.26, lift: 225, hunt: 1, top: 70, lag: 1.4 },
        { speed: 160, flap: 0.23, lift: 235, hunt: 1, top: 58, lag: 1.3 }
    ];
    var BOSS_LOOK = { body: '#a8324f', wing: '#5c1a2c', eye: COL.bright, horn: COL.gold, k: 2.1, tail: true };

    // Ledge layouts as [x, y, width]; the first ledge is the altar the
    // gargoyle starts and respawns on, so it never crumbles. The altar is a
    // solid block down to the floor: there is no gap beneath it to hide in.
    // A ledge may reach across the wrap seam (x + width > 960): it is one
    // piece of stone, not two that meet there, so nothing snags on the joint.
    // Every layout keeps ledges in its lower half: souls settle on them
    // instead of hovering just above the fire, and they give the gargoyle
    // somewhere to land between dives.
    var LAYOUTS = {
        nave: [[380, 440, 200], [50, 350, 170], [740, 350, 170], [340, 262, 280], [110, 170, 170], [680, 170, 170]],
        aisles: [[400, 446, 160], [840, 300, 240], [170, 384, 150], [640, 384, 150], [395, 236, 170], [230, 136, 120], [610, 136, 120]],
        hall: [[400, 440, 160], [40, 196, 150], [770, 196, 150], [110, 330, 170], [680, 330, 170], [390, 326, 180]],
        stairs: [[400, 446, 160], [60, 400, 120], [230, 318, 120], [60, 226, 120], [780, 400, 120], [610, 318, 120], [780, 226, 120], [410, 150, 140]],
        choir: [[410, 440, 140], [90, 286, 150], [720, 286, 150], [405, 200, 150], [235, 380, 110], [615, 380, 110]],
        twin: [[400, 446, 160], [850, 330, 220], [400, 300, 160], [410, 170, 140], [205, 392, 110], [645, 392, 110]],
        sanctum: [[410, 446, 140], [70, 330, 150], [740, 330, 150], [60, 180, 130], [770, 180, 130]]
    };

    // waves: demon tiers per wave ('B' = the archdemon). crumble: ledge
    // indices that fall apart underfoot. bats / geysers: seconds between
    // them. censers: [pivot x, chain length, start angle]. hatch: seconds an
    // orb waits before it re-hatches.
    var LEVELS = [
        { layout: 'nave', waves: [[0, 0, 0], [0, 0, 0, 0]], hatch: 9, hint: 'STRIKE FROM ABOVE' },
        { layout: 'nave', waves: [[0, 0, 1], [0, 1, 1], [0, 0, 1, 1]], hatch: 8.5, hint: 'FIENDS HUNT YOU' },
        { layout: 'aisles', waves: [[0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0]], bats: 9, hatch: 8, hint: 'BATS IN THE BELFRY' },
        { layout: 'stairs', waves: [[0, 0, 1], [0, 1, 1], [1, 1, 0], [0, 1, 2]], crumble: [1, 2, 3, 4, 5, 6, 7], hatch: 8, hint: 'THE STONE CRUMBLES' },
        { layout: 'hall', waves: [[0, 1, 1], [1, 1, 2], [1, 2, 0], [1, 2, 2, 1]], censers: [[480, 230, 0.9]], hatch: 7.5, hint: 'BEWARE THE CENSER' },
        { layout: 'choir', waves: [[1, 1, 2], [0, 1, 2], [2, 1, 1], [2, 2, 1]], bats: 13, hatch: 8, hint: 'WRAITHS RISE HIGH' },
        { layout: 'nave', waves: [[1, 2, 2], [1, 1, 2], [2, 2, 1], [2, 2, 1]], geysers: 6, hatch: 8, hint: 'HOLY FIRE ERUPTS' },
        { layout: 'twin', waves: [[1, 1, 2], [1, 2, 2], [2, 2, 1, 1], [2, 2, 3, 1], [3, 2, 2, 1]], censers: [[240, 200, 0.75], [720, 200, -0.75]], crumble: [1, 2], bats: 10, hatch: 7.5, hint: 'TWIN THURIBLES' },
        { layout: 'stairs', waves: [[1, 2, 1], [2, 2, 1], [3, 2, 1], [2, 3, 1, 1]], crumble: [2, 5, 7], geysers: 8, dark: true, hatch: 7.5, hint: 'THE CANDLES GO OUT' },
        { layout: 'sanctum', waves: [[1, 2, 2], [2, 2, 3], [2, 3, 2, 1], ['B', 1, 1]], censers: [[480, 170, 0.8]], bats: 12, geysers: 9, hatch: 7.5, hint: 'THE LAST VIGIL' }
    ];

    // ------------------------------------------------------------------
    // Sound
    // ------------------------------------------------------------------

    // A bell is a sine with inharmonic partials that die away at different
    // speeds; the same recipe serves tolls (low) and chimes (high).
    function bell(freq, vol, delay) {
        [[1, 1.3, 1], [2, 0.8, 0.5], [2.76, 0.6, 0.35], [5.4, 0.25, 0.2]].forEach(function (h) {
            G.tone(freq * h[0], h[1], { type: 'sine', vol: vol * h[2], delay: delay || 0 });
        });
    }

    function growl(freq) {
        G.tone(freq, 0.35, { type: 'sawtooth', slide: freq * 0.45, vol: 0.14 });
        G.noise(0.25, { freq: 300, vol: 0.12 });
    }

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    function wrapX(x) { return (x % G.W + G.W) % G.W; }

    // Shortest signed distance from b to a across the wrapping nave.
    function wrapDx(a, b) {
        var d = a - b;
        return d > G.W / 2 ? d - G.W : (d < -G.W / 2 ? d + G.W : d);
    }

    function buildLedges(cfg) {
        var crumble = cfg.crumble || [];
        return LAYOUTS[cfg.layout].map(function (l, i) {
            return { x: l[0], y: l[1], w: l[2], h: i === 0 ? G.H - l[1] : LEDGE_H, crumble: crumble.indexOf(i) >= 0, wear: 0, gone: 0 };
        });
    }

    // The bowl hangs at the end of the chain; computed here as well as on
    // every tick so the title screen shows the censer where play starts it.
    function placeBowl(c) {
        c.bx = c.px + Math.sin(c.ang) * c.len;
        c.by = G.HUD - 4 + Math.cos(c.ang) * c.len;
        return c;
    }

    function buildCensers(cfg) {
        return (cfg.censers || []).map(function (c) {
            return placeBowl({ px: c[0], len: c[1], ang: c[2], av: 0, bx: 0, by: 0, smoke: 0 });
        });
    }

    function newPlayer(s) {
        var home = s.ledges[0];
        return {
            x: home.x + home.w / 2, y: home.y - 14, vx: 0, vy: 0, hw: 13, hh: 14, face: 1,
            wing: 0, flapCd: 0, hold: 0, flapRepeat: s.touch ? TOUCH_FLAP : HOLD_FLAP,
            inv: 2, batCd: 0, combo: 0, comboT: 0, roof: PLAYER_ROOF, bump: BUMP, ground: null
        };
    }

    function strongestTier(cfg) {
        var top = 0;
        cfg.waves.forEach(function (w) { w.forEach(function (t) { if (t > top) top = t; }); });
        return top;
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 7919 + 13), i;
        var s = {
            cfg: cfg, touch: G.isTouch(), t: 0, ledges: buildLedges(cfg), censers: buildCensers(cfg),
            demons: [], orbs: [], bats: [], geysers: [], glass: [], motes: [],
            wave: -1, waveDelay: 1, batTimer: cfg.bats || 0, geyserTimer: cfg.geysers || 0,
            clashCd: 0, maxTier: Math.min(3, strongestTier(cfg) + 1), banner: { text: '', t: 0 }
        };
        for (i = 0; i < LANCETS.length * 18; i++) s.glass.push(Math.floor(rnd() * GLASS.length));
        for (i = 0; i < (s.touch ? 12 : 36); i++) s.motes.push({ x: rnd() * G.W, y: 60 + rnd() * 400, v: 6 + rnd() * 16, ph: rnd() * 6.28 });
        s.p = newPlayer(s);
        return s;
    }

    function newDemon(x, y, tier, delay) {
        return {
            x: x, y: y, vx: 0, vy: 0, hw: 13, hh: 13, tier: tier, boss: false, hp: 1,
            dir: x < G.W / 2 ? 1 : -1, face: 1, targetY: 200, think: 0, flapCd: 0, wing: 0,
            spawn: delay, grace: PORTAL_GRACE, stun: 0, dead: false, ground: null, round: false
        };
    }

    function newBoss() {
        var d = newDemon(G.W / 2, 120, 3, 2.2);
        d.boss = true; d.hw = 26; d.hh = 26; d.hp = 3;
        return d;
    }

    // Demons shimmer into the nave one after another and at different
    // heights, so a wave never lands on the gargoyle all at once and no single
    // spot covers every portal.
    function spawnWave(s) {
        var list = s.cfg.waves[s.wave], first = s.wave === 0;
        list.forEach(function (tier, i) {
            if (tier === 'B') s.demons.push(newBoss());
            else s.demons.push(newDemon(SPAWNS[(i + s.wave) % SPAWNS.length], SPAWN_Y + (i + s.wave) % 3 * 45, tier, 0.9 + i * 0.5));
        });
        var boss = list.indexOf('B') >= 0;
        s.banner.text = boss ? 'THE ARCHDEMON' : (first ? s.cfg.hint : 'WAVE ' + (s.wave + 1));
        s.banner.t = 2.2;
        bell(boss ? 98 : 196, 0.3);
        if (boss) { bell(98, 0.3, 0.7); growl(110); }
    }

    // ------------------------------------------------------------------
    // Movement shared by gargoyle, demons and orbs
    // ------------------------------------------------------------------

    // Landing on a ledge or hitting its underside. The gargoyle rebounds off
    // an underside with at least its `bump` speed: it cannot cling there,
    // where nothing could ever get above it.
    function restOrBump(e, l, dy) {
        if (dy < 0) { e.y = l.y - e.hh; if (e.vy > 0) e.vy = 0; e.ground = l; }
        else { e.y = l.y + l.h + e.hh; e.vy = Math.max(Math.abs(e.vy) * 0.4, e.bump || 0); e.ceil = l; }
    }

    // Pushes a body out of every standing ledge along the axis it overlaps
    // least, which is the side it came in through. Sets e.ground, e.ceil
    // (the ledge it hit from below) and e.blocked (the ledge whose end it
    // ran into).
    function collideLedges(s, e) {
        e.ground = null; e.ceil = null; e.blocked = null;
        for (var i = 0; i < s.ledges.length; i++) {
            var l = s.ledges[i];
            if (l.gone > 0) continue;
            var dx = wrapDx(e.x, l.x + l.w / 2), dy = e.y - (l.y + l.h / 2);
            var ox = e.hw + l.w / 2 - Math.abs(dx), oy = e.hh + l.h / 2 - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            if (oy < ox) { restOrBump(e, l, dy); continue; }
            var side = dx < 0 ? -1 : 1;
            e.x = wrapX(e.x + side * ox);
            e.vx = side * Math.abs(e.vx) * 0.5;
            e.blocked = l;
        }
    }

    function moveBody(s, e, dt, grav) {
        e.vy += grav * dt;
        e.x = wrapX(e.x + e.vx * dt);
        e.y += e.vy * dt;
        // The vault pushes back. The gargoyle's `roof` keeps it a little
        // lower than demons can fly, so it can always be attacked from above.
        var top = G.HUD + e.hh + (e.roof || 0);
        if (e.y < top) { e.y = top; e.vy = Math.abs(e.vy) * 0.4 + 30; }
        collideLedges(s, e);
    }

    // ------------------------------------------------------------------
    // The gargoyle
    // ------------------------------------------------------------------

    function steerPlayer(p, dt) {
        var ax = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        if (ax) { p.vx += ax * (p.ground ? 1100 : 700) * dt; p.face = ax; }
        else if (p.ground) p.vx -= p.vx * Math.min(1, 8 * dt);
        p.vx = G.clamp(p.vx, -MAX_VX, MAX_VX);
    }

    // Keyboard holds hover; a phone hold climbs so steering never requires
    // repeated thumb taps at the same time. Releasing FLAP starts a dive.
    function flapPlayer(p, dt) {
        var held = G.key.a || G.key.up;
        p.flapCd -= dt;
        p.hold = held ? p.hold + dt : 0;
        var want = G.hit.a || G.hit.up || p.hold > p.flapRepeat;
        if (!want || p.flapCd > 0) return;
        p.hold = 0;
        p.vy = Math.max(Math.min(p.vy, 60) - 250, -360);
        p.flapCd = 0.09; p.wing = 0.16;
        G.noise(0.09, { filter: 'bandpass', freq: 700, slide: 260, vol: 0.1 });
    }

    function killPlayer(s) {
        var p = s.p, home = s.ledges[0];
        if (p.inv > 0) return;
        G.burst(p.x, p.y, { n: 26, color: HERO.body, speed: 240, gravity: 500, size: 4 });
        G.noise(0.4, { freq: 500, slide: 80, vol: 0.3 });
        p.inv = 2.5;
        if (G.loseLife() <= 0) return;
        p.x = home.x + home.w / 2; p.y = home.y - p.hh; p.vx = 0; p.vy = 0; p.combo = 0; p.comboT = 0;
    }

    function updatePlayer(s, dt) {
        var p = s.p, wasGround = p.ground;
        if (p.inv > 0) p.inv -= dt;
        if (p.batCd > 0) p.batCd -= dt;
        if (p.wing > 0) p.wing -= dt;
        // A combo lapses a few seconds after the last strike, so staying
        // airborne alone cannot keep the multiplier alive.
        if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
        steerPlayer(p, dt);
        flapPlayer(p, dt);
        moveBody(s, p, dt, GRAV);
        if (p.ground && !wasGround) {
            p.combo = 0;
            G.tone(110, 0.07, { type: 'triangle', slide: 60, vol: 0.2 });
        }
        if (p.y + p.hh <= FIRE_Y) return;
        // A freshly respawned gargoyle is thrown back up instead of burning.
        if (p.inv > 0) { p.y = FIRE_Y - p.hh; p.vy = -320; }
        else killPlayer(s);
    }

    function crumble(l) {
        l.gone = REGROW_T;
        G.burst(wrapX(l.x + l.w / 2), l.y + 8, { n: 22, color: '#8d849c', speed: 150, gravity: 700, spread: Math.PI, angle: Math.PI / 2, size: 4 });
        G.noise(0.45, { freq: 420, slide: 70, vol: 0.3 });
        G.shake(3, 0.15);
    }

    // Crumbling ledges wear out while the gargoyle stands on them and grow
    // back later, so no perch is safe for long but none is lost for good.
    // Wear heals while nobody stands there: brief landings must not add up
    // to a ledge that drops at the first touch.
    function wearLedges(s, dt) {
        var under = s.p.ground;
        if (under && under.crumble) {
            under.wear += dt;
            if (under.wear > CRUMBLE_T) crumble(under);
        }
        s.ledges.forEach(function (l) {
            if (l !== under && l.wear > 0) l.wear = Math.max(0, l.wear - dt * 0.5);
            if (l.gone <= 0) return;
            l.gone -= dt;
            if (l.gone <= 0) { l.wear = 0; G.tone(330, 0.12, { type: 'triangle', vol: 0.1 }); }
        });
    }

    // ------------------------------------------------------------------
    // Demons, the joust and soul orbs
    // ------------------------------------------------------------------

    function statsOf(d) { return d.boss ? BOSS[3 - d.hp] : TIERS[d.tier]; }

    // One decision: either go for the gargoyle (aiming just above it, where
    // a demon wins the joust) or drift to a random height.
    function thinkDemon(s, d) {
        var p = s.p, T = statsOf(d);
        d.think = G.rnd(T.lag * 0.45, T.lag);
        if (d.stun > 0) {                        // a struck archdemon retreats
            d.dir = wrapDx(d.x, p.x) > 0 ? 1 : -1; d.targetY = T.top;
        } else if (Math.random() < T.hunt) {
            d.dir = wrapDx(p.x, d.x) > 0 ? 1 : -1; d.targetY = p.y - 12;
        } else {
            if (Math.random() < 0.3) d.dir = -d.dir;
            d.targetY = G.rnd(80, 400);
        }
        d.targetY = G.clamp(d.targetY, T.top, DEMON_FLOOR);
    }

    // The soul is flung sideways and cannot be grabbed for a moment, so a
    // strike never collects its own orb: the catch is a second manoeuvre.
    // Only a soul struck free by the gargoyle comes back `tougher`, and never
    // beyond one tier above the strongest demon the level sends.
    function newOrb(s, d, tougher) {
        return {
            x: d.x, y: d.y, vx: d.vx * 0.4 + G.rnd(90, 170) * (Math.random() < 0.5 ? -1 : 1), vy: -90,
            hw: 8, hh: 8, ground: null, arm: 0.6,
            tier: tougher ? Math.min(d.tier + 1, s.maxTier) : d.tier, hatch: s.cfg.hatch, max: s.cfg.hatch
        };
    }

    // Holy fire and censers turn a demon into an orb without any reward:
    // the orb still has to be caught or the same demon comes back.
    function smite(s, d) {
        if (d.dead) return;
        d.dead = true;
        s.orbs.push(newOrb(s, d, false));
        G.burst(d.x, d.y, { n: 16, color: COL.gold, speed: 200, life: 0.5 });
        G.noise(0.2, { filter: 'bandpass', freq: 1800, slide: 400, vol: 0.14 });
    }

    // A demon that flew into the end of a ledge goes round it on the
    // gargoyle's side, so stone is never a shield to hide behind. Going under,
    // it scrapes along the underside: any lower and a gargoyle hugging the
    // ledge from below would be the higher one and could strike every demon
    // that came for it. Where a demon cannot pass underneath (the altar, or a
    // ledge so low that the way under is below the height demons keep above
    // the fire) it goes over instead of staying pressed against the stone.
    function detour(s, d) {
        var l = d.blocked, under = l.y + l.h + d.hh + 2;
        d.targetY = s.p.y > l.y && under <= DEMON_FLOOR ? under : l.y - 34;
        d.think = 0.7;
    }

    // The ledge that pins a demon: the one whose underside it presses
    // against while it wants to rise, or the one it stands on while what it
    // wants is below.
    function pinnedBy(d) {
        if (d.ceil && d.y > d.targetY) return d.ceil;
        return d.ground && d.targetY > d.ground.y + d.ground.h ? d.ground : null;
    }

    // Against an underside a demon flutters in place instead of dropping
    // away: under a ledge it then is the higher one, as it is everywhere
    // else. If what it is after is on the far side of the stone it makes for
    // the nearer end, so a gargoyle on top of a ledge, or under one, is never
    // shielded by it. It picks that way out once (`round`) and keeps to it
    // until it is free, instead of turning back with every new decision.
    function goRound(d, l) {
        if (d.ceil === l) {
            d.vy = 0; d.flapCd = 0;
            if (d.targetY >= l.y) return;        // its prey is under this ledge too
        }
        if (!d.round) d.dir = wrapDx(d.x, l.x + l.w / 2) < 0 ? -1 : 1;
        d.round = true;
        d.think = Math.max(d.think, 0.3);
    }

    function updateDemon(s, d, dt) {
        if (d.spawn > 0) { d.spawn -= dt; return; }
        var T = statsOf(d);
        if (d.grace > 0) d.grace -= dt;
        if (d.stun > 0) d.stun -= dt;
        if (d.wing > 0) d.wing -= dt;
        d.think -= dt; d.flapCd -= dt;
        if (d.think <= 0) thinkDemon(s, d);
        d.vx += (d.dir * T.speed - d.vx) * Math.min(1, 3 * dt);
        d.face = d.dir;
        // Near the fire every demon flaps for its life, whatever it wanted.
        if ((d.y > d.targetY || d.y > DEMON_FLOOR) && d.flapCd <= 0) {
            d.vy = Math.max(Math.min(d.vy, 80) - T.lift, -300);
            d.flapCd = T.flap; d.wing = 0.16;
        }
        moveBody(s, d, dt, DEMON_GRAV);
        if (d.blocked) detour(s, d);
        var pin = pinnedBy(d);
        if (pin) goRound(d, pin); else d.round = false;
        if (d.y + d.hh <= FIRE_Y) return;
        if (d.boss) { d.y = FIRE_Y - d.hh; d.vy = -300; }
        else smite(s, d);
    }

    function summon(s, tier) {
        s.demons.push(newDemon(SPAWNS[0], SPAWN_Y, tier, 1.2), newDemon(SPAWNS[1], SPAWN_Y + 45, tier, 1.7));
    }

    function slayBoss(s, d) {
        d.dead = true;
        s.demons.forEach(function (o) {
            o.dead = true;
            G.burst(o.x, o.y, { n: 18, color: demonLook(o).body, speed: 260, life: 0.8 });
        });
        s.orbs = [];
        G.burst(d.x, d.y, { n: 70, color: COL.gold, speed: 420, life: 1.2, size: 5 });
        G.addScore(5000);
        G.popup(d.x, d.y - 40, 'ARCHDEMON SLAIN', COL.gold);
        G.shake(14, 0.7);
        [196, 247, 294, 392].forEach(function (f, i) { bell(f, 0.25, i * 0.18); });
    }

    // The archdemon shrugs off a hit while it is still reeling, so three
    // separate dives are needed; each one calls reinforcements, and the
    // three seconds it reels are the time to deal with them.
    function strikeBoss(s, d) {
        if (d.stun > 0) return;
        d.hp--;
        G.sfx('bigboom'); bell(131, 0.3);
        G.flash(COL.gold, 0.18); G.shake(9, 0.4);
        G.burst(d.x, d.y - 20, { n: 30, color: COL.ruby, speed: 300, life: 0.7, size: 4 });
        if (d.hp <= 0) { slayBoss(s, d); return; }
        G.addScore(1000);
        G.popup(d.x, d.y - 40, d.hp + ' MORE', COL.gold);
        d.stun = 3; d.vy = 140; d.think = 0;
        growl(90);
        // Imps after the first strike, fiends after the second.
        summon(s, 2 - d.hp);
    }

    function strike(s, d) {
        var p = s.p, T = TIERS[d.tier];
        p.vy = -230;
        if (d.boss) { strikeBoss(s, d); return; }
        // Strikes in quick succession without touching stone multiply the
        // reward, up to a cap.
        p.combo = Math.min(COMBO_MAX, p.combo + 1);
        p.comboT = COMBO_T;
        d.dead = true;
        s.orbs.push(newOrb(s, d, true));
        G.addScore(T.score * p.combo);
        G.popup(d.x, d.y - 18, T.score * p.combo + (p.combo > 1 ? ' x' + p.combo : ''), COL.gold);
        G.burst(d.x, d.y, { n: 20, color: T.body, speed: 220, gravity: 300 });
        G.noise(0.18, { freq: 1400, slide: 200, vol: 0.25 });
        bell(523 + p.combo * 60, 0.14);
        G.shake(4, 0.12);
    }

    // Level heights: nobody wins, both are thrown apart with sparks.
    function clash(s, d) {
        var p = s.p, side = wrapDx(p.x, d.x) >= 0 ? 1 : -1;
        p.vx = side * 230; p.vy = Math.min(p.vy, -90); p.x = wrapX(p.x + side * 5);
        d.vx = -side * 170; d.dir = -side;
        if (s.clashCd > 0) return;
        s.clashCd = 0.2;
        G.burst((p.x + d.x) / 2, (p.y + d.y) / 2, { n: 8, color: COL.bright, speed: 200, life: 0.3 });
        G.tone(1700, 0.09, { type: 'triangle', vol: 0.16 });
        G.tone(2540, 0.07, { type: 'triangle', vol: 0.1 });
    }

    // The joust rule: whoever is clearly higher at the moment of contact
    // wins, with the margins set by STRIKE_EDGE / LOSE_EDGE. The archdemon
    // is bigger, so the dive has to be cleaner (12 px). A demon
    // fresh out of its portal cannot be touched yet, which rules out waiting
    // above a portal for a free strike.
    function joust(s, d) {
        var p = s.p;
        if (d.spawn > 0 || d.grace > 0 || d.dead) return;
        if (Math.abs(wrapDx(p.x, d.x)) > p.hw + d.hw || Math.abs(p.y - d.y) > p.hh + d.hh) return;
        if (p.y < d.y - (d.boss ? 12 : STRIKE_EDGE)) strike(s, d);
        else if (d.y < p.y - (d.boss ? BOSS_LOSE_EDGE : LOSE_EDGE) && d.stun <= 0 && p.inv <= 0) killPlayer(s);
        else clash(s, d);
    }

    function hatch(s, o) {
        s.demons.push(newDemon(o.x, o.y, o.tier, 0.7));
        growl(160 - o.tier * 20);
        G.popup(o.x, o.y - 16, TIERS[o.tier].name, TIERS[o.tier].body);
        G.burst(o.x, o.y, { n: 12, color: TIERS[o.tier].body, speed: 150, life: 0.4 });
    }

    function collectOrb(s, o) {
        var pts = 150 * (o.tier + 1), air = !o.ground && o.y < ORB_FLOOR;
        if (air) pts *= 2;                       // caught before it came to rest
        G.addScore(pts);
        G.popup(o.x, o.y - 14, (air ? 'AIR CATCH ' : '') + pts, COL.glass);
        G.burst(o.x, o.y, { n: 14, color: COL.glass, speed: 160, life: 0.5 });
        bell(1047, 0.16); bell(1568, 0.1, 0.08);
    }

    // Returns false once the orb is gone (caught or hatched).
    function updateOrb(s, o, dt) {
        var p = s.p, before = o.hatch;
        o.vx -= o.vx * Math.min(1, 1.5 * dt);
        moveBody(s, o, dt, 300);
        o.vy = Math.min(o.vy, 110);
        if (o.y > ORB_FLOOR) { o.y = ORB_FLOOR; o.vy = 0; }
        o.arm -= dt;
        var catchX = s.touch ? TOUCH_CATCH : 24, catchY = s.touch ? TOUCH_CATCH : 26;
        if (o.arm <= 0 && Math.abs(wrapDx(p.x, o.x)) < catchX && Math.abs(p.y - o.y) < catchY) { collectOrb(s, o); return false; }
        o.hatch -= dt;
        // A quickening heartbeat warns of the hatch during the last seconds.
        if (o.hatch < 3 && Math.floor(o.hatch * 2) !== Math.floor(before * 2)) G.tone(180, 0.05, { type: 'sine', vol: 0.16 });
        if (o.hatch > 0) return true;
        hatch(s, o);
        return false;
    }

    function updateDemons(s, dt) {
        s.demons.forEach(function (d) { updateDemon(s, d, dt); joust(s, d); });
        s.demons = s.demons.filter(function (d) { return !d.dead; });
        s.orbs = s.orbs.filter(function (o) { return updateOrb(s, o, dt); });
    }

    // ------------------------------------------------------------------
    // Hazards: censers, bats, geysers
    // ------------------------------------------------------------------

    // A real pendulum (semi-implicit Euler keeps its energy steady); the
    // chain is harmless, the burning bowl is not.
    function updateCenser(s, c, dt) {
        var before = c.ang, p = s.p;
        c.av -= 900 / c.len * Math.sin(c.ang) * dt;
        c.ang += c.av * dt;
        placeBowl(c);
        if (before * c.ang <= 0) G.noise(0.3, { filter: 'bandpass', freq: 300, slide: 900, vol: 0.09 });
        c.smoke -= dt;
        if (c.smoke <= 0) {
            c.smoke = 0.09;
            G.burst(c.bx, c.by - 8, { n: 1, color: 'rgba(240,232,217,0.35)', speed: 30, life: 1.1, size: 5, gravity: -40 });
        }
        if (G.circ(c.bx, c.by, 17, p.x, p.y, 12)) killPlayer(s);
        s.demons.forEach(function (d) {
            if (!d.boss && d.spawn <= 0 && G.circ(c.bx, c.by, 17, d.x, d.y, 12)) smite(s, d);
        });
    }

    // A swarm crosses the nave at the gargoyle's height, so it has to climb,
    // dive or ride out the shove.
    function spawnBats(s) {
        var dir = Math.random() < 0.5 ? 1 : -1, y = G.clamp(s.p.y + G.rnd(-30, 30), 70, 420);
        for (var i = 0; i < 9; i++) {
            s.bats.push({ x: (dir > 0 ? -30 : G.W + 30) - dir * i * 24, base: y + G.rnd(-16, 16), y: y, dir: dir, ph: i * 1.3 });
        }
        G.tone(2600, 0.12, { type: 'sawtooth', slide: 3400, vol: 0.06 });
        G.tone(3000, 0.1, { type: 'sawtooth', slide: 2300, vol: 0.06, delay: 0.14 });
    }

    function updateBats(s, dt) {
        var p = s.p;
        if (s.cfg.bats && s.wave >= 0) {
            s.batTimer -= dt;
            if (s.batTimer <= 0) { s.batTimer = s.cfg.bats; spawnBats(s); }
        }
        s.bats = s.bats.filter(function (b) {
            b.x += b.dir * 230 * dt;
            b.y = b.base + Math.sin(s.t * 9 + b.ph) * 14;
            if (p.batCd <= 0 && G.circ(b.x, b.y, 10, p.x, p.y, 14)) {
                p.vx += b.dir * 150; p.vy += 80; p.batCd = 0.15;
                G.tone(2200, 0.05, { type: 'square', slide: 1500, vol: 0.07 });
                G.burst(b.x, b.y, { n: 4, color: '#3a3148', speed: 90, life: 0.3 });
            }
            return b.x > -260 && b.x < G.W + 260;
        });
    }

    function geyserBurning(g) { return g.t > GEYSER_WARN && g.t < GEYSER_WARN + GEYSER_BURN; }

    function inGeyser(g, e) {
        return Math.abs(wrapDx(e.x, g.x)) < 22 + e.hw * 0.5 && e.y + e.hh > FIRE_Y - GEYSER_H;
    }

    // Geysers open under the gargoyle after a clear warning, which keeps it
    // from camping on one ledge.
    function updateGeysers(s, dt) {
        if (s.cfg.geysers && s.wave >= 0) {
            s.geyserTimer -= dt;
            if (s.geyserTimer <= 0) {
                s.geyserTimer = s.cfg.geysers * G.rnd(0.8, 1.2);
                s.geysers.push({ x: s.p.x, t: 0 });
                G.noise(GEYSER_WARN, { filter: 'highpass', freq: 2500, vol: 0.07, attack: 0.8 });
            }
        }
        s.geysers = s.geysers.filter(function (g) {
            var was = geyserBurning(g);
            g.t += dt;
            if (!geyserBurning(g)) return g.t < GEYSER_WARN + GEYSER_BURN + 0.2;
            if (!was) { G.sfx('boom'); G.tone(70, 0.5, { type: 'sine', slide: 40, vol: 0.3 }); G.shake(4, 0.2); }
            if (inGeyser(g, s.p)) killPlayer(s);
            s.demons.forEach(function (d) { if (!d.boss && d.spawn <= 0 && inGeyser(g, d)) smite(s, d); });
            return true;
        });
    }

    // ------------------------------------------------------------------
    // Waves and the main update
    // ------------------------------------------------------------------

    function updateWaves(s, dt) {
        if (s.demons.length || s.orbs.length) return;
        if (s.wave === s.cfg.waves.length - 1) { G.win(500 + G.lives * 250); return; }
        s.waveDelay -= dt;
        if (s.waveDelay > 0) return;
        // A cleared wave is blessed with a life back, so the long late
        // levels stay fair without making the first wave any easier.
        if (s.wave >= 0 && G.lives < LIVES) { G.addLife(LIVES); G.popup(s.p.x, s.p.y - 30, 'BLESSED +1', COL.bright); G.sfx('power'); }
        s.wave++;
        s.waveDelay = 1.6;
        spawnWave(s);
    }

    function update(s, dt) {
        s.t += dt;
        if (s.clashCd > 0) s.clashCd -= dt;
        if (s.banner.t > 0) s.banner.t -= dt;
        updatePlayer(s, dt);
        wearLedges(s, dt);
        updateDemons(s, dt);
        s.censers.forEach(function (c) { updateCenser(s, c, dt); });
        updateBats(s, dt);
        updateGeysers(s, dt);
        updateWaves(s, dt);
    }

    // ------------------------------------------------------------------
    // Drawing: the nave
    // ------------------------------------------------------------------

    function lancetPath(ctx, x, top, w, bottom) {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, bottom);
        ctx.lineTo(x - w / 2, top + w);
        ctx.quadraticCurveTo(x - w / 2, top + w * 0.3, x, top);
        ctx.quadraticCurveTo(x + w / 2, top + w * 0.3, x + w / 2, top + w);
        ctx.lineTo(x + w / 2, bottom);
        ctx.closePath();
    }

    // Stained glass: seeded panes whose glow breathes slowly, as if clouds
    // passed outside.
    function drawLancet(s, ctx, x, i) {
        var top = 62, w = 64, bottom = 330, rows = s.touch ? 3 : 9, rh = (bottom - top) / rows;
        ctx.save();
        lancetPath(ctx, x, top, w, bottom);
        ctx.clip();
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < 2; c++) {
                ctx.globalAlpha = 0.2 + 0.08 * Math.sin(s.t * 0.9 + i * 1.7 + r * 0.8 + c);
                ctx.fillStyle = GLASS[s.glass[i * 18 + r * 2 + c]];
                ctx.fillRect(x - w / 2 + c * w / 2 + 1, top + r * rh + 1, w / 2 - 2, rh - 2);
            }
        }
        ctx.restore();
        lancetPath(ctx, x, top, w, bottom);
        ctx.strokeStyle = 'rgba(224,196,127,0.32)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawRose(s, ctx) {
        var cx = G.W / 2, cy = 128, r = 62, spin = s.t * 0.12;
        for (var k = 0; k < 12; k++) {
            var a = spin + k * Math.PI / 6;
            ctx.globalAlpha = 0.24 + 0.08 * Math.sin(s.t * 1.3 + k);
            ctx.fillStyle = GLASS[k % 4];
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, a, a + Math.PI / 6 - 0.05);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(224,196,127,0.4)';
        ctx.lineWidth = 2;
        [r, r * 0.55, r * 0.2].forEach(function (rr) {
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        });
    }

    // The vault tracery: a row of hanging arches as deep as the strip only
    // demons can enter. It shows the player where the gargoyle's ceiling is
    // and that a demon can still be above it there.
    function drawVault(ctx) {
        var bay = 60, tip = G.HUD + PLAYER_ROOF;
        ctx.fillStyle = '#2b2436';
        ctx.strokeStyle = 'rgba(224,196,127,0.45)';
        ctx.lineWidth = 1.5;
        for (var x = 0; x < G.W; x += bay) {
            ctx.beginPath();
            ctx.moveTo(x, G.HUD);
            ctx.lineTo(x, tip);
            ctx.quadraticCurveTo(x + bay * 0.1, G.HUD + 6, x + bay / 2, G.HUD + 4);
            ctx.quadraticCurveTo(x + bay * 0.9, G.HUD + 6, x + bay, tip);
            ctx.lineTo(x + bay, G.HUD);
            ctx.fill();
            ctx.stroke();
        }
    }

    function drawBackdrop(s, ctx) {
        var g = ctx.createLinearGradient(0, 0, 0, G.H);
        g.addColorStop(0, '#1c1524'); g.addColorStop(1, '#09080d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, G.W, G.H);
        LANCETS.forEach(function (x, i) { drawLancet(s, ctx, x, i); });
        drawRose(s, ctx);
        [198, 388, 572, 762].forEach(function (x) {
            ctx.fillStyle = '#15111c';
            ctx.fillRect(x - 11, G.HUD, 22, FIRE_Y - G.HUD);
            ctx.fillStyle = 'rgba(240,232,217,0.05)';
            ctx.fillRect(x - 11, G.HUD, 3, FIRE_Y - G.HUD);
        });
        ctx.fillStyle = COL.gold;
        s.motes.forEach(function (m) {
            ctx.globalAlpha = 0.14 + 0.12 * Math.sin(s.t * 1.1 + m.ph);
            ctx.fillRect(wrapX(m.x + s.t * m.v), m.y + Math.sin(s.t * 0.7 + m.ph) * 10, 2, 2);
        });
        ctx.globalAlpha = 1;
        drawVault(ctx);
    }

    // The altar's plinth, from its slab down into the fire.
    function drawPlinth(ctx, l) {
        ctx.fillStyle = '#2b2436';
        ctx.fillRect(l.x, l.y + LEDGE_H, l.w, l.h - LEDGE_H);
        ctx.fillStyle = 'rgba(224,196,127,0.3)';
        ctx.fillRect(l.x + 8, l.y + LEDGE_H + 6, l.w - 16, 2);
        ctx.fillRect(l.x + l.w / 2 - 1, l.y + LEDGE_H + 12, 2, l.h - LEDGE_H - 12);
    }

    function drawLedgeAt(s, ctx, l, x0) {
        if (l.gone > 0) {
            // A ghost outline that fills in shows when the stone returns.
            ctx.strokeStyle = 'rgba(141,132,156,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x0 + 0.5, l.y + 0.5, l.w * (1 - l.gone / REGROW_T), LEDGE_H);
            return;
        }
        var shakeX = l.wear > 0.15 ? Math.sin(s.t * 70) * 2 * l.wear : 0, x = x0 + shakeX;
        if (l.h > LEDGE_H) drawPlinth(ctx, l);
        ctx.fillStyle = l.crumble ? '#4d4038' : '#3b3547';
        ctx.fillRect(x, l.y, l.w, LEDGE_H);
        ctx.fillStyle = l.crumble ? '#a8946f' : '#8d849c';
        ctx.fillRect(x, l.y, l.w, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, l.y + LEDGE_H - 3, l.w, 3);
        for (var j = 22; j < l.w; j += l.crumble ? 17 : 30) ctx.fillRect(x + j, l.y + 3, l.crumble ? 2 : 1, LEDGE_H - 6);
    }

    // A ledge that reaches across the seam shows on both sides of the nave.
    function drawLedge(s, ctx, l) {
        drawLedgeAt(s, ctx, l, l.x);
        if (l.x + l.w > G.W) drawLedgeAt(s, ctx, l, l.x - G.W);
    }

    function drawFire(s, ctx) {
        var g = ctx.createLinearGradient(0, FIRE_Y - 70, 0, G.H);
        g.addColorStop(0, 'rgba(224,196,127,0)'); g.addColorStop(0.6, 'rgba(224,196,127,0.3)'); g.addColorStop(1, 'rgba(255,243,200,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(0, FIRE_Y - 70, G.W, G.H - FIRE_Y + 70);
        [[COL.gold, 0, 1], [COL.bright, 2.1, 0.55]].forEach(function (layer) {
            ctx.fillStyle = layer[0];
            ctx.beginPath();
            ctx.moveTo(0, G.H);
            var step = s.touch ? 24 : 12;
            for (var x = 0; x <= G.W; x += step) {
                var h = 18 + 10 * Math.sin(s.t * 6 + x * 0.21 + layer[1]) + 7 * Math.sin(s.t * 11 + x * 0.57);
                ctx.lineTo(x, G.H - 12 - h * layer[2]);
                ctx.lineTo(x + step / 2, G.H - 8 - h * layer[2] * 0.3);
            }
            ctx.lineTo(G.W, G.H);
            ctx.fill();
        });
    }

    // ------------------------------------------------------------------
    // Drawing: creatures and hazards
    // ------------------------------------------------------------------

    // Things near a side wall are drawn on both sides, as the nave wraps.
    function wrapped(x, fn) {
        fn(x);
        if (x < 60) fn(x + G.W); else if (x > G.W - 60) fn(x - G.W);
    }

    function drawWing(ctx, side, lift) {
        ctx.beginPath();
        ctx.moveTo(side * 4, -5);
        ctx.lineTo(side * 25, -5 - 17 * lift);
        ctx.lineTo(side * 17, -5 * lift);
        ctx.lineTo(side * 13, 7);
        ctx.lineTo(side * 5, 5);
        ctx.closePath();
        ctx.fill();
    }

    // One winged body serves gargoyle and demons; `look` sets the colours,
    // the size and whether it has a tail. Wings beat down on a flap, are
    // raised while gliding and folded on stone.
    function drawCreature(ctx, e, x, look, t) {
        var lift = e.ground ? 0.1 : (e.wing > 0 ? -0.7 : 0.75 + 0.2 * Math.sin(t * 14 + x));
        ctx.save();
        ctx.translate(x, e.y);
        ctx.scale((e.face || 1) * look.k, look.k);
        ctx.fillStyle = look.wing;
        drawWing(ctx, -1, lift); drawWing(ctx, 1, lift);
        ctx.fillStyle = look.horn;
        ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(-3, -21); ctx.lineTo(3, -14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(5, -14); ctx.lineTo(10, -21); ctx.lineTo(9, -11); ctx.fill();
        if (look.tail) {
            ctx.strokeStyle = look.body; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-5, 9); ctx.quadraticCurveTo(-16, 12, -15, 3 + 2 * Math.sin(t * 8)); ctx.stroke();
        }
        ctx.fillStyle = look.body;
        ctx.beginPath(); ctx.ellipse(0, 3, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -9, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-5, 11, 3, 4); ctx.fillRect(2, 11, 3, 4);
        ctx.fillStyle = look.eye;
        ctx.fillRect(4, -11, 3.5, 2.5);
        ctx.restore();
    }

    function drawPortal(s, ctx, d, look) {
        var grow = 1 - Math.min(1, d.spawn / 0.9), r = (d.boss ? 44 : 20) * (0.4 + grow * 0.6);
        ctx.strokeStyle = look.body;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(s.t * 22);
        ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(d.x, d.y, r * 0.5, s.t * 6, s.t * 6 + 4); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function demonLook(d) {
        if (d.boss) return BOSS_LOOK;
        var T = TIERS[d.tier];
        return { body: T.body, wing: T.wing, eye: T.eye, horn: T.horn, k: 1 + d.tier * 0.06, tail: true };
    }

    function drawDemon(s, ctx, d) {
        var look = demonLook(d);
        if (d.spawn > 0) { drawPortal(s, ctx, d, look); return; }
        // A reeling archdemon flickers: it cannot be hurt, nor hurt, for now.
        if (d.stun > 0 && Math.floor(s.t * 14) % 2) ctx.globalAlpha = 0.35;
        else if (d.grace > 0) ctx.globalAlpha = 0.55;        // not solid yet
        wrapped(d.x, function (x) { drawCreature(ctx, d, x, look, s.t); });
        ctx.globalAlpha = 1;
        if (!d.boss) return;
        ctx.fillStyle = COL.gold;
        wrapped(d.x, function (x) {
            for (var i = 0; i < d.hp; i++) ctx.fillRect(x - 20 + i * 15, d.y - 62, 10, 5);
        });
    }

    function drawPlayer(s, ctx) {
        var p = s.p;
        if (p.inv > 0 && Math.floor(s.t * 12) % 2) ctx.globalAlpha = 0.4;
        wrapped(p.x, function (x) { drawCreature(ctx, p, x, s.touch ? TOUCH_HERO : HERO, s.t); });
        ctx.globalAlpha = 1;
    }

    // The orb wears the colour of what it will hatch into; the ring around
    // it is the time left, and it trembles when the hatch is close.
    function drawOrb(s, ctx, o) {
        var left = Math.max(0, o.hatch / o.max), jitter = o.hatch < 2.5 ? Math.sin(s.t * 50) * 2 : 0;
        var bob = Math.sin(s.t * 4 + o.x) * 2, r = (s.touch ? 12 : 7) + Math.sin(s.t * (4 + (1 - left) * 14)) * 1.5;
        wrapped(o.x, function (x) {
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = TIERS[o.tier].body;
            ctx.beginPath(); ctx.arc(x + jitter, o.y + bob, r + 7, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = o.arm > 0 ? 0.5 : 1;       // still too hot to hold
            ctx.beginPath(); ctx.arc(x + jitter, o.y + bob, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = COL.bright;
            ctx.beginPath(); ctx.arc(x + jitter - 2, o.y + bob - 2, r * 0.35, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = COL.chalk; ctx.lineWidth = s.touch ? 3 : 2;
            ctx.beginPath(); ctx.arc(x + jitter, o.y + bob, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        });
    }

    function drawCenser(s, ctx, c) {
        ctx.strokeStyle = 'rgba(224,196,127,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(c.px, G.HUD); ctx.lineTo(c.bx, c.by - 14); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,120,90,' + (0.18 + 0.08 * Math.sin(s.t * 9)) + ')';
        ctx.beginPath(); ctx.arc(c.bx, c.by, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COL.gold;
        ctx.beginPath(); ctx.arc(c.bx, c.by, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(c.bx - 5, c.by - 22, 10, 8);
        ctx.fillStyle = '#ff6a4a';
        ctx.fillRect(c.bx - 9, c.by - 3, 18, 4);
        ctx.fillStyle = COL.ruby;
        ctx.fillRect(c.bx - 9, c.by + 4, 18, 2);
    }

    function drawBats(s, ctx) {
        ctx.strokeStyle = '#a99bc4';
        ctx.lineWidth = 2;
        s.bats.forEach(function (b) {
            var flap = Math.sin(s.t * 26 + b.ph) * 6;
            ctx.beginPath();
            ctx.moveTo(b.x - 9, b.y - flap); ctx.lineTo(b.x - 3, b.y); ctx.lineTo(b.x, b.y - 3);
            ctx.lineTo(b.x + 3, b.y); ctx.lineTo(b.x + 9, b.y - flap);
            ctx.stroke();
        });
    }

    function drawGeyser(s, ctx, g) {
        var top = FIRE_Y - GEYSER_H, burning = geyserBurning(g);
        wrapped(g.x, function (x) {
            if (!burning) {
                // Warning: a faint shaft that brightens towards the eruption.
                ctx.fillStyle = 'rgba(255,243,200,' + (0.05 + 0.14 * Math.min(1, g.t / GEYSER_WARN) * (0.6 + 0.4 * Math.sin(s.t * 30))) + ')';
                ctx.fillRect(x - 22, top, 44, GEYSER_H);
                return;
            }
            for (var y = FIRE_Y; y > top; y -= 12) {
                var w = 20 + 6 * Math.sin(s.t * 24 + y * 0.12);
                ctx.fillStyle = COL.gold;
                ctx.fillRect(x - w, y - 12, w * 2, 12);
                ctx.fillStyle = COL.bright;
                ctx.fillRect(x - w * 0.5, y - 12, w, 12);
            }
        });
    }

    // Tenebrae: only a pool of light around the gargoyle remains; demons
    // betray themselves by their eyes. The nave wraps, so the light does too:
    // the screen is split at the point opposite the gargoyle and each side is
    // lit from whichever image of it (x or x ± W) is nearer.
    function drawDarkness(s, ctx) {
        // The halves overlap by a pixel: where they only met, a canvas scaled by
        // a fractional factor showed a faint bright line down the nave. The
        // overlap lies in the darkest part, where it cannot be seen.
        var p = s.p, left = p.x < G.W / 2, seam = Math.round(wrapX(p.x + G.W / 2));
        var parts = [[0, seam + 1, left ? p.x : p.x - G.W], [seam, G.W, left ? p.x + G.W : p.x]];
        parts.forEach(function (part) {
            var g = ctx.createRadialGradient(part[2], p.y, 50, part[2], p.y, 230);
            g.addColorStop(0, 'rgba(6,5,10,0)'); g.addColorStop(1, 'rgba(6,5,10,0.95)');
            ctx.fillStyle = g;
            ctx.fillRect(part[0], G.HUD, part[1] - part[0], FIRE_Y - 24 - G.HUD);
        });
        ctx.fillStyle = '#ff5a6e';
        s.demons.forEach(function (d) {
            if (d.spawn > 0) return;
            wrapped(d.x, function (x) {
                ctx.fillRect(x + d.face * 2 - 1, d.y - 11, 3, 3);
                ctx.fillRect(x + d.face * 8 - 1, d.y - 11, 3, 3);
            });
        });
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        s.ledges.forEach(function (l) { drawLedge(s, ctx, l); });
        s.censers.forEach(function (c) { drawCenser(s, ctx, c); });
        s.demons.forEach(function (d) { drawDemon(s, ctx, d); });
        drawBats(s, ctx);
        drawPlayer(s, ctx);
        if (s.cfg.dark) drawDarkness(s, ctx);
        s.orbs.forEach(function (o) { drawOrb(s, ctx, o); });
        s.geysers.forEach(function (g) { drawGeyser(s, ctx, g); });
        drawFire(s, ctx);
        if (s.banner.t > 0) {
            ctx.globalAlpha = Math.min(1, s.banner.t);
            G.text(s.banner.text, G.W / 2, 262, { size: 30, bold: true, color: COL.gold, align: 'center', glow: COL.gold });
            ctx.globalAlpha = 1;
        }
    }

    function hud(s) {
        var boss = s.demons.filter(function (d) { return d.boss; })[0];
        if (boss) return 'ARCHDEMON ' + boss.hp + '/3';
        return 'WAVE ' + Math.max(1, s.wave + 1) + '/' + s.cfg.waves.length + '  FOES ' + (s.demons.length + s.orbs.length);
    }

    G.register('cathedral', {
        title: 'GARGOYLE',
        blurb: 'Dive on the demons from above, then catch their souls before they hatch again.',
        controls: [
            'Hold FLAP to climb on phone; release to dive',
            'SPACE / ↑: tap to climb, hold to hover · ← → steer',
            'Strike from above, then catch the bright souls',
            'Walls wrap · avoid fire, censers and geysers'
        ],
        levelNames: ['Matins', 'Lauds', 'The Belfry', 'Crumbling Triforium', 'The Censer', 'Wraith Choir', 'Holy Fire', 'Twin Thuribles', 'Tenebrae', 'Archdemon'],
        colors: { bg: '#110f16', fg: COL.chalk, accent: COL.gold, dim: '#8d849c' },
        lives: LIVES,
        // An organ processional in D harmonic minor: long pedal bass, slow
        // chord shimmer and almost no drums.
        music: {
            bpm: 92, root: 38, scale: 'harmonic', prog: [0, 3, 4, 0, 5, 3, 4, 0],
            bass: 'x-------5---x---',
            lead: [
                '7---9-7-4---2-4-', '5---a-7-5---3-5-', '6---8-6-4---1-4-', '7-6-7-9-b---9-7-',
                '9---7-5-9---c-9-', 'a---8-7-5---7-a-', '8-6-4-6-8-b-d-b-', 'e---b---7-------'
            ],
            arp: '0.2.1.3.',
            drums: { k: 'x.......x.......', h: '....x.......x...' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // Flapping is the A button; ↑ flaps too on a keyboard, but on the pad a
        // two-button steering bar and one big FLAP button are easier to hit.
        touch: { a: 'FLAP', hide: ['up', 'down', 'b'] }
    });
})();
