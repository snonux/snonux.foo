/*
 * Polar Rush — the aurora theme's game: a top-down downhill slalom under the
 * northern lights.
 *
 * The slope scrolls up as the skier descends. Carving bleeds speed, tucking
 * builds it, and a jump clears rocks and crevasses (ramps throw the skier much
 * higher). Every course is built around a "racing line" through its gates:
 * hazards are kept a little away from that line, so a course is always
 * skiable, and everything that makes a level special (wind, the yeti, moguls,
 * ice, the avalanche, the storm) attacks the player's ability to stay on it.
 *
 * Three runs: a forest with ramps to learn the line and the jump, a crevasse
 * field with wind and the yeti, and the storm finale with moguls, ice, a
 * tree chute and the avalanche.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var HORIZON = 98;                 // screen y where the sky strip ends and the slope begins
    var START_X = 480, GATE0 = 700;   // skier start column, world y of the first gate
    var ROW0 = 560;                   // first row of hazards: the skier is up to speed by then
    var EDGE = 34, SKIER_R = 9;       // snow bank at both sides, skier's collision radius
    var GRAVITY = 800, TUCK_SPEED = 440;
    // The avalanche never falls further behind than this, and a crash throws
    // it back this far; just outside the view, so it is always a real threat.
    var LEASH = 300;
    // A chute's tree walls stand at least CHUTE from the racing line, and
    // nothing else stands within LANE of it.
    var CHUTE = 150, LANE = 90;
    var CHASE = 5;                    // seconds a yeti keeps up its chase
    var GREEN = '#00ffb3', TEAL = '#00cfe8', PURPLE = '#c084fc', NAVY = '#050d1a', SNOW = '#e0f8f0', RED = '#ff5d7a';
    var PINE_TIERS = ['#0b4a44', '#0f6457', '#14806b'];
    var TAU = Math.PI * 2;
    // Overlay text grows from 20 to 28px on touch: at portrait scale that
    // gives an 11px label instead of an 8px label. Labels beside the skier stay
    // below POP_TOP, clear of the status row and the yeti marker under the sky.
    var POP_TOP = HORIZON + 84;

    // ------------------------------------------------------------------
    // Course generation
    // ------------------------------------------------------------------

    // What each run adds. `tier` sets how tight the course is: the slope of
    // every number in config() is gentle on purpose, because a later run is
    // harder mostly through what it adds, and the finale must still be
    // finished by a player who reacts in a quarter of a second.
    var RUNS = [
        { tier: 1, len: 15400, rocks: true, ramps: true },
        { tier: 4, len: 19600, rocks: true, ramps: true, cracks: true, chasm: 0.36, wind: 52, yeti: 334 },
        { tier: 8, len: 25200, rocks: true, ramps: true, cracks: true, chasm: 0.2, wind: 64, yeti: 350, bumps: true, aval: 282, storm: true }
    ];

    // Everything that changes from level to level lives here, so the rest of
    // the code only asks the config what the level has.
    function config(level) {
        var run = RUNS[level - 1], tier = run.tier, gap = 560 - tier * 10;
        // On the touch pad one thumb works both TUCK and JUMP, so a hop comes
        // later and costs the tuck: the phone gets a wider lane, lighter wind
        // and slower chasers to make up for it.
        var soft = G.isTouch() ? 1 : 0;
        return {
            touch: !!soft, label: soft ? 28 : 20,
            tier: tier, len: run.len, gap: gap, gateW: 150 - tier * 4,
            // The lateral step between two gates is capped by their spacing,
            // otherwise a tight course would ask for turns nobody can make.
            swing: Math.min(120 + tier * 6, gap * 0.45),
            rowGap: 118 - tier * 4, cruise: 300 + tier * 4,
            // Free space either side of the racing line. It shrinks only a
            // little: wind and ice already push the skier off the line late on.
            clear: 66 - tier + soft * 8,
            rocks: !!run.rocks, ramps: !!run.ramps, cracks: !!run.cracks,
            wind: (run.wind || 0) * (1 - soft * 0.2),
            // The yeti is a little faster than an upright skier going straight
            // (cruise + 18) and much faster than one who is carving, but far
            // slower than a tuck: an upright skier who keeps turning can be
            // caught within the CHASE seconds, a tucked one never is.
            yeti: run.yeti ? run.yeti - soft * 8 : 0,
            chasm: run.chasm || 0, bumps: !!run.bumps,
            aval: run.aval ? run.aval - soft * 14 : 0,
            storm: !!run.storm,
            // Enough for an upright run with some missed gates and a crash;
            // dawdling or missing every other gate still runs it out.
            time: run.len / (240 + tier * 2) + 10
        };
    }

    // The storm run has a tree-lined chute in its middle third.
    function chuteAt(cfg, y) {
        return cfg.storm && y > cfg.len * 0.4 && y < cfg.len * 0.62;
    }

    // Gates zigzag: most steps flip the side, so skiing straight down misses.
    function buildGates(cfg, rnd) {
        var gates = [], x = START_X, dir = rnd() < 0.5 ? -1 : 1;
        var n = Math.floor((cfg.len - 500 - GATE0) / cfg.gap) + 1;
        for (var i = 0; i < n; i++) {
            if (rnd() < 0.8) dir = -dir;
            var shift = cfg.swing * (0.5 + 0.5 * rnd());
            if (x + dir * shift < 140 || x + dir * shift > 820) dir = -dir;
            x = G.clamp(x + dir * shift, 140, 820);
            gates.push({ x: x, y: GATE0 + i * cfg.gap, w: cfg.gateW, state: 0 });
        }
        return gates;
    }

    // The racing line: straight segments from gate centre to gate centre.
    function lineX(s, y) {
        var g = s.gates, i = Math.floor((y - GATE0) / s.cfg.gap);
        if (i < 0) return G.lerp(START_X, g[0].x, G.clamp(y / GATE0, 0, 1));
        if (i >= g.length - 1) return g[g.length - 1].x;
        return G.lerp(g[i].x, g[i + 1].x, (y - g[i].y) / s.cfg.gap);
    }

    // A ramp sits on the racing line and is built facing along it: `aim` is
    // the sideways travel per unit of descent that its launch gives the
    // skier. A flight can hardly be steered, so a ramp just below a gate
    // (where the line turns) would otherwise throw the skier off the course.
    // It aims at where the line is 380px on, about where a flight ends (320px
    // for a plain launch, up to 470 for a popped one at tuck speed), so even
    // a flight across a gate comes down near the line.
    function addRamp(s, y) {
        var aim = (lineX(s, y + 380) - lineX(s, y + 20)) / 360;
        s.obs.push({ k: 'ramp', x: lineX(s, y), y: y, w: 52, h: 16, aim: aim });
    }

    // A chasm lies across the racing line and has to be jumped; half of them
    // come with a ramp just uphill, which carries the skier over for points.
    // Returns whether it got one.
    function addChasm(s, x, y) {
        var w = 300 + s.rnd() * 140, ramp = s.rnd() < 0.5;
        s.obs.push({ k: 'crev', x: G.clamp(x, EDGE + w / 2, G.W - EDGE - w / 2), y: y, w: w, h: 26 });
        if (ramp) addRamp(s, y - 70);
        return ramp;
    }

    function addMoguls(s, x, y) {
        for (var j = 0; j < 7; j++) {
            s.obs.push({ k: 'mogul', x: x + (s.rnd() - 0.5) * 220, y: y + (s.rnd() - 0.5) * s.cfg.gap * 0.5, r: 12 });
        }
    }

    // One set piece at most between two gates, placed on the racing line so
    // that following the course means dealing with it. The flight off a
    // chasm's ramp comes down only about a hundred pixels short of where the
    // next chasm would lie, too close to jump again, so that one is left out.
    function buildFeatures(s) {
        var cfg = s.cfg, g = s.gates, flown = false;
        for (var i = 1; i < g.length - 1; i++) {
            var v = s.rnd(), y = g[i].y + cfg.gap * 0.5, x = lineX(s, y), landing = flown;
            flown = false;
            if (v < cfg.chasm) flown = !landing && addChasm(s, x, y);
            else if (cfg.ramps && v < cfg.chasm + 0.22) addRamp(s, g[i].y + 70);
            else if (cfg.bumps && v < cfg.chasm + 0.4) addMoguls(s, x, y);
            else if (cfg.bumps && v < cfg.chasm + 0.58) s.obs.push({ k: 'ice', x: x, y: y, rx: 90 + s.rnd() * 60, ry: 55 + s.rnd() * 35 });
        }
    }

    // A flight cannot be steered much, so the strip it lands in (along the
    // racing line) is kept free of scattered hazards: a long one below every
    // ramp (the longest flight plus room to react after touching down),
    // and a shorter, wider one below every chasm, because that jump is
    // forced and its landing spot is not the player's choice either. An ice
    // patch gets one too, from its top edge to well below it: the skier
    // slides across with next to no grip and needs room to catch the line.
    function landingStrips(obs) {
        var strips = [];
        obs.forEach(function (o) {
            if (o.k === 'ramp') strips.push({ y: o.y, len: 620, half: 100 });
            else if (o.k === 'crev') strips.push({ y: o.y, len: 270, half: 110 });
            else if (o.k === 'ice') strips.push({ y: o.y - o.ry, len: o.ry * 2 + 220, half: 110 });
        });
        return strips;
    }

    function inLanding(strips, y, off) {
        return strips.some(function (r) { return off < r.half && y > r.y && y < r.y + r.len; });
    }

    // Scattered hazards are rejected when they would sit on the racing line:
    // that clearance is what guarantees every course can be skied.
    function addHazard(s, x, y, strips) {
        var cfg = s.cfg, v = s.rnd(), off = Math.abs(x - lineX(s, y));
        if (inLanding(strips, y, off)) return;
        // Inside a chute the two tree walls are the hazard; loose trees and
        // rocks are only allowed close to them, or there would be no lane
        // left once the wind pushes.
        if (chuteAt(cfg, y) && off < LANE) return;
        if (cfg.cracks && v < 0.1) {
            var w = 60 + s.rnd() * 60;
            if (off > cfg.clear + w / 2) s.obs.push({ k: 'crev', x: x, y: y, w: w, h: 22 });
            return;
        }
        var rock = cfg.rocks && v < 0.36, r = rock ? 11 : 13;
        if (off > cfg.clear + r) s.obs.push({ k: rock ? 'rock' : 'pine', x: x, y: y, r: r });
    }

    function addWalls(s, y) {
        for (var side = -1; side <= 1; side += 2) {
            var x = lineX(s, y) + side * (CHUTE + s.rnd() * 30);
            s.obs.push({ k: 'pine', x: x, y: y, r: 13 });
            s.obs.push({ k: 'pine', x: x + side * (40 + s.rnd() * 50), y: y + s.rnd() * 30, r: 13 });
        }
    }

    function buildRows(s) {
        // Only the set pieces exist yet, so every crevasse here is a chasm.
        var cfg = s.cfg, strips = landingStrips(s.obs);
        for (var y = ROW0; y < cfg.len - 260; y += cfg.rowGap) {
            var n = 2 + (s.rnd() < cfg.tier * 0.06 ? 1 : 0) + (s.rnd() < cfg.tier * 0.025 ? 1 : 0);
            for (var j = 0; j < n; j++) addHazard(s, 40 + s.rnd() * 880, y + s.rnd() * cfg.rowGap * 0.8, strips);
            if (chuteAt(cfg, y)) addWalls(s, y);
        }
    }

    function buildFlakes(cfg) {
        var flakes = [];
        for (var i = 0; i < (cfg.storm ? 150 : 60); i++) {
            flakes.push({ x: G.rnd(0, G.W), y: G.rnd(HORIZON, G.H), v: G.rnd(30, 90), size: G.rnd(1, 3) });
        }
        return flakes;
    }

    function init(level) {
        var cfg = config(level), rnd = G.rng(level * 7919 + 11);
        var s = {
            cfg: cfg, rnd: rnd, gates: buildGates(cfg, rnd), obs: [], head: 0, nextGate: 0,
            sk: { x: START_X, y: 0, vx: 0, vy: 120, z: 0, vz: 0, air: 0, stun: 0, inv: 0, tuck: false, ice: false, buf: 0, face: 0, big: false },
            lead: 250, cam: -250, time: cfg.time, clock: 0, streak: 0, passed: 0,
            wind: { v: 0, to: 0, t: 4 },
            yeti: cfg.yeti ? { mode: 'lurk', x: 0, y: -999, t: 0, cool: 3, slow: 0, next: 0, at: [0.2 * cfg.len, 0.5 * cfg.len, 0.78 * cfg.len] } : null,
            av: cfg.aval ? { y: -LEASH, on: false } : null,
            trail: [], pops: [], flakes: buildFlakes(cfg), bolt: 5,
            snd: { carve: 0, rumble: 0, growl: 0, ice: 0 }
        };
        buildFeatures(s);
        buildRows(s);
        // Sorted by y so update and draw only ever walk the visible window.
        s.obs.sort(function (a, b) { return a.y - b.y; });
        G.cam.y = s.cam;
        return s;
    }

    // ------------------------------------------------------------------
    // Skier
    // ------------------------------------------------------------------

    // Labels are kept in screen space: the engine's popups are tied to the
    // world, which at skiing speed streaks them up under the HUD. A label
    // appears beside the skier, on the side with more room, so it covers
    // neither the skier nor the slope ahead, and fades where it is. There
    // are two lines at most, the newer one below, so that two events at once
    // (a gate and a jump) both stay readable and the stack never reaches up
    // into the yeti marker's row.
    function say(s, text, color, alert) {
        var sk = s.sk, right = sk.x < G.W / 2, y = Math.max(POP_TOP + s.cfg.label + 4, sk.y - s.cam + 6);
        // A warning is not pushed out by score labels: the older score goes.
        if (s.pops.length > 1) s.pops.splice(s.pops[0].alert && !s.pops[1].alert ? 1 : 0, 1);
        if (s.pops.length) s.pops[0].y = Math.min(s.pops[0].y, y - s.cfg.label - 4);
        s.pops.push({ x: sk.x + (right ? 28 : -28), y: y, align: right ? 'left' : 'right', text: text, color: color, alert: !!alert, life: 1.1 });
    }

    function updatePops(s, dt) {
        s.pops = s.pops.filter(function (p) {
            p.life -= dt;
            return p.life > 0;
        });
    }

    function spray(s, n, dir) {
        var sk = s.sk;
        G.burst(sk.x, sk.y, { n: n, color: '#dff6ff', speed: 150, life: 0.4, size: 2, angle: -Math.PI / 2 - dir * 0.9, spread: 1.1, drag: 2 });
    }

    function jump(s, vz, big) {
        var sk = s.sk;
        sk.vz = vz; sk.z = 0.01; sk.air = 0; sk.buf = 0; sk.big = big;
        if (big) G.tone(220, 0.35, { type: 'triangle', slide: 990, vol: 0.2 });
        else G.sfx('jump');
        spray(s, 6, 0);
    }

    function carveSound(s, dt, dir) {
        s.snd.carve -= dt;
        if (s.snd.carve > 0) return;
        if (dir) {
            s.snd.carve = 0.14;
            G.noise(0.13, { filter: 'highpass', freq: 2600, vol: 0.05 });
            spray(s, 2, dir);
        } else if (s.sk.tuck) {
            // The tuck is a rush of wind rather than an edge on snow.
            s.snd.carve = 0.3;
            G.noise(0.32, { filter: 'bandpass', freq: 500, slide: 900, vol: 0.05 });
        }
    }

    // On the ground the skis pull the sideways speed toward where the player
    // points them; how hard is the grip, which ice takes away. Carving lowers
    // the speed the slope can hold, a tuck raises it but steers worse.
    function steerGround(s, dt, dir) {
        var sk = s.sk, cfg = s.cfg;
        // ↓ on the keyboard; on a phone the TUCK button (B), kept off the
        // direction pad so that a sliding thumb never tucks by accident.
        sk.tuck = G.key.down || G.key.b;
        if (sk.buf > 0) { jump(s, 230, false); return; }
        var lat = sk.tuck ? 190 : 270, grip = sk.ice ? 1 : 7;
        sk.vx += (dir * lat + s.wind.v - sk.vx) * Math.min(1, grip * dt);
        var term = (sk.tuck ? TUCK_SPEED : cfg.cruise) * (dir ? 0.84 : 1);
        sk.vy += (term - sk.vy) * (term > sk.vy ? 1 : 1.6) * dt;
        carveSound(s, dt, sk.ice ? 0 : dir);
    }

    function steer(s, dt) {
        var sk = s.sk, dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        sk.inv = Math.max(0, sk.inv - dt);
        // A short buffer lets a jump pressed a moment early still happen.
        sk.buf = G.hit.a ? 0.2 : Math.max(0, sk.buf - dt);
        if (sk.stun > 0) { sk.stun -= dt; sk.tuck = false; return; }
        if (sk.z > 0) {
            // Airborne: no edges to carve with. Leaning still drifts the
            // skier a little, enough to line up the landing after a ramp.
            // Only half the wind counts up here, so that leaning always
            // beats a gust and a flight cannot be blown off its landing.
            sk.tuck = false;
            sk.vx += (dir * 130 + s.wind.v * 0.5 - sk.vx) * 1.5 * dt;
            // The slope still pulls a slow skier along: without this a jump
            // from a standstill (after a crash) hops on the spot, and hopping
            // again and again never gets away from the avalanche.
            if (sk.vy < s.cfg.cruise) sk.vy += (s.cfg.cruise - sk.vy) * dt;
        } else {
            steerGround(s, dt, dir);
        }
        sk.face += (Math.atan2(sk.vx, Math.max(sk.vy, 80)) - sk.face) * Math.min(1, 12 * dt);
    }

    function land(s) {
        var sk = s.sk;
        sk.z = 0; sk.vz = 0;
        G.noise(0.14, { freq: 300, vol: 0.2 });
        spray(s, 10, 0);
        if (!sk.big || sk.air < 0.6) return;
        var pts = Math.floor(sk.air * 15) * 10;
        G.addScore(pts);
        say(s, 'AIR +' + pts, TEAL);
        G.sfx('coin');
    }

    function moveSkier(s, dt) {
        var sk = s.sk;
        if (sk.stun > 0) return;
        sk.x += sk.vx * dt; sk.y += sk.vy * dt;
        if (sk.x < EDGE || sk.x > G.W - EDGE) {
            // The snow bank at the edge of the piste swallows speed.
            sk.x = G.clamp(sk.x, EDGE, G.W - EDGE);
            sk.vx = 0; sk.vy -= sk.vy * 2 * dt;
        }
        if (sk.z <= 0) return;
        sk.vz -= GRAVITY * dt; sk.z += sk.vz * dt; sk.air += dt;
        if (sk.z <= 0) land(s);
    }

    // Costs a life, then leaves the skier just below what was hit with a short
    // stun and a longer spell of invulnerability to get going again.
    function crash(s, o) {
        var sk = s.sk;
        if (sk.inv > 0) return;
        G.sfx('boom');
        G.burst(sk.x, sk.y, { n: 26, color: '#dff6ff', speed: 240, life: 0.7, size: 3, drag: 2 });
        s.streak = 0;
        if (!G.loseLife()) return;
        sk.stun = 0.9; sk.inv = 2.6; sk.vx = 0; sk.vy = 0; sk.z = 0; sk.vz = 0;
        if (o) sk.y = Math.max(sk.y, o.y + (o.r || o.h / 2) + 14);
        // One mistake must cost one life: the avalanche is thrown back to
        // the full leash and (see updateAvalanche) crawls until the skier
        // is vulnerable again.
        if (s.av) s.av.y = Math.min(s.av.y, sk.y - LEASH);
    }

    // ------------------------------------------------------------------
    // Obstacles and gates
    // ------------------------------------------------------------------

    function bonus(s, o, pts, label) {
        if (o.done) return;
        o.done = true;
        G.addScore(pts);
        say(s, label + ' +' + pts, GREEN);
        G.sfx('blip');
    }

    var TOUCH = {
        // Only the big air off a ramp gets over a tree, and it does so for the
        // whole flight: the player cannot steer out of a ramp's trajectory.
        pine: function (s, o) { if (s.sk.big && s.sk.z > 0) bonus(s, o, 100, 'TREETOP'); else crash(s, o); },
        rock: function (s, o) { if (s.sk.z < 8) crash(s, o); else bonus(s, o, 25, 'CLEARED'); },
        crev: function (s, o) { if (s.sk.z < 3) crash(s, o); else bonus(s, o, o.w > 200 ? 75 : 25, 'LEAP'); },
        ramp: function (s, o) {
            var sk = s.sk;
            // A hop that has only just left the ground is the player pressing
            // jump on the lip: it is upgraded to a higher launch, not treated
            // as flying over the ramp.
            var pop = sk.z > 0 && !sk.big && sk.air < 0.15;
            if (o.done || (sk.z > 0 && !pop)) return;
            o.done = true;
            jump(s, pop || G.key.a ? 390 : 300, true);
            sk.vy += 40;
            // The ramp faces down the racing line (see addRamp), so the
            // flight ends in the strip that was kept clear for it.
            sk.vx = o.aim * sk.vy;
        },
        mogul: function (s, o) {
            var sk = s.sk;
            if (sk.z > 0) { bonus(s, o, 10, 'HOP'); return; }
            // A mogul bucks the skier into a short hop that costs speed (and
            // is then spent, so the buck itself never pays the hop bonus).
            o.done = true;
            sk.vz = 150; sk.z = 0.01; sk.air = 0; sk.big = false;
            sk.vy *= 0.85; sk.vx += G.rnd(-60, 60);
            G.tone(110, 0.1, { type: 'sine', slide: 60, vol: 0.3 });
        },
        ice: function (s) {
            if (s.sk.z > 0) return;
            s.sk.ice = true;
            if (s.snd.ice > 0) return;
            s.snd.ice = 0.25;
            G.tone(G.rnd(2200, 2900), 0.2, { type: 'sine', vol: 0.04 });
        }
    };

    function touches(sk, o) {
        var dx = sk.x - o.x, dy = sk.y - o.y;
        if (o.k === 'crev' || o.k === 'ramp') return Math.abs(dx) < o.w / 2 && Math.abs(dy) < o.h / 2;
        if (o.k === 'ice') return (dx * dx) / (o.rx * o.rx) + (dy * dy) / (o.ry * o.ry) < 1;
        return G.circ(sk.x, sk.y, SKIER_R, o.x, o.y, o.r);
    }

    function collide(s, dt) {
        var sk = s.sk, obs = s.obs;
        while (s.head < obs.length && obs[s.head].y < s.cam - 140) s.head++;
        sk.ice = false;
        s.snd.ice -= dt;
        if (sk.stun > 0) return;
        for (var i = s.head; i < obs.length && obs[i].y < sk.y + 160; i++) {
            if (touches(sk, obs[i])) TOUCH[obs[i].k](s, obs[i]);
        }
    }

    function passGate(s, g) {
        g.state = 1; s.passed++; s.streak++;
        var pts = 50 * Math.min(s.streak, 8);
        G.addScore(pts);
        say(s, '+' + pts, GREEN);
        // The chime climbs with the streak so a clean run sounds like one.
        var f = 660 * Math.pow(1.06, Math.min(s.streak, 12));
        G.tone(f, 0.08, { type: 'triangle', vol: 0.16 });
        G.tone(f * 1.5, 0.18, { type: 'triangle', vol: 0.16, delay: 0.07 });
    }

    function missGate(s, g) {
        g.state = 2; s.streak = 0;
        s.time = Math.max(0, s.time - 3);
        say(s, 'MISSED -3s', RED, true);
        G.tone(150, 0.3, { type: 'sawtooth', slide: 90, vol: 0.18 });
    }

    function checkGates(s) {
        var sk = s.sk;
        while (s.nextGate < s.gates.length && s.gates[s.nextGate].y <= sk.y) {
            var g = s.gates[s.nextGate++];
            if (Math.abs(sk.x - g.x) <= g.w / 2) passGate(s, g); else missGate(s, g);
        }
    }

    // ------------------------------------------------------------------
    // Level hazards: clock, wind, yeti, avalanche, storm
    // ------------------------------------------------------------------

    function tickClock(s, dt) {
        var before = s.time;
        s.time -= dt;
        if (s.time < 10 && Math.floor(before) !== Math.floor(s.time)) G.tone(990, 0.07, { vol: 0.12 });
        if (s.time > 0) return;
        s.time = 0;
        say(s, 'OUT OF TIME', RED, true);
        G.die();
    }

    // Gusts ramp up over about a second, so the streaking snow and the wind
    // arrows warn the player before the push is at full strength.
    function updateWind(s, dt) {
        var w = s.wind, cfg = s.cfg;
        if (!cfg.wind) return;
        w.v += (w.to - w.v) * Math.min(1, 1.5 * dt);
        w.t -= dt;
        if (w.t > 0) return;
        if (w.to) {
            w.to = 0;
            w.t = cfg.storm ? 1.5 + s.rnd() * 1.5 : 3 + s.rnd() * 2;
        } else {
            w.to = (s.rnd() < 0.5 ? -1 : 1) * cfg.wind;
            w.t = 2.5 + s.rnd() * 1.5;
            G.noise(1.4, { filter: 'bandpass', freq: 300, slide: 1400, vol: 0.14, attack: 0.5 });
        }
    }

    // The yeti comes out at three fixed spots on the course and whenever the
    // skier dawdles; a cooldown keeps it from camping on the player. Time
    // spent getting up from a crash does not count as dawdling.
    function yetiWakes(s, dt) {
        var ye = s.yeti, sk = s.sk;
        ye.slow = sk.vy < 190 && sk.stun <= 0 && sk.inv <= 0 ? ye.slow + dt : 0;
        var lair = ye.next < ye.at.length && sk.y > ye.at[ye.next];
        if (lair) ye.next++;
        return ye.cool <= 0 && (lair || ye.slow > 1.2);
    }

    function roar() {
        G.tone(140, 0.7, { type: 'sawtooth', slide: 55, vol: 0.28 });
        G.noise(0.6, { freq: 500, slide: 120, vol: 0.2 });
    }

    function startChase(s) {
        var ye = s.yeti, sk = s.sk;
        ye.mode = 'chase'; ye.t = CHASE; ye.slow = 0;
        ye.x = G.clamp(sk.x + (s.rnd() < 0.5 ? -220 : 220), 40, G.W - 40);
        ye.y = sk.y - 240;
        roar();
        say(s, 'YETI! TUCK!', PURPLE, true);
    }

    function chase(s, dt) {
        var ye = s.yeti, sk = s.sk;
        // It hangs back while the skier is still shaking off a crash, and
        // keeps its distance then: standing over the skier would turn the
        // end of the invulnerability into a second, unavoidable hit.
        var d = G.dist(ye.x, ye.y, sk.x, sk.y) || 1;
        var v = sk.inv > 0 ? (d > 170 ? s.cfg.yeti * 0.45 : 0) : s.cfg.yeti;
        ye.x += (sk.x - ye.x) / d * v * dt; ye.y += (sk.y - ye.y) / d * v * dt;
        ye.t -= dt;
        s.snd.growl -= dt;
        if (s.snd.growl <= 0) { s.snd.growl = 0.45; G.tone(70 + G.rnd(0, 20), 0.3, { type: 'sawtooth', vol: G.clamp(0.3 - d / 1500, 0.04, 0.3) }); }
        if (d < 26 && sk.z < 16 && sk.inv <= 0) {
            roar();
            crash(s, null);
            ye.mode = 'feast'; ye.cool = 6;
        } else if (ye.t <= 0 || sk.y - ye.y > 400) {
            ye.mode = 'lurk'; ye.cool = 5;
            say(s, 'ESCAPED +150', GREEN);
            G.addScore(150);
            G.sfx('power');
        }
    }

    function updateYeti(s, dt) {
        var ye = s.yeti;
        if (!ye) return;
        ye.cool -= dt;
        if (ye.mode === 'chase') chase(s, dt);
        else if (ye.mode === 'feast') { if (ye.y < s.cam) ye.mode = 'lurk'; }
        else if (yetiWakes(s, dt)) startChase(s);
    }

    function rumble(s, gap) {
        s.snd.rumble = 0.4;
        G.noise(0.5, { freq: 90 + (LEASH - gap) * 0.5, vol: G.clamp(0.4 - gap / 2000, 0.06, 0.4) });
        if (gap < 150) G.shake(3, 0.3);
        G.burst(G.rnd(0, G.W), s.av.y, { n: 4, color: '#f2fbff', speed: 200, life: 0.6, size: 4, angle: Math.PI / 2, spread: 2 });
    }

    // The avalanche gains speed down the course but is leashed to the skier,
    // so a fast start cannot shake it off. While the skier is stunned or
    // still invulnerable after a crash it only creeps, which together with
    // the push-back in crash() is what lets a crash be survived.
    function updateAvalanche(s, dt) {
        var av = s.av, sk = s.sk;
        if (!av) return;
        if (!av.on) {
            if (sk.y < 1400) return;
            av.on = true; av.y = sk.y - LEASH;
            G.sfx('alarm'); G.shake(6, 0.8);
            say(s, 'AVALANCHE! TUCK!', SNOW, true);
        }
        var v = (s.cfg.aval + 30 * sk.y / s.cfg.len) * (sk.stun > 0 || sk.inv > 0 ? 0.3 : 1);
        av.y = Math.max(av.y + v * dt, sk.y - LEASH);
        var gap = sk.y - av.y;
        s.snd.rumble -= dt;
        if (s.snd.rumble <= 0) rumble(s, gap);
        if (gap < 8) { G.sfx('bigboom'); G.die(); }
    }

    function updateStorm(s, dt) {
        if (!s.cfg.storm) return;
        s.bolt -= dt;
        if (s.bolt > 0) return;
        s.bolt = 4 + s.rnd() * 6;
        G.flash('#d8f6ff', 0.18);
        G.noise(1.3, { freq: 500, slide: 60, vol: 0.4, delay: 0.25 });
    }

    // ------------------------------------------------------------------
    // Camera, tracks and snowfall
    // ------------------------------------------------------------------

    // The faster the skier, the higher on screen: speed buys a longer view
    // downhill, while a slow skier sees what is closing in from behind.
    function updateCamera(s, dt) {
        var want = G.lerp(270, 170, G.clamp(s.sk.vy / TUCK_SPEED, 0, 1));
        s.lead += (want - s.lead) * Math.min(1, 2 * dt);
        s.cam = s.sk.y - s.lead;
        G.cam.y = s.cam;
    }

    function updateTrail(s) {
        var sk = s.sk, last = s.trail[s.trail.length - 1];
        // A jump leaves a gap in the tracks: one "cut" entry lifts the pen.
        if (sk.z > 0) { if (last && !last.cut) s.trail.push({ x: sk.x, y: sk.y, cut: true }); return; }
        if (last && !last.cut && sk.y - last.y < 12) return;
        s.trail.push({ x: sk.x, y: sk.y, cut: false });
        while (s.trail.length > 70) s.trail.shift();
    }

    // Flakes live in screen space; they drift with the wind and are swept up
    // the screen by the skier's own speed.
    function updateFlakes(s, dt) {
        var push = s.wind.v * 2.2 + (s.cfg.storm ? 90 : 0), span = G.H - HORIZON;
        s.flakes.forEach(function (f) {
            f.x = (f.x + push * dt + G.W) % G.W;
            f.y += (f.v - s.sk.vy * 0.35) * dt;
            if (f.y < HORIZON) f.y += span; else if (f.y > G.H) f.y -= span;
        });
    }

    function update(s, dt) {
        s.clock += dt;
        tickClock(s, dt);
        updateWind(s, dt);
        steer(s, dt);
        moveSkier(s, dt);
        collide(s, dt);
        checkGates(s);
        updateYeti(s, dt);
        updateAvalanche(s, dt);
        updateStorm(s, dt);
        updateCamera(s, dt);
        updateTrail(s);
        updateFlakes(s, dt);
        updatePops(s, dt);
        if (s.sk.y >= s.cfg.len) G.win(Math.floor(s.time) * 20 + G.lives * 250);
    }

    // ------------------------------------------------------------------
    // Drawing: ground
    // ------------------------------------------------------------------

    function ellipse(ctx, x, y, rx, ry) {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    }

    function tri(ctx, ax, ay, bx, by, cx, cy) {
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
    }

    // Cheap repeatable noise for decoration that must not shimmer per frame.
    function hash(n) {
        var v = Math.sin(n * 127.1) * 43758.5453;
        return v - Math.floor(v);
    }

    function drawSlope(s, ctx) {
        var grad = ctx.createLinearGradient(0, HORIZON, 0, G.H);
        grad.addColorStop(0, '#173452'); grad.addColorStop(1, '#23507a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, HORIZON - 20, G.W, G.H);
        // Sparkles are pinned to the world, which is what makes speed readable.
        ctx.fillStyle = 'rgba(200,236,255,0.3)';
        for (var row = Math.floor(s.cam / 36); row < (s.cam + G.H) / 36; row++) {
            for (var j = 0; j < 5; j++) {
                var n = row * 5 + j;
                ctx.fillRect(hash(n) * G.W, row * 36 + hash(n + 0.5) * 36 - s.cam, 2 + hash(n + 0.3) * 9, 2);
            }
        }
        // The aurora spills a slowly shifting glow onto the top of the slope.
        var glow = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 170);
        glow.addColorStop(0, Math.sin(s.clock * 0.4) > 0 ? 'rgba(0,255,179,0.16)' : 'rgba(192,132,252,0.16)');
        glow.addColorStop(1, 'rgba(0,255,179,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, HORIZON, G.W, 170);
    }

    function drawCrevasse(ctx, o, y) {
        var x0 = o.x - o.w / 2, steps = Math.ceil(o.w / 20);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        for (var i = 1; i < steps; i++) ctx.lineTo(x0 + i * 20, y - o.h / 2 + (i % 2) * 5);
        ctx.lineTo(x0 + o.w, y);
        for (i = steps - 1; i > 0; i--) ctx.lineTo(x0 + i * 20, y + o.h / 2 - (i % 2) * 5);
        ctx.closePath();
        ctx.fillStyle = '#020812';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,207,232,0.8)'; ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawRamp(ctx, o, y) {
        ctx.fillStyle = 'rgba(2,8,18,0.35)';
        ctx.fillRect(o.x - o.w / 2 + 4, y - o.h / 2 + 5, o.w, o.h);
        ctx.fillStyle = SNOW;
        ctx.fillRect(o.x - o.w / 2, y - o.h / 2, o.w, o.h);
        ctx.fillStyle = GREEN;
        for (var i = -1; i <= 1; i++) tri(ctx, o.x + i * 16 - 6, y - 5, o.x + i * 16 + 6, y - 5, o.x + i * 16, y + 5);
    }

    var GROUND = {
        crev: drawCrevasse,
        ramp: drawRamp,
        mogul: function (ctx, o, y) {
            ctx.fillStyle = 'rgba(2,8,18,0.3)'; ellipse(ctx, o.x + 3, y + 4, 15, 8);
            ctx.fillStyle = '#4f86ad'; ellipse(ctx, o.x, y, 14, 8);
            ctx.fillStyle = '#cfeeff'; ellipse(ctx, o.x - 2, y - 2, 9, 4);
        },
        ice: function (ctx, o, y) {
            ctx.fillStyle = 'rgba(0,207,232,0.2)'; ellipse(ctx, o.x, y, o.rx, o.ry);
            ctx.strokeStyle = 'rgba(224,248,240,0.5)'; ctx.lineWidth = 2;
            for (var i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.moveTo(o.x + i * o.rx * 0.4 - 16, y + i * 9 + 8); ctx.lineTo(o.x + i * o.rx * 0.4 + 16, y + i * 9 - 8);
                ctx.stroke();
            }
        }
    };

    function drawTrail(s, ctx) {
        ctx.strokeStyle = 'rgba(5,13,26,0.4)'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
        ctx.beginPath();
        var pen = false;
        s.trail.forEach(function (p) {
            if (p.cut) { pen = false; return; }
            if (pen) ctx.lineTo(p.x, p.y - s.cam); else ctx.moveTo(p.x, p.y - s.cam);
            pen = true;
        });
        ctx.stroke();
    }

    function drawFinish(s, ctx) {
        var y = s.cfg.len - s.cam;
        if (y > G.H + 20) return;
        for (var i = 0; i < 48; i++) {
            ctx.fillStyle = i % 2 ? NAVY : SNOW;
            ctx.fillRect(i * 20, y, 20, 10);
            ctx.fillStyle = i % 2 ? SNOW : NAVY;
            ctx.fillRect(i * 20, y + 10, 20, 10);
        }
        G.text('FINISH', G.W / 2, y - 12, { size: 30, bold: true, color: GREEN, align: 'center', glow: GREEN });
    }

    function drawFlag(ctx, x, y, inward, color, touch) {
        var height = touch ? 34 : 24, width = touch ? 22 : 15;
        ctx.strokeStyle = SNOW; ctx.lineWidth = touch ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - height); ctx.stroke();
        ctx.fillStyle = color;
        tri(ctx, x, y - height, x, y - height / 2, x + inward * width, y - height * 0.75);
    }

    function drawGates(s, ctx) {
        for (var i = Math.max(0, s.nextGate - 2); i < s.gates.length; i++) {
            var g = s.gates[i], y = g.y - s.cam;
            if (y > G.H + 30) break;
            var color = g.state === 2 ? RED : (i % 2 ? PURPLE : GREEN);
            ctx.globalAlpha = g.state === 1 ? 0.35 : 1;
            if (i === s.nextGate) {
                // The gate to aim for wears a pulsing dashed line.
                ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
                ctx.lineDashOffset = -s.clock * 40;
                ctx.beginPath(); ctx.moveTo(g.x - g.w / 2, y); ctx.lineTo(g.x + g.w / 2, y); ctx.stroke();
                ctx.setLineDash([]);
            }
            drawFlag(ctx, g.x - g.w / 2, y, 1, color, s.cfg.touch);
            drawFlag(ctx, g.x + g.w / 2, y, -1, color, s.cfg.touch);
        }
        ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------
    // Drawing: things that stand up
    // ------------------------------------------------------------------

    function drawPine(ctx, x, y) {
        ctx.fillStyle = 'rgba(2,8,18,0.35)'; ellipse(ctx, x + 6, y + 3, 16, 6);
        ctx.fillStyle = '#3b2a36'; ctx.fillRect(x - 2, y - 7, 4, 9);
        for (var t = 0; t < 3; t++) {
            var w = 17 - t * 4, top = y - 20 - t * 12;
            ctx.fillStyle = PINE_TIERS[t];
            tri(ctx, x - w, top + 16, x + w, top + 16, x, top);
            // Snow on the windward side of every tier.
            ctx.fillStyle = 'rgba(224,248,240,0.8)';
            tri(ctx, x - w, top + 16, x - w * 0.3, top + 16, x - w * 0.35, top + 7);
        }
    }

    function drawRock(ctx, x, y) {
        ctx.fillStyle = 'rgba(2,8,18,0.35)'; ellipse(ctx, x + 4, y + 4, 14, 6);
        ctx.fillStyle = '#56537a';
        ctx.beginPath();
        ctx.moveTo(x - 12, y + 5); ctx.lineTo(x - 8, y - 7); ctx.lineTo(x + 2, y - 11); ctx.lineTo(x + 11, y - 3); ctx.lineTo(x + 12, y + 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9a96c4';
        tri(ctx, x - 8, y - 7, x + 2, y - 11, x - 1, y - 1);
        ctx.fillStyle = SNOW;
        tri(ctx, x - 4, y - 9, x + 2, y - 11, x + 6, y - 7);
    }

    function drawSkier(s, ctx) {
        var sk = s.sk, y = sk.y - s.cam;
        // Blink while invulnerable so the player knows hits do not count.
        if (sk.inv > 0 && sk.stun <= 0 && Math.floor(s.clock * 14) % 2) return;
        ctx.fillStyle = 'rgba(2,8,18,0.4)'; ellipse(ctx, sk.x + sk.z * 0.3, y + 4, 11, 5);
        ctx.save();
        ctx.translate(sk.x, y - sk.z);
        // A portrait phone scales the course to 40%; keep the skier distinct
        // without cropping the full-width gates or shortening the downhill view.
        var size = (s.cfg.touch ? 1.45 : 1) * (1 + sk.z / 90);
        ctx.scale(size, size);
        ctx.rotate(sk.stun > 0 ? s.clock * 14 : -sk.face);
        ctx.strokeStyle = TEAL; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-4, -13); ctx.lineTo(-4, 14); ctx.moveTo(4, -13); ctx.lineTo(4, 14);
        ctx.stroke();
        if (!sk.tuck) {
            ctx.strokeStyle = SNOW; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-6, 0); ctx.lineTo(-13, -9); ctx.moveTo(6, 0); ctx.lineTo(13, -9);
            ctx.stroke();
        }
        ctx.fillStyle = PURPLE; ctx.fillRect(-2, -12, 4, 8);            // scarf streaming behind
        ctx.fillStyle = GREEN; ellipse(ctx, 0, 0, 7, sk.tuck ? 6 : 9);
        ctx.fillStyle = SNOW; ellipse(ctx, 0, sk.tuck ? 4 : 2, 4, 4);
        ctx.restore();
    }

    // Trees and rocks below the skier are drawn after it, so the skier passes
    // behind what is in front and in front of what is behind.
    function drawWorld(s, ctx) {
        var obs = s.obs, skierDrawn = false, i, o;
        for (i = s.head; i < obs.length && obs[i].y < s.cam + G.H + 120; i++) {
            if (GROUND[obs[i].k]) GROUND[obs[i].k](ctx, obs[i], obs[i].y - s.cam);
        }
        drawTrail(s, ctx);
        drawFinish(s, ctx);
        drawGates(s, ctx);
        for (i = s.head; i < obs.length && obs[i].y < s.cam + G.H + 60; i++) {
            o = obs[i];
            if (!skierDrawn && o.y > s.sk.y) { drawSkier(s, ctx); skierDrawn = true; }
            if (o.k === 'pine') drawPine(ctx, o.x, o.y - s.cam);
            else if (o.k === 'rock') drawRock(ctx, o.x, o.y - s.cam);
        }
        if (!skierDrawn) drawSkier(s, ctx);
    }

    function drawYeti(s, ctx) {
        var ye = s.yeti;
        if (!ye || ye.mode === 'lurk') return;
        var y = ye.y - s.cam, swing = ye.mode === 'chase' ? Math.sin(s.clock * 16) * 6 : 0;
        ctx.fillStyle = 'rgba(2,8,18,0.4)'; ellipse(ctx, ye.x + 5, y + 14, 18, 7);
        ctx.fillStyle = '#eef8ff';
        ellipse(ctx, ye.x, y, 15, 18);
        ellipse(ctx, ye.x - 17, y - 8 + swing, 6, 11);
        ellipse(ctx, ye.x + 17, y - 8 - swing, 6, 11);
        ellipse(ctx, ye.x, y - 19, 10, 9);
        ctx.fillStyle = '#7a8fb0'; ellipse(ctx, ye.x, y - 17, 6, 5);
        ctx.fillStyle = RED;
        ctx.fillRect(ye.x - 4, y - 20, 2, 2); ctx.fillRect(ye.x + 2, y - 20, 2, 2);
        ctx.fillStyle = NAVY; ctx.fillRect(ye.x - 3, y - 15, 6, 2 + Math.abs(swing) / 3);
    }

    function drawAvalanche(s, ctx) {
        var av = s.av;
        if (!av || !av.on || av.y - s.cam < HORIZON - 30) return;
        var y = av.y - s.cam, t = s.clock;
        ctx.fillStyle = '#e6f6fc';
        ctx.beginPath();
        ctx.moveTo(0, HORIZON - 20);
        for (var x = 0; x <= G.W; x += 24) ctx.lineTo(x, y + 14 * Math.sin(x * 0.05 + t * 6) + 8 * Math.sin(x * 0.13 - t * 9));
        ctx.lineTo(G.W, HORIZON - 20);
        ctx.closePath(); ctx.fill();
        // Boiling shadows inside the wall keep it from reading as a flat sheet.
        ctx.fillStyle = 'rgba(96,150,190,0.4)';
        for (var i = 0; i < 14; i++) ellipse(ctx, hash(i) * G.W, y - 26 - hash(i + 0.4) * 50 + 8 * Math.sin(t * 5 + i), 34, 12);
    }

    // ------------------------------------------------------------------
    // Drawing: weather, sky and overlays
    // ------------------------------------------------------------------

    // Storm fog thickens toward the bottom edge, where things first appear.
    // It stays thin enough that a pale tree can still be made out there on a
    // small screen: the storm shortens the view, it must not blind.
    function drawFog(ctx) {
        var grad = ctx.createLinearGradient(0, 320, 0, G.H);
        grad.addColorStop(0, 'rgba(150,190,214,0)'); grad.addColorStop(1, 'rgba(150,190,214,0.62)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 320, G.W, G.H - 320);
    }

    function drawFlakes(s, ctx) {
        var lean = s.wind.v * 0.06 + (s.cfg.storm ? 5 : 0);
        ctx.strokeStyle = 'rgba(224,248,240,0.75)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        s.flakes.forEach(function (f) {
            ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + lean * f.size + 1, f.y + f.size);
        });
        ctx.stroke();
    }

    // A chevron at the bottom edge shows where the next gate will appear; it
    // is what makes the storm run fair.
    function drawGateHint(s, ctx) {
        var g = s.gates[s.nextGate];
        if (!g || g.y - s.cam < G.H - 20) return;
        ctx.fillStyle = s.nextGate % 2 ? PURPLE : GREEN;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.clock * 8);
        var half = s.cfg.touch ? 20 : 12, top = s.cfg.touch ? 32 : 22;
        tri(ctx, g.x - half, G.H - top, g.x + half, G.H - top, g.x, G.H - 8);
        ctx.globalAlpha = 1;
    }

    // The status row under the sky strip: avalanche on the left, wind in the
    // middle, the last seconds on the right. Dark plates keep the labels
    // readable on top of the avalanche.
    function plate(ctx, x, w) {
        ctx.fillStyle = 'rgba(5,13,26,0.72)';
        ctx.fillRect(x, HORIZON + 6, w, 30);
    }

    function drawWind(s, ctx) {
        var n = Math.round(Math.abs(s.wind.v) / 30), dir = s.wind.v > 0 ? 1 : -1;
        if (!n) return;
        var arrows = n * 16 + 10, half = s.cfg.touch ? 54 : 40;
        plate(ctx, G.W / 2 - half - (dir < 0 ? arrows : 0), half * 2 + arrows);
        G.text('WIND', G.W / 2, HORIZON + 28, { size: s.cfg.label, color: SNOW, align: 'center', bold: true, max: s.cfg.touch ? 90 : 68 });
        ctx.fillStyle = TEAL;
        for (var i = 1; i <= n; i++) {
            var x = G.W / 2 + dir * (half - 14 + i * 16);
            tri(ctx, x, HORIZON + 12, x, HORIZON + 30, x + dir * 11, HORIZON + 21);
        }
    }

    // One aurora curtain hanging from y; `scale` stretches it (the sky strip
    // uses 1, the ending a much taller one) and `ceil` is the highest it reaches.
    function drawRibbon(ctx, t, phase, color, y, scale, ceil) {
        ctx.fillStyle = color;
        // Batch each brightness band instead of issuing 160 fills per ribbon.
        // The same curtains stay animated at the phone's native canvas scale.
        for (var band = 0; band < 2; band++) {
            ctx.globalAlpha = band ? 0.22 : 0.12;
            ctx.beginPath();
            for (var x = 0; x < G.W; x += 12) {
                var base = y + scale * (9 * Math.sin(x * 0.008 + t * 0.5 + phase) + 5 * Math.sin(x * 0.021 - t * 0.8 + phase));
                var h = scale * (26 + 14 * Math.sin(x * 0.013 + t * 0.9 + phase * 2));
                var top = band ? base - h * 0.35 : Math.max(ceil, base - h);
                ctx.rect(x, top, 12, base - top);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // The sky strip is painted last so the slope scrolls away underneath it.
    function drawSky(s, ctx) {
        var grad = ctx.createLinearGradient(0, 0, 0, HORIZON);
        grad.addColorStop(0, NAVY); grad.addColorStop(1, '#0a2238');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, G.W, HORIZON - 14);
        ctx.fillStyle = SNOW;
        for (var i = 0; i < 44; i++) {
            ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(s.clock * 1.7 + i * 2.1));
            ctx.fillRect(hash(i + 7) * G.W, G.HUD + hash(i + 9.3) * 46, 2, 2);
        }
        ctx.globalCompositeOperation = 'lighter';
        drawRibbon(ctx, s.clock, 0, GREEN, 78, 1, G.HUD + 4);
        drawRibbon(ctx, s.clock, 2.1, TEAL, 78, 1, G.HUD + 4);
        drawRibbon(ctx, s.clock, 4.4, PURPLE, 78, 1, G.HUD + 4);
        ctx.globalCompositeOperation = 'source-over';
        drawRidge(ctx);
    }

    function drawRidge(ctx) {
        ctx.beginPath();
        ctx.moveTo(0, HORIZON + 1);
        for (var x = 0; x <= G.W; x += 16) ctx.lineTo(x, HORIZON - 5 - 11 * Math.abs(Math.sin(x * 0.011)) - 6 * Math.abs(Math.sin(x * 0.037 + 1)));
        ctx.lineTo(G.W, HORIZON + 1);
        ctx.closePath();
        ctx.fillStyle = '#173452'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,179,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    function marker(ctx, s, y, color, r) {
        ctx.fillStyle = color;
        ellipse(ctx, G.W - 14, 122 + G.clamp(y / s.cfg.len, 0, 1) * 390, r, r);
    }

    // Course meter down the right edge: skier, finish, and whatever is chasing.
    function drawMeter(s, ctx) {
        ctx.fillStyle = 'rgba(5,13,26,0.55)';
        ctx.fillRect(G.W - 17, 118, 6, 398);
        ctx.fillStyle = SNOW; ctx.fillRect(G.W - 20, 512, 12, 3);
        if (s.av && s.av.on) marker(ctx, s, s.av.y, '#ffffff', 5);
        if (s.yeti && s.yeti.mode === 'chase') marker(ctx, s, s.yeti.y, PURPLE, 4);
        marker(ctx, s, s.sk.y, GREEN, 4);
    }

    // Both chasers start out of sight above the slope, so the top edge says
    // where they are until they can be seen.
    function drawAvalancheWarning(s, ctx, pulse) {
        var av = s.av, gap = av && av.on ? s.sk.y - av.y : LEASH;
        if (gap >= LEASH - 10) return;
        var band = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 60);
        band.addColorStop(0, 'rgba(240,250,255,' + ((1 - gap / LEASH) * (0.5 + 0.4 * pulse)).toFixed(3) + ')');
        band.addColorStop(1, 'rgba(240,250,255,0)');
        ctx.fillStyle = band;
        ctx.fillRect(0, HORIZON, G.W, 60);
        plate(ctx, 12, s.cfg.touch ? 280 : 216);
        G.text('AVALANCHE ' + Math.max(0, Math.round(gap / 10)) + 'm', 20, HORIZON + 28, { size: s.cfg.label, bold: true, color: gap < 150 ? RED : SNOW, max: s.cfg.touch ? 264 : 200 });
    }

    // The yeti's marker sits one row below the status row and keeps its
    // label beside the arrow, so it collides with neither the wind and
    // avalanche plates above nor the floating labels below.
    function drawYetiMarker(s, ctx, pulse) {
        var ye = s.yeti;
        if (!ye || ye.mode !== 'chase' || ye.y - s.cam > HORIZON + 20) return;
        var x = G.clamp(ye.x, 24, G.W - (s.cfg.touch ? 250 : 190));
        ctx.globalAlpha = pulse;
        ctx.fillStyle = PURPLE;
        tri(ctx, x - 11, HORIZON + 60, x + 11, HORIZON + 60, x, HORIZON + 43);
        ctx.globalAlpha = 1;
        G.text('YETI ' + Math.round((s.sk.y - ye.y) / 10) + 'm', x + 18, HORIZON + 60, { size: s.cfg.label, bold: true, color: PURPLE, max: s.cfg.touch ? 210 : 140 });
    }

    function drawChasers(s, ctx) {
        var pulse = 0.6 + 0.4 * Math.sin(s.clock * 10);
        drawAvalancheWarning(s, ctx, pulse);
        drawYetiMarker(s, ctx, pulse);
    }

    function drawPops(s, ctx) {
        s.pops.forEach(function (p) {
            ctx.globalAlpha = Math.min(1, p.life * 2);
            G.text(p.text, p.x, p.y, { size: s.cfg.label, bold: true, color: p.color, align: p.align });
        });
        ctx.globalAlpha = 1;
    }

    function drawAlerts(s) {
        // The last seconds flash at the right end of the status row, where
        // nothing else is ever drawn.
        if (s.time < 10 && Math.floor(s.clock * 4) % 2) {
            G.text(s.time.toFixed(1), G.W - 30, HORIZON + 34, { size: 30, bold: true, color: RED, align: 'right', glow: RED });
        }
        // Only once the run is under way: the title screen draws this state
        // too and has its own text there.
        if (s.clock > 0 && s.clock < 2.5) G.text(s.cfg.touch ? 'Follow gates — hold TUCK for speed' : 'Follow the gates — tuck for speed', G.W / 2, 470, { size: s.cfg.label, color: SNOW, align: 'center' });
    }

    function draw(s, ctx) {
        drawSlope(s, ctx);
        drawWorld(s, ctx);
        drawYeti(s, ctx);
        drawAvalanche(s, ctx);
        if (s.cfg.storm) drawFog(ctx);
        drawFlakes(s, ctx);
        drawGateHint(s, ctx);
        drawSky(s, ctx);
        drawChasers(s, ctx);
        drawWind(s, ctx);
        drawMeter(s, ctx);
        drawPops(s, ctx);
        drawAlerts(s);
    }

    function hud(s) {
        var text = 'TIME ' + Math.ceil(s.time) + '  GATES ' + s.passed + '/' + s.gates.length;
        if (s.av && s.av.on) text += '  SLIDE ' + Math.max(0, Math.round((s.sk.y - s.av.y) / 10)) + 'm';
        return text;
    }

    // ------------------------------------------------------------------
    // The ending: the aurora fills the whole sky and snow sparkles fall
    // ------------------------------------------------------------------

    // Three tall curtains, livelier than the sky strip's, and a snowfall that
    // glints in the curtains' colours. Positions come from e.t and the
    // flake's index alone, so the scene keeps no state.
    function drawEndingSky(e, ctx) {
        var t = e.t * 1.6, rise = G.clamp(e.t / 1.5, 0, 1);
        ctx.globalCompositeOperation = 'lighter';
        drawRibbon(ctx, t, 0, GREEN, 260, 5 * rise, 0);
        drawRibbon(ctx, t, 2.1, TEAL, 300, 4 * rise, 0);
        drawRibbon(ctx, t, 4.4, PURPLE, 340, 3.5 * rise, 0);
        ctx.globalCompositeOperation = 'source-over';
        var tints = [SNOW, GREEN, TEAL, PURPLE];
        for (var i = 0; i < 90; i++) {
            var fall = 30 + hash(i + 0.7) * 50, y = (hash(i + 0.2) * G.H + e.t * fall) % G.H;
            var x = hash(i) * G.W + 14 * Math.sin(e.t * 1.3 + i);
            ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(e.t * 3 + i));
            ctx.fillStyle = tints[i % 4];
            ctx.fillRect(x, y, 3, 3);
        }
        ctx.globalAlpha = 1;
    }

    G.register('aurora', {
        title: 'POLAR RUSH',
        blurb: 'Ski the gates down to the finish before the clock runs out.',
        controls: [
            '← → carve — turning slows you',
            '↓ / X / TUCK: faster, wider turns',
            'SPACE / JUMP: hop rocks and crevasses',
            'Miss a gate: lose 3s · TUCK escapes chasers'
        ],
        // Two big carve buttons, with the tuck on B instead of ▼: on the
        // 8-way pad a thumb sliding between ◀ and ▶ would hold ▼ half the
        // time, and an unwanted tuck (faster, worse steering) wrecks a line.
        touch: { a: 'JUMP', b: 'TUCK', hide: ['up', 'down'] },
        ending: {
            title: 'POLAR CHAMPION',
            text: 'Down through the storm, under the northern lights.',
            colors: [SNOW, GREEN, TEAL, PURPLE],
            draw: drawEndingSky
        },
        levelNames: ['Pine Forest', 'Blue Crevasse', 'Polar Storm'],
        colors: { bg: NAVY, fg: SNOW, accent: GREEN, dim: '#7fa8b8' },
        lives: 3,
        music: {
            bpm: 108, root: 50, scale: 'lydian', prog: [0, 1, 0, 1, 5, 1, 4, 0],
            bass: 'x.......o.....5.',
            lead: ['4...6.7.8---....', '9...8.7.6---3...', '4.6.8...a---9.8.', '7---....3.4.6...',
                '8...a.9.8---6...', '7...6.3.4---....', '4.3.4...6---7.8.', '7-------....3...'],
            arp: '0123231.0123321.',
            drums: { k: 'x.........x.....', h: '..x...x...x...x.' },
            leadWave: 'sine', bassWave: 'sine', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
