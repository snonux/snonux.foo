/*
 * kill -9 — the terminal theme's game: an ASCII twin-stick arena shooter.
 *
 * You are the `@`. WASD moves, the arrow keys fire in eight directions (or
 * hold the mouse button to aim at the pointer). On a phone the twin touch pad
 * is the same two key clusters: left pad walks, right pad fires, and a finger
 * held on the screen aims like the mouse. Rogue processes come in waves
 * from the edge of the screen: `Z` zombies shamble, `&` forks split when shot,
 * `d` daemons keep their distance and shoot, `>` pipes dash in straight lines,
 * `#` root shells soak damage, `[fork]` spawners keep making more until they
 * are destroyed, and `init` (pid 1) waits behind a fork bomb on the third
 * and last level. Kill every process.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var GREEN = '#33ff33', DIM = '#1a7a1a', FAINT = '#0f3f0f', WHITE = '#e6ffe6', RED = '#ff5a3c', AMBER = '#ffc93c', BG = '#0a0a0a';
    // The arena: below the HUD, above the one-line shell prompt at the bottom.
    var L = 10, R = G.W - 10, T = G.HUD + 8, B = G.H - 24;
    var P_SPEED = 235, P_R = 7, FIRE_GAP = 0.13, SHOT_SPEED = 640, BOMB_R = 300, MAX_BOMBS = 3;
    var FORK_PERIOD = 8, MAX_ENEMIES = 80, MAX_EBUL = 140;   // FORK_PERIOD: seconds a fork-bomb fork takes to grow or copy
    var DASH = 0.85;                                        // seconds a pipe's full dash lasts

    // mass scales knockback and decides what a bomb kills outright (< 5).
    var TYPES = {
        'Z': { hp: 2, r: 11, speed: 64, mass: 1, score: 10, drop: 0.08, name: 'zombie' },
        '&': { hp: 1, r: 9, speed: 100, mass: 1, score: 15, drop: 0.05, name: 'fork' },
        'd': { hp: 2, r: 10, speed: 92, mass: 1, score: 25, drop: 0.14, name: 'daemon' },
        '>': { hp: 2, r: 10, speed: 540, mass: 1.5, score: 30, drop: 0.14, name: 'pipe' },
        '#': { hp: 12, r: 16, speed: 40, mass: 5, score: 80, drop: 0.4, name: 'rootsh' },
        'S': { hp: 28, r: 26, speed: 0, mass: 1e6, score: 150, drop: 1, name: 'spawner' },
        'I': { hp: 360, r: 38, speed: 40, mass: 40, score: 2000, drop: 0, name: 'init' }
    };
    var DROPS = ['$', '$', '$', '$', '!', '!', '!', '*', '*', '+'];

    function block(x, y, w, h, label) { return { x: x, y: y, w: w, h: h, label: label }; }
    function nest(x, y, kind, every, cap) { return { x: x, y: y, kind: kind, every: every, cap: cap }; }

    // waves: glyph -> count per wave. gen: how often a fork splits. blocks:
    // solid directories. spawners: nests that must be destroyed. forkBomb:
    // forks grow up and replicate by themselves, and the process table holds
    // at most cap of them. supply: seconds between free pickups.
    var LEVELS = [
        // Introduction: zombies, then forks that split, then the first daemons.
        { waves: [{ Z: 5 }, { Z: 6, '&': 2 }, { Z: 6, '&': 4 }, { Z: 6, '&': 3, d: 2 }, { Z: 8, '&': 4, d: 2 }, { Z: 8, '&': 5, d: 3 }] },
        // Development: pipes dash between solid directories, root shells soak
        // shots, and two [fork] nests keep making forks until destroyed.
        {
            waves: [{ Z: 6, '>': 2 }, { '>': 3, d: 2, '&': 3 }, { '#': 1, Z: 6, d: 2 }, { '#': 2, '>': 3, d: 3 }, { '#': 2, Z: 6, '&': 4, '>': 3 }],
            blocks: [block(200, 150, 90, 56, '/tmp'), block(670, 150, 90, 56, '/var'), block(200, 350, 90, 56, '/etc'), block(670, 350, 90, 56, '/usr')],
            spawners: [nest(150, 270, '&', 4.5, 8), nest(810, 270, '&', 4.5, 8)]
        },
        // Finale: a fork bomb has to be contained before init (pid 1) wakes;
        // free bombs and spread shots drop in while the table fills.
        { waves: [{ '&': 8 }, { '&': 8 }, { I: 1 }], gen: 2, forkBomb: true, cap: 30, supply: 9 }
    ];

    // ---------------------------------------------------------------- setup

    function makeEnemy(s, kind, x, y, gen) {
        var t = TYPES[kind];
        s.pid += 1 + Math.floor(s.rnd() * 9);
        var e = {
            kind: kind, x: x, y: y, vx: 0, vy: 0, hp: t.hp, r: t.r, pid: s.pid, born: 0.8, dead: false,
            t: s.rnd() * 6, side: s.rnd() < 0.5 ? -1 : 1, detour: 0, wall: false, flash: 0,
            cool: 1.2 + s.rnd() * 1.6, mode: 'rest', mt: 0.3 + s.rnd(), dx: 1, dy: 0,
            gen: 0, age: s.rnd() * 3, dash: DASH, atk: -1, spiral: 0, spin: 0, gap: 0, nest: null,
            grip: 0, nx: 0, ny: 0, turn: 1                  // wall following, see gripWall
        };
        if (kind === '&') { e.gen = gen; e.r = 7 + gen * 3; }
        if (kind === 'I') { e.pid = 1; e.cool = 2; }
        return e;
    }

    function init(level) {
        var cfg = LEVELS[level - 1];
        // speed: every process is 4% faster per level (8% on the finale); the
        // levels differ mainly in what comes at the player, not in how fast.
        var s = {
            level: level, cfg: cfg, touch: G.isTouch(), rnd: G.rng(level * 7919), time: 0, speed: 1 + (level - 1) * 0.04,
            p: { x: G.W / 2, y: (T + B) / 2, vx: 0, vy: 0, inv: 1.5, cool: 0, spread: 0, bombs: 1, ax: 1, ay: 0 },
            enemies: [], shots: [], ebul: [], picks: [], queue: [], blocks: cfg.blocks || [],
            wave: 0, waveT: 0, pid: 1000 + level * 311, blast: null, banner: 0, bellT: 0,
            supplyT: cfg.supply || 0, msg: './level' + level + ' --waves=' + cfg.waves.length
        };
        (cfg.spawners || []).forEach(function (n) {
            var e = makeEnemy(s, 'S', n.x, n.y, 0);
            e.nest = n; e.born = 0; e.cool = 2.5;
            s.enemies.push(e);
        });
        return s;
    }

    // ---------------------------------------------------------------- sound

    // A terminal bell: a sine with an octave on top. Rate-limited so a bomb
    // that kills forty processes at once does not fire forty oscillators.
    function bell(s, freq) {
        if (s.bellT > 0) return;
        s.bellT = 0.05;
        G.tone(freq, 0.16, { type: 'sine', vol: 0.16 });
        G.tone(freq * 2, 0.09, { type: 'triangle', vol: 0.07 });
    }

    function keyclick() {
        G.noise(0.022, { filter: 'highpass', freq: 3200, vol: 0.11 });
        G.tone(1500, 0.018, { type: 'square', vol: 0.035 });
    }

    // ------------------------------------------------------------- geometry

    // Pushes a body out of a block it has sunk its centre into, through the
    // nearest side.
    function eject(o, b, r) {
        var l = o.x - b.x, rt = b.x + b.w - o.x, u = o.y - b.y, d = b.y + b.h - o.y, m = Math.min(l, rt, u, d);
        if (m === l) o.x = b.x - r; else if (m === rt) o.x = b.x + b.w + r;
        else if (m === u) o.y = b.y - r; else o.y = b.y + b.h + r;
    }

    // Keeps a round body inside the arena and outside the blocks.
    // Returns 0 = free, 1 = touched the arena edge, 2 = touched a block.
    function confine(s, o, r) {
        var x = G.clamp(o.x, L + r, R - r), y = G.clamp(o.y, T + r, B - r);
        var hit = (x !== o.x || y !== o.y) ? 1 : 0;
        o.x = x; o.y = y;
        for (var i = 0; i < s.blocks.length; i++) {
            var b = s.blocks[i], cx = G.clamp(o.x, b.x, b.x + b.w), cy = G.clamp(o.y, b.y, b.y + b.h);
            var dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
            // The small tolerance keeps a body that was just pushed out to
            // exactly r from counting as touching again through rounding.
            if (d >= r - 0.01) continue;
            hit = 2;
            if (d > 0.001) { o.x = cx + dx / d * r; o.y = cy + dy / d * r; } else eject(o, b, r);
        }
        return hit;
    }

    function blocked(s, x, y) {
        if (x < L || x > R || y < T || y > B) return true;
        for (var i = 0; i < s.blocks.length; i++) {
            var b = s.blocks[i];
            if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
        }
        return false;
    }

    function toPlayer(s, e) {
        var dx = s.p.x - e.x, dy = s.p.y - e.y, d = Math.hypot(dx, dy) || 1;
        return { x: dx / d, y: dy / d, d: d };
    }

    function liveCount(s) {
        var n = 0;
        for (var i = 0; i < s.enemies.length; i++) if (!s.enemies[i].dead && s.enemies[i].kind !== 'S') n++;
        return n;
    }

    // No room for one more process: the engine-wide limit, or the level's own
    // process table on the fork bomb level.
    function tableFull(s) {
        return s.enemies.length >= MAX_ENEMIES || (!!s.cfg.cap && liveCount(s) >= s.cfg.cap);
    }

    // --------------------------------------------------------------- waves

    // A seeded point just inside the arena edge, away from the player so
    // nothing ever materialises on top of the `@`.
    function edgePoint(s) {
        var x = 0, y = 0;
        for (var n = 0; n < 8; n++) {
            var side = Math.floor(s.rnd() * 4), u = s.rnd();
            x = side < 2 ? L + 30 + u * (R - L - 60) : (side === 2 ? L + 28 : R - 28);
            y = side < 2 ? (side === 0 ? T + 28 : B - 28) : T + 30 + u * (B - T - 60);
            if (G.dist(x, y, s.p.x, s.p.y) > 230) break;
        }
        return { x: x, y: y };
    }

    // init wakes at the top or the bottom of the arena, whichever is
    // farther from the player: it is too big to appear on top of the `@`.
    function bossPoint(s) {
        var top = { x: G.W / 2, y: T + 70 }, bottom = { x: G.W / 2, y: B - 70 };
        return G.dist(top.x, top.y, s.p.x, s.p.y) > G.dist(bottom.x, bottom.y, s.p.x, s.p.y) ? top : bottom;
    }

    function spawnAtEdge(s, kind) {
        if (s.enemies.length >= MAX_ENEMIES) return;
        var pt = kind === 'I' ? bossPoint(s) : edgePoint(s);
        s.enemies.push(makeEnemy(s, kind, pt.x, pt.y, s.cfg.gen || 1));
    }

    // Queues the next wave; its processes trickle in so a wave is a stream
    // to manage rather than a wall that appears at once.
    function startWave(s) {
        var w = s.cfg.waves[s.wave], kinds = [], k, i;
        for (k in w) for (i = 0; i < w[k]; i++) kinds.push(k);
        for (i = kinds.length - 1; i > 0; i--) {
            var j = Math.floor(s.rnd() * (i + 1)), tmp = kinds[i];
            kinds[i] = kinds[j]; kinds[j] = tmp;
        }
        kinds.forEach(function (kind, n) { s.queue.push({ kind: kind, t: n * 0.5 }); });
        s.wave++; s.waveT = 0; s.banner = 1.8;
        s.msg = 'ps aux | grep rogue   # wave ' + s.wave + '/' + s.cfg.waves.length;
        G.tone(880, 0.09, { type: 'square', vol: 0.1 });
        G.tone(1320, 0.14, { type: 'square', vol: 0.1, delay: 0.1 });
    }

    // The next wave starts once the last is nearly dead, or after a while
    // regardless, so hiding from two stragglers does not stall the level.
    function runWaves(s, dt) {
        s.waveT += dt;
        s.queue = s.queue.filter(function (q) {
            q.t -= dt;
            // A full process table makes an arrival wait rather than vanish.
            if (q.t > 0 || tableFull(s)) return true;
            spawnAtEdge(s, q.kind);
            return false;
        });
        if (s.wave >= s.cfg.waves.length || s.queue.length) return;
        var ready = s.wave === 0 ? s.time > 0.8 : (liveCount(s) <= 2 || s.waveT > 26);
        if (ready) startWave(s);
    }

    // ------------------------------------------------------------- pickups

    function dropPickup(s, x, y, kind) {
        if (s.picks.length < 12) s.picks.push({ x: x, y: y, kind: kind || G.pick(DROPS), t: 11 });
    }

    function collect(s, k) {
        var p = s.p;
        if (k.kind === '$') { G.addScore(50 * s.level); G.popup(k.x, k.y - 12, '+' + 50 * s.level, AMBER); G.sfx('coin'); }
        if (k.kind === '+') { G.addLife(5); G.popup(k.x, k.y - 12, 'nice +1', AMBER); G.sfx('power'); }
        if (k.kind === '!') { p.spread = 12; G.popup(k.x, k.y - 12, 'xargs -P3', AMBER); G.sfx('power'); }
        if (k.kind === '*') { p.bombs = Math.min(MAX_BOMBS, p.bombs + 1); G.popup(k.x, k.y - 12, 'kill -9 -1', AMBER); G.sfx('blip'); }
    }

    // Pickups drift towards a nearby player (a little magnetism makes them
    // collectable in the middle of a fight) and expire after a while.
    function updatePickups(s, dt) {
        var p = s.p;
        s.picks = s.picks.filter(function (k) {
            k.t -= dt;
            var dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
            if (d < 90) {
                k.x += dx / d * 260 * dt * (1 - d / 90); k.y += dy / d * 260 * dt * (1 - d / 90);
                confine(s, k, 10);                          // the pull must not drag it into a block
            }
            if (d < 20) { collect(s, k); return false; }
            return k.t > 0;
        });
        if (!s.cfg.supply) return;
        s.supplyT -= dt;
        if (s.supplyT > 0) return;
        s.supplyT = s.cfg.supply;
        dropPickup(s, L + 80 + s.rnd() * (R - L - 160), T + 60 + s.rnd() * (B - T - 120), s.rnd() < 0.5 ? '*' : '!');
        G.sfx('blip');
    }

    // -------------------------------------------------------------- damage

    // A shot fork becomes two smaller ones, as far as the process table has
    // room (the parent is already marked dead, so it has freed its slot).
    function splitFork(s, e) {
        var a = Math.atan2(e.vy, e.vx) + Math.PI / 2;
        for (var i = -1; i <= 1; i += 2) {
            if (tableFull(s)) break;
            var c = makeEnemy(s, '&', e.x + Math.cos(a) * 10 * i, e.y + Math.sin(a) * 10 * i, e.gen - 1);
            c.vx = Math.cos(a) * 200 * i; c.vy = Math.sin(a) * 200 * i;
            c.born = 0.2; c.side = i;
            s.enemies.push(c);
        }
        G.tone(660, 0.05, { type: 'square', vol: 0.09 });
        G.tone(990, 0.07, { type: 'square', vol: 0.09, delay: 0.05 });
    }

    // pid 1 takes every other process down with it.
    function bossDeath(s, e) {
        s.enemies.forEach(function (o) {
            if (o === e || o.dead) return;
            o.dead = true;
            G.burst(o.x, o.y, { n: 8, color: GREEN, speed: 200 });
        });
        s.ebul = []; s.queue = [];
        G.burst(e.x, e.y, { n: 90, color: WHITE, speed: 420, life: 1.4, size: 4 });
        G.sfx('bigboom'); G.shake(16, 0.9); G.flash(GREEN, 0.4);
        G.tone(110, 1.2, { type: 'sawtooth', vol: 0.25, slide: 30 });
        s.msg = 'kill -9 1   # Kernel panic - not syncing: Attempted to kill init!';
    }

    // bombed = killed by SIGKILL to the whole group: forks get no chance to split.
    function kill(s, e, bombed) {
        var t = TYPES[e.kind];
        e.dead = true;
        G.addScore(t.score * s.level);
        G.burst(e.x, e.y, { n: 6 + e.r, color: GREEN, speed: 190, life: 0.5 });
        s.msg = 'kill -9 ' + e.pid + '   # ' + t.name;
        bell(s, 740 + (e.pid % 5) * 90);
        if (e.kind === '&' && e.gen > 0 && !bombed) { splitFork(s, e); return; }
        if (e.kind === 'I') { bossDeath(s, e); return; }
        if (e.kind === 'S') { G.sfx('boom'); G.shake(8, 0.3); G.popup(e.x, e.y - 30, 'nest killed', WHITE); }
        if (Math.random() < t.drop) dropPickup(s, e.x, e.y);
    }

    function hurt(s, e, n, kx, ky) {
        var m = TYPES[e.kind].mass;
        e.hp -= n; e.flash = 0.09;
        e.vx += kx * 0.25 / m; e.vy += ky * 0.25 / m;
        if (e.hp <= 0) { kill(s, e, false); return; }
        G.tone(420, 0.03, { type: 'square', vol: 0.06 });
    }

    // Costs a life, then gives the player room: nearby processes are thrown
    // back and nearby bullets vanish, so one mistake is not three. The mass
    // is capped for this shove so that even init is moved off a player it
    // has walked into a corner (nests ignore it: they zero their velocity).
    function hitPlayer(s) {
        var p = s.p;
        if (p.inv > 0) return;
        G.burst(p.x, p.y, { n: 24, color: RED, speed: 260, life: 0.6 });
        G.noise(0.3, { filter: 'lowpass', freq: 900, slide: 120, vol: 0.3 });
        if (G.loseLife() <= 0) return;
        p.inv = 2.2; p.spread = 0;
        s.msg = 'Segmentation fault (core dumped)';
        s.ebul = s.ebul.filter(function (b) { return G.dist(b.x, b.y, p.x, p.y) > 150; });
        s.enemies.forEach(function (e) {
            var v = toPlayer(s, e);
            if (v.d > 160) return;
            var m = Math.min(TYPES[e.kind].mass, 1.8);
            e.vx -= v.x * 460 / m; e.vy -= v.y * 460 / m;
        });
    }

    // --------------------------------------------------------------- player

    // Only W A S D walk, read as raw codes: the arrow keys are the other
    // stick (G.key.left and friends are true for both, so they cannot be
    // used here). The twin touch pad sends the same codes from its left pad.
    function movePlayer(s, dt) {
        var p = s.p;
        var ix = (G.down('KeyD') ? 1 : 0) - (G.down('KeyA') ? 1 : 0);
        var iy = (G.down('KeyS') ? 1 : 0) - (G.down('KeyW') ? 1 : 0);
        var n = Math.hypot(ix, iy) || 1, k = Math.min(1, 11 * dt);
        // Velocity eases towards the stick: a little inertia, no ice.
        p.vx += (ix / n * P_SPEED - p.vx) * k;
        p.vy += (iy / n * P_SPEED - p.vy) * k;
        p.x += p.vx * dt; p.y += p.vy * dt;
        confine(s, p, P_R + 2);
        if (p.inv > 0) p.inv -= dt;
        if (p.spread > 0) p.spread -= dt;
    }

    // The mouse (or a finger resting on the canvas) wins while it is held;
    // otherwise the arrow keys, which are also the right touch pad, give one
    // of eight directions. Returns null when not firing.
    function aimDir(s) {
        var p = s.p, dx, dy, d;
        if (G.mouse.down) {
            dx = G.mouse.x - p.x; dy = G.mouse.y - p.y; d = Math.hypot(dx, dy);
            if (d > 4) return { x: dx / d, y: dy / d };
        }
        dx = (G.down('ArrowRight') ? 1 : 0) - (G.down('ArrowLeft') ? 1 : 0);
        dy = (G.down('ArrowDown') ? 1 : 0) - (G.down('ArrowUp') ? 1 : 0);
        d = Math.hypot(dx, dy);
        return d ? { x: dx / d, y: dy / d } : null;
    }

    function fire(s, dt) {
        var p = s.p, a = aimDir(s);
        p.cool = Math.max(0, p.cool - dt);
        if (!a) return;
        p.ax = a.x; p.ay = a.y;
        if (p.cool > 0) return;
        p.cool = FIRE_GAP;
        var base = Math.atan2(a.y, a.x), n = p.spread > 0 ? 1 : 0;
        for (var i = -n; i <= n; i++) {
            var ang = base + i * 0.2;
            s.shots.push({ x: p.x + Math.cos(ang) * 10, y: p.y + Math.sin(ang) * 10, vx: Math.cos(ang) * SHOT_SPEED, vy: Math.sin(ang) * SHOT_SPEED, life: 0.95 });
        }
        keyclick();
    }

    // kill -9 -1: everything ordinary in range dies on the spot, heavy
    // processes take a big hit, and every bullet on screen is wiped. Button A
    // (Space, or BOMB on the touch pad) or the right mouse button.
    function useBomb(s) {
        var p = s.p;
        if (!(G.hit.a || G.mouse.rhit) || p.bombs <= 0) return;
        p.bombs--;
        s.blast = { x: p.x, y: p.y, t: 0 };
        s.ebul = [];
        s.enemies.slice().forEach(function (e) {
            if (e.dead || G.dist(e.x, e.y, p.x, p.y) > BOMB_R) return;
            if (TYPES[e.kind].mass < 5) kill(s, e, true); else hurt(s, e, 10, 0, 0);
        });
        s.msg = 'kill -9 -1';
        G.sfx('bigboom'); G.shake(12, 0.4); G.flash(GREEN, 0.18);
        G.noise(0.5, { filter: 'bandpass', freq: 2400, slide: 200, vol: 0.25 });
    }

    function enemyAt(s, x, y, pad) {
        for (var i = 0; i < s.enemies.length; i++) {
            var e = s.enemies[i];
            if (!e.dead && e.born <= 0 && G.dist(x, y, e.x, e.y) < e.r + pad) return e;
        }
        return null;
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (b) {
            b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
            if (b.life <= 0) return false;
            if (blocked(s, b.x, b.y)) { G.burst(b.x, b.y, { n: 2, color: DIM, speed: 80, life: 0.25, size: 2 }); return false; }
            var e = enemyAt(s, b.x, b.y, 5);
            if (!e) return true;
            hurt(s, e, 1, b.vx, b.vy);
            return false;
        });
    }

    // -------------------------------------------------------------- enemies

    function enemyShot(s, x, y, ang, speed) {
        if (s.ebul.length >= MAX_EBUL) return;
        s.ebul.push({ x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed });
    }

    // Remembers the face of the block a process has run into: (nx, ny) is the
    // push confine() gave it, the face's outward normal. Which way round to
    // go is decided on first contact only (the way it was drifting anyway)
    // and then kept, or it would turn back half way along a long wall.
    function gripWall(e, nx, ny) {
        var n = Math.hypot(nx, ny);
        if (n < 0.0001) return;
        nx /= n; ny /= n;
        if (e.grip <= 0) {
            var along = e.vy * nx - e.vx * ny;
            e.turn = Math.abs(along) > 8 ? (along > 0 ? 1 : -1) : e.side;
        }
        e.nx = nx; e.ny = ny; e.grip = 0.4;
    }

    // Eases the velocity towards a heading. A process that grips a block
    // slides along its face (leaning in a little, to keep the grip round the
    // corners) until its heading points away from the block: that walks it
    // round the obstacle wherever the player stands, where a fixed sidestep
    // left it pressed against a long wall for ever.
    function steer(e, dx, dy, speed, dt) {
        if (e.grip > 0 && speed > 0) {
            if (dx * e.nx + dy * e.ny > 0.05) e.grip = 0;
            else { dx = -e.ny * e.turn - e.nx * 0.25; dy = e.nx * e.turn - e.ny * 0.25; }
        }
        var k = Math.min(1, 4 * dt);
        e.vx += (dx * speed - e.vx) * k;
        e.vy += (dy * speed - e.vy) * k;
    }

    // Zombies weave and lurch: the heading sways and the pace pulses.
    function zombieAI(s, e, dt) {
        var v = toPlayer(s, e), a = Math.atan2(v.y, v.x) + Math.sin(e.t * 2.3) * 0.55;
        var lurch = 0.55 + 0.45 * Math.abs(Math.sin(e.t * 4));
        steer(e, Math.cos(a), Math.sin(a), TYPES.Z.speed * s.speed * lurch, dt);
    }

    // On the fork bomb level a fork grows up a generation every period and a
    // full-grown one forks a copy, up to the size of the process table.
    function forkLife(s, e, dt) {
        e.age += dt;
        if (e.age < FORK_PERIOD) return;
        e.age = 0;
        if (e.gen < 2) { e.gen++; e.r = 7 + e.gen * 3; return; }
        if (tableFull(s)) return;
        var c = makeEnemy(s, '&', e.x + e.side * 14, e.y, 2);
        c.born = 0.3; c.age = 0;
        s.enemies.push(c);
        G.tone(300, 0.08, { type: 'square', vol: 0.07, slide: 600 });
    }

    // Forks flank: they come in on a curve, small ones faster.
    function forkAI(s, e, dt) {
        var v = toPlayer(s, e), a = Math.atan2(v.y, v.x) + (v.d > 90 ? e.side * 0.4 : 0);
        steer(e, Math.cos(a), Math.sin(a), (TYPES['&'].speed + (2 - e.gen) * 14) * s.speed, dt);
        if (s.cfg.forkBomb) forkLife(s, e, dt);
    }

    // Daemons hold a ring around the player, strafe along it and shoot. At a
    // wall they turn about; detour is the pause before the next about-turn.
    function daemonAI(s, e, dt) {
        var v = toPlayer(s, e), want = v.d > 300 ? 1 : (v.d < 190 ? -1 : 0), strafe = want ? 0.35 : 1;
        var dx = v.x * want - v.y * e.side * strafe, dy = v.y * want + v.x * e.side * strafe, n = Math.hypot(dx, dy) || 1;
        if (e.wall && e.detour <= 0) { e.side = -e.side; e.detour = 0.5; }
        steer(e, dx / n, dy / n, TYPES.d.speed * s.speed, dt);
        e.cool -= dt;
        if (e.cool > 0 || v.d > 480) return;
        e.cool = 2.3 + G.rnd(0, 0.9);
        enemyShot(s, e.x, e.y, Math.atan2(v.y, v.x), 185 * s.speed);
        G.tone(330, 0.1, { type: 'sawtooth', vol: 0.08, slide: 160 });
    }

    // The first block that a pipe-wide path from a to b would run into.
    function sightBlock(s, ax, ay, bx, by) {
        var n = Math.ceil(G.dist(ax, ay, bx, by) / 10), pad = 9;
        for (var i = 1; i < n; i++) {
            var x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
            for (var j = 0; j < s.blocks.length; j++) {
                var b = s.blocks[j];
                if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
            }
        }
        return null;
    }

    // Where a pipe should dash: at the player, or, when a block is in the
    // way, at the corner of that block which gives the shortest way round.
    // Without this a pipe rams the same wall for ever.
    function pipeTarget(s, e) {
        var p = s.p, b = sightBlock(s, e.x, e.y, p.x, p.y);
        if (!b) return p;
        var m = e.r + 14, best = p, bd = Infinity;
        for (var i = 0; i < 4; i++) {
            var cx = i % 2 ? b.x + b.w + m : b.x - m, cy = i < 2 ? b.y - m : b.y + b.h + m;
            var near = G.dist(e.x, e.y, cx, cy);
            // A corner it already stands on leads nowhere; one it cannot see is no shortcut.
            if (near < 30 || sightBlock(s, e.x, e.y, cx, cy)) continue;
            var d = near + G.dist(cx, cy, p.x, p.y);
            if (d < bd) { bd = d; best = { x: cx, y: cy }; }
        }
        return best;
    }

    // A dash at the player runs its full length; a hop to a corner stops there.
    function aimPipe(s, e) {
        var t = pipeTarget(s, e), dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
        e.dx = dx / d; e.dy = dy / d;
        e.dash = t === s.p ? DASH : G.clamp(d / TYPES['>'].speed, 0.1, DASH);
    }

    // Pipes take aim (the line is drawn as a warning and locks shortly
    // before the dash), dash straight until something stops them, then rest.
    function pipeAI(s, e, dt) {
        e.mt -= dt;
        if (e.mode === 'dash') {
            e.vx = e.dx * TYPES['>'].speed; e.vy = e.dy * TYPES['>'].speed;
            // Wall contact is ignored for the first moments, so a pipe that
            // starts its dash leaning on a wall still gets away from it.
            var bumped = e.wall && e.mt < e.dash - 0.1;
            if (e.mt > 0 && !bumped) return;
            if (bumped) { G.noise(0.06, { filter: 'lowpass', freq: 500, vol: 0.14 }); G.burst(e.x, e.y, { n: 5, color: DIM, speed: 120 }); }
            // After a corner hop the next aim follows quickly, and the pipe
            // stops dead: coasting on would carry it past the corner and back
            // behind the block, to hop to and fro there for ever.
            var hop = e.dash < DASH;
            if (hop) { e.vx = 0; e.vy = 0; }
            e.mode = 'rest'; e.mt = hop ? 0.25 : 0.75;
            return;
        }
        steer(e, 0, 0, 0, dt);
        if (e.mode === 'aim' && e.mt > 0.3) aimPipe(s, e);
        if (e.mt > 0) return;
        if (e.mode === 'rest') { e.mode = 'aim'; e.mt = 1.0; G.tone(1100, 0.04, { type: 'square', vol: 0.05 }); return; }
        e.mode = 'dash'; e.mt = e.dash;
        G.noise(0.22, { filter: 'bandpass', freq: 700, slide: 2600, vol: 0.13 });
    }

    function rootAI(s, e, dt) {
        var v = toPlayer(s, e);
        steer(e, v.x, v.y, TYPES['#'].speed * s.speed, dt);
    }

    // A nest never moves; it emits a child towards the player while the
    // process table has room.
    function spawnerAI(s, e, dt) {
        e.vx = 0; e.vy = 0;
        e.cool -= dt;
        if (e.cool > 0) return;
        e.cool = e.nest.every;
        if (liveCount(s) >= e.nest.cap || s.enemies.length >= MAX_ENEMIES) return;
        var v = toPlayer(s, e), c = makeEnemy(s, e.nest.kind, e.x + v.x * 40, e.y + v.y * 40, 1);
        c.born = 0.5;
        s.enemies.push(c);
        G.tone(220, 0.12, { type: 'square', vol: 0.08, slide: 440 });
    }

    // ----------------------------------------------------------------- boss

    function bossRing(s, e, v, rage) {
        var n = rage ? 18 : 14;
        for (var i = 0; i < n; i++) enemyShot(s, e.x, e.y, e.t + i * Math.PI * 2 / n, 150);
        G.tone(140, 0.25, { type: 'square', vol: 0.16, slide: 70 });
    }

    // init adopts orphans: fresh processes arrive from the edges.
    function bossAdopt(s, e, v, rage) {
        if (liveCount(s) > 10) return;
        spawnAtEdge(s, 'Z'); spawnAtEdge(s, rage ? 'd' : 'Z'); spawnAtEdge(s, 'd');
        G.tone(520, 0.1, { type: 'square', vol: 0.1 });
        G.tone(390, 0.14, { type: 'square', vol: 0.1, delay: 0.1 });
    }

    function bossFan(s, e, v, rage) {
        var n = rage ? 3 : 2, base = Math.atan2(v.y, v.x);
        for (var i = -n; i <= n; i++) enemyShot(s, e.x, e.y, base + i * 0.2, 180);
        G.tone(260, 0.18, { type: 'sawtooth', vol: 0.14, slide: 130 });
    }

    // Two opposite streams that sweep round for a couple of seconds.
    function bossSpiral(s, e) { e.spiral = 2.2; e.spin = e.t; G.sfx('alarm'); }

    function bossPipes(s, e) {
        if (liveCount(s) > 10) return;
        spawnAtEdge(s, '>'); spawnAtEdge(s, '>');
        G.tone(700, 0.12, { type: 'square', vol: 0.1, slide: 1400 });
    }

    // The enraged half of the fight adds the last two attacks to the cycle.
    // Its bullets are slow enough (150-180 px/s against the player's 235)
    // to be walked out of by someone who notices them a third of a second
    // late; the danger is in their number, not their speed.
    var BOSS_ATTACKS = [bossRing, bossAdopt, bossFan, bossSpiral, bossPipes];

    // init lumbers after the player and cycles through its attacks; below
    // half health it speeds up and unlocks the spiral and the pipes.
    function initAI(s, e, dt) {
        var v = toPlayer(s, e), rage = e.hp < TYPES.I.hp / 2;
        steer(e, v.x, v.y, rage ? 62 : 40, dt);
        if (e.spiral > 0) {
            e.spiral -= dt; e.spin += dt * 2.6; e.gap -= dt;
            if (e.gap <= 0) { e.gap = 0.1; enemyShot(s, e.x, e.y, e.spin, 160); enemyShot(s, e.x, e.y, e.spin + Math.PI, 160); }
        }
        e.cool -= dt;
        if (e.cool > 0) return;
        e.cool = rage ? 2.1 : 2.8;
        e.atk = (e.atk + 1) % (rage ? 5 : 3);
        BOSS_ATTACKS[e.atk](s, e, v, rage);
    }

    var BRAIN = { 'Z': zombieAI, '&': forkAI, 'd': daemonAI, '>': pipeAI, '#': rootAI, 'S': spawnerAI, 'I': initAI };

    function updateEnemy(s, e, dt) {
        e.t += dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.detour > 0) e.detour -= dt;
        if (e.grip > 0) e.grip -= dt;
        // A process that is still being spawned only blinks: it cannot hurt
        // and cannot be hurt, which is the player's warning.
        if (e.born > 0) { e.born -= dt; return; }
        BRAIN[e.kind](s, e, dt);
        e.x += e.vx * dt; e.y += e.vy * dt;
        var x0 = e.x, y0 = e.y, hit = confine(s, e, e.r);
        e.wall = hit > 0;
        if (hit === 2) gripWall(e, e.x - x0, e.y - y0);
        if (G.circ(s.p.x, s.p.y, P_R, e.x, e.y, e.r - 2)) hitPlayer(s);
    }

    // Soft separation so a swarm stays a swarm instead of one stacked glyph.
    // Nests and init do not budge; the other one takes the whole push.
    function separate(s) {
        var es = s.enemies;
        for (var i = 0; i < es.length; i++) {
            for (var j = i + 1; j < es.length; j++) {
                var a = es[i], b = es[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
                if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
                var d = Math.hypot(dx, dy);
                if (d >= min || d < 0.01) continue;
                // Two wall followers that meet head-on would hold each other
                // there for ever: the second falls in behind the first.
                if (a.grip > 0 && b.grip > 0) b.turn = a.turn;
                var wa = TYPES[a.kind].mass > 30 ? 0 : 1, wb = TYPES[b.kind].mass > 30 ? 0 : 1;
                if (!wa && !wb) continue;
                var push = (min - d) * 0.5 / (wa + wb);
                a.x -= dx / d * push * wa; a.y -= dy / d * push * wa;
                b.x += dx / d * push * wb; b.y += dy / d * push * wb;
            }
        }
    }

    function updateEnemyShots(s, dt) {
        var p = s.p;
        s.ebul = s.ebul.filter(function (b) {
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (blocked(s, b.x, b.y)) return false;
            if (G.dist(b.x, b.y, p.x, p.y) > P_R + 3) return true;
            hitPlayer(s);
            return false;
        });
    }

    function update(s, dt) {
        s.time += dt;
        if (s.bellT > 0) s.bellT -= dt;
        if (s.banner > 0) s.banner -= dt;
        if (s.blast) { s.blast.t += dt; if (s.blast.t > 0.5) s.blast = null; }
        runWaves(s, dt);
        movePlayer(s, dt);
        fire(s, dt);
        useBomb(s);
        updateShots(s, dt);
        // Nests, replicating forks and init add processes while this loop
        // runs; the cached length makes the newcomers wait for the next tick.
        for (var i = 0, n = s.enemies.length; i < n; i++) if (!s.enemies[i].dead) updateEnemy(s, s.enemies[i], dt);
        s.enemies = s.enemies.filter(function (e) { return !e.dead; });
        separate(s);
        // Separation may have shoved someone through the edge or into a block.
        s.enemies.forEach(function (e) { confine(s, e, e.r); });
        updateEnemyShots(s, dt);
        updatePickups(s, dt);
        if (s.wave >= s.cfg.waves.length && !s.queue.length && !s.enemies.length) G.win(400 + s.level * 100 + G.lives * 200);
    }

    // ----------------------------------------------------------------- draw

    function glyph(ch, x, y, size, color, glow) {
        G.text(ch, x, y, { size: size, color: color, align: 'center', baseline: 'middle', bold: true, glow: glow });
    }

    // The backdrop is a live `ps` listing of the rogue processes, so the
    // screen itself tells you what is still running.
    function drawBackdrop(s, ctx) {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, G.W, G.H);
        // Tiny process-list decoration competes with the live glyphs on a phone.
        if (!s.touch) G.text('  PID S COMMAND', L + 12, T + 22, { size: 12, color: FAINT });
        for (var i = 0; i < s.enemies.length && i < (s.touch ? 0 : 26); i++) {
            var e = s.enemies[i];
            G.text(('     ' + e.pid).slice(-5) + ' ' + (e.kind === 'Z' ? 'Z' : 'R') + ' ' + TYPES[e.kind].name, L + 12, T + 38 + i * 16, { size: 12, color: FAINT });
        }
        ctx.strokeStyle = DIM; ctx.lineWidth = 1;
        ctx.strokeRect(L + 0.5, T + 0.5, R - L - 1, B - T - 1);
        var cursor = Math.floor(G.t * 2.5) % 2 ? '_' : ' ';
        G.text((s.touch ? '# ' : 'root@snonux:~# ') + s.msg + cursor, L + 2, G.H - 7, { size: s.touch ? 20 : 13, color: DIM, max: R - L - 4 });
    }

    function drawBlocks(s, ctx) {
        s.blocks.forEach(function (b) {
            ctx.fillStyle = '#0c200c';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeStyle = GREEN; ctx.lineWidth = 1;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
            ctx.setLineDash([]);
            G.text(b.label, b.x + b.w / 2, b.y + b.h / 2, { size: 13, color: DIM, align: 'center', baseline: 'middle', max: b.w - 6 });
        });
    }

    function drawPickups(s) {
        s.picks.forEach(function (k) {
            // The last three seconds blink as a "hurry up".
            if (k.t < 3 && Math.floor(k.t * 8) % 2) return;
            var bob = Math.sin(s.time * 5 + k.x) * 3;
            glyph('[' + k.kind + ']', k.x, k.y + bob, 20, AMBER);
        });
    }

    function drawPipe(s, ctx, e, color) {
        var a = Math.atan2(e.dy, e.dx);
        if (e.mode === 'aim') {
            ctx.strokeStyle = RED; ctx.lineWidth = s.touch ? 3 : 1;
            ctx.globalAlpha = 0.35 + 0.4 * (1 - e.mt);
            ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dx * e.dash * TYPES['>'].speed, e.y + e.dy * e.dash * TYPES['>'].speed); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        ctx.save();
        ctx.translate(e.x, e.y); ctx.rotate(a);
        glyph(e.mode === 'dash' ? '=>' : '>', 0, 0, 24, e.mode === 'aim' ? RED : color);
        ctx.restore();
    }

    function drawSpawner(s, ctx, e, color) {
        var pulse = 1 - G.clamp(e.cool / e.nest.every, 0, 1), label = e.nest.kind === '>' ? '[pipe]' : (e.nest.kind === 'Z' ? '[cron]' : '[fork]');
        ctx.strokeStyle = DIM; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + pulse * 6, 0, Math.PI * 2); ctx.stroke();
        glyph(label, e.x, e.y - 3, s.touch ? 20 : 17, color);
        var left = Math.ceil(e.hp / TYPES.S.hp * 6);
        if (s.touch) {
            ctx.fillStyle = DIM; ctx.fillRect(e.x - 24, e.y + 12, 48, 5);
            ctx.fillStyle = GREEN; ctx.fillRect(e.x - 24, e.y + 12, left * 8, 5);
        } else glyph('######'.slice(0, left) + '......'.slice(left), e.x, e.y + 13, 10, DIM);
    }

    function drawBoss(ctx, e) {
        var rage = e.hp < TYPES.I.hp / 2, c = e.flash > 0 ? WHITE : (rage ? RED : GREEN), wob = Math.sin(e.t * 3) * 2;
        ctx.strokeStyle = c; ctx.lineWidth = 2;
        // A 72px square, so what is drawn is what the r=38 collision circle hits.
        ctx.strokeRect(e.x - 36, e.y - 36 + wob, 72, 72);
        glyph('init', e.x, e.y - 9 + wob, 25, c, c);
        glyph('pid 1', e.x, e.y + 15 + wob, 13, c);
        var w = 300, frac = G.clamp(e.hp / TYPES.I.hp, 0, 1);
        ctx.strokeStyle = DIM; ctx.lineWidth = 1;
        ctx.strokeRect(G.W / 2 - w / 2 + 0.5, T + 8.5, w, 9);
        ctx.fillStyle = c;
        ctx.fillRect(G.W / 2 - w / 2 + 2, T + 10, (w - 3) * frac, 6);
    }

    function drawEnemy(s, ctx, e) {
        if (e.born > 0) {
            if (Math.floor(e.born * 12) % 2) glyph('_', e.x, e.y, 22, DIM);
            return;
        }
        var color = e.flash > 0 ? WHITE : GREEN;
        if (e.kind === '>') { drawPipe(s, ctx, e, color); return; }
        if (e.kind === 'S') { drawSpawner(s, ctx, e, color); return; }
        if (e.kind === 'I') { drawBoss(ctx, e); return; }
        if (e.kind === 'Z') { glyph('Z', e.x + Math.sin(e.t * 4) * 2, e.y, 24, color); return; }
        if (e.kind === '&') { glyph('&', e.x, e.y, Math.max(s.touch ? 24 : 18, 18 + e.gen * 6), color); return; }
        // A daemon turns red just before it fires.
        if (e.kind === 'd') { glyph('d', e.x, e.y, 23, e.cool < 0.4 ? RED : color); return; }
        glyph('#', e.x, e.y, 36, color);
        var healthY = s.touch ? (e.y - 30 < G.HUD + 10 ? e.y + 30 : e.y - 30) : e.y - 24;
        glyph(String(Math.ceil(e.hp)), e.x, healthY, s.touch ? 20 : 11, s.touch ? GREEN : DIM);
    }

    // Player shots are one of - \ | / depending on their heading.
    function drawBullets(s) {
        s.shots.forEach(function (b) {
            var oct = Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 4));
            glyph('-\\|/'.charAt(((oct % 4) + 4) % 4), b.x, b.y, s.touch ? 20 : 16, WHITE);
        });
        s.ebul.forEach(function (b) { glyph('o', b.x, b.y, s.touch ? 24 : 18, RED); });
    }

    function drawPlayer(s) {
        var p = s.p;
        // Blinks while invulnerable after a hit or a (re)start.
        if (p.inv > 0 && Math.floor(p.inv * 12) % 2) return;
        glyph('@', p.x, p.y, 24, p.spread > 0 ? AMBER : WHITE, GREEN);
        var aimX = p.x + p.ax * 20, aimY = p.y + p.ay * 20 - 5;
        if (s.touch) {
            aimX = G.clamp(aimX, 12, G.W - 12);
            aimY = G.clamp(aimY, G.HUD + 12, G.H - 12);
        }
        glyph('.', aimX, aimY, s.touch ? 24 : 18, s.touch ? GREEN : DIM);
    }

    function drawBlast(s, ctx) {
        if (!s.blast) return;
        var k = s.blast.t / 0.5, r = BOMB_R * k;
        ctx.globalAlpha = 1 - k;
        for (var i = 0; i < 28; i++) {
            var a = i * Math.PI * 2 / 28 + k;
            glyph('*', s.blast.x + Math.cos(a) * r, s.blast.y + Math.sin(a) * r, 22, WHITE);
        }
        ctx.globalAlpha = 1;
    }

    // The finale's last wave is init alone.
    function bossAwake(s) { return s.wave > 0 && !!s.cfg.waves[s.wave - 1].I; }

    function drawBanner(s, ctx) {
        if (s.banner <= 0) return;
        var text = bossAwake(s) ? 'pid 1 is awake' : (s.cfg.forkBomb ? ':(){ :|:& };:' : 'wave ' + s.wave + '/' + s.cfg.waves.length);
        ctx.globalAlpha = Math.min(1, s.banner);
        G.text('>> ' + text + ' <<', G.W / 2, T + 46, { size: 20, color: GREEN, align: 'center', bold: true });
        ctx.globalAlpha = 1;
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        drawBlocks(s, ctx);
        drawPickups(s);
        s.enemies.forEach(function (e) { drawEnemy(s, ctx, e); });
        drawBullets(s);
        drawPlayer(s);
        drawBlast(s, ctx);
        drawBanner(s, ctx);
    }

    // ---------------------------------------------------------------- ending

    // After init falls the box is clean: a shell types out an empty process
    // table on both sides of the score, and ASCII fireworks (the engine's
    // own are switched off) burst above it. Everything is a pure function of
    // the scene's clock, so the scene keeps no state of its own.
    var END_LEFT = ['$ ps aux | grep rogue', '  PID S COMMAND', '  (none)'];
    var END_RIGHT = ['$ uptime', ' load average: 0.00', '$ exit 0'];
    var SPARK_GLYPHS = '*+o.';

    function drawEndingShell(e) {
        var shown = Math.floor(e.t * 22), used = 0, side, lines, i, line, n;
        for (side = 0; side < 2; side++) {
            lines = side ? END_RIGHT : END_LEFT;
            for (i = 0; i < lines.length; i++) {
                line = lines[i]; n = G.clamp(shown - used, 0, line.length); used += line.length;
                if (n > 0) G.text(line.slice(0, n), side ? 740 : 30, 330 + i * 22, { size: 16, color: i === 2 && !side ? WHITE : GREEN });
            }
        }
        if (Math.floor(e.t * 2) % 2) G.text('_', 740 + 8 * 10, 374, { size: 16, color: GREEN });
    }

    // Burst k goes off at k * 0.55 s at a seeded spot and lives 1.6 s: a ring
    // of glyphs that grows, falls a little and fades from * to . as it dies.
    function drawAsciiBurst(e, ctx, k) {
        var age = e.t - k * 0.55, h = Math.sin(k * 91.7) * 43758.5453, rx = h - Math.floor(h);
        if (age < 0 || age > 1.6) return;
        var x = 120 + rx * 720, y = 70 + ((k * 37) % 5) * 26, r = 30 + age * 90, n = 12, i, a;
        var ch = SPARK_GLYPHS.charAt(Math.min(3, Math.floor(age / 0.4)));
        ctx.globalAlpha = 1 - age / 1.6;
        for (i = 0; i < n; i++) {
            a = i * Math.PI * 2 / n + k;
            glyph(ch, x + Math.cos(a) * r, y + Math.sin(a) * r + age * age * 30, 20, i % 3 ? GREEN : (k % 2 ? AMBER : WHITE));
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        var k, last = Math.floor(e.t / 0.55);
        for (k = Math.max(0, last - 3); k <= last; k++) drawAsciiBurst(e, ctx, k);
        drawEndingShell(e);
    }

    function hud(s) {
        var p = s.p, left = s.cfg.forkBomb ? 'PROCS ' + liveCount(s) + '/' + s.cfg.cap : 'WAVE ' + s.wave + '/' + s.cfg.waves.length + ' PROCS ' + s.enemies.length;
        if (s.touch) left = (s.cfg.forkBomb ? '' : 'W' + s.wave + '/' + s.cfg.waves.length + ' ') + 'P' + (s.cfg.forkBomb ? liveCount(s) : s.enemies.length) + (s.cfg.cap ? '/' + s.cfg.cap : '');
        return left + ' BOMB ' + p.bombs + (p.spread > 0 ? (s.touch ? ' !' : ' SPREAD ') + Math.ceil(p.spread) : '');
    }

    G.register('terminal', {
        title: 'kill -9',
        blurb: 'Rogue processes are eating the box. Kill every one of them.',
        controls: [
            'W A S D / left pad: move the @ · arrow keys / right pad: fire',
            'Mouse or a finger on the screen: hold to aim and fire',
            'SPACE / BOMB button / right click: bomb (kill -9 -1)',
            'Pickups: [$] score · [+] life · [!] spread shot · [*] bomb'
        ],
        levelNames: ['/bin/sh', '| pipeline', 'init (pid 1)'],
        colors: { bg: BG, fg: GREEN, accent: WHITE, dim: DIM },
        lives: 4,
        music: {
            bpm: 158, root: 45, scale: 'minor', prog: [0, 0, 3, 4, 0, 0, 5, 4],
            bass: 'x.x.o.x.x.x.o.5.',
            lead: [
                '7.7.4.7.9.7.4.2.', '4.2.0.2.4---7---', 'a.a.7.a.c.a.7.5.', '8.6.4.6.8---b---',
                '7.9.b.9.7.4.7.9.', 'b.9.7.9.b---e---', 'c.9.7.9.c.9.7.5.', '8.b.8.6.4---....'
            ],
            arp: '0123', drums: { k: 'x...x...x...x.x.', s: '....x.......x...', h: 'xxx.xxx.xxx.xxx.' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'square', leadOct: 1
        },
        init: init, update: update, draw: draw, hud: hud, cursor: 'crosshair',
        // Twin-stick: W A S D on the left pad, the arrows on the right one,
        // and the bomb on A just above the firing thumb. B does nothing here.
        touch: { twin: true, a: 'BOMB', hide: ['b'] },
        ending: {
            title: 'kill -9 1',
            text: 'Every rogue process is gone. The box is yours.',
            fireworks: false,
            draw: drawEnding
        }
    });
})();
