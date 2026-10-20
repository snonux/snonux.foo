/*
 * Light Cycles — the neon theme's game.
 *
 * A grid arena in which every cycle drags a solid wall of light behind it.
 * Touching any wall, block or the arena edge derezzes the rider (and takes its
 * wall with it). The player outlasts every AI rider to win a round and needs a
 * number of round wins to clear the level; a lost round costs a life. Three
 * levels: a first ride against two easy riders, a crowded arena with hunters,
 * blocks and fading trails, and a duel series with an expert in a collapsing
 * arena.
 *
 * SPACE boosts on a limited charge. The charge comes back slowly, faster from
 * energy pods, and fastest by "grinding": riding right alongside another
 * rider's wall — the risky way to stay quick.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var CELL = 12, COLS = 80, ROWS = 42, OY = 33, N = COLS * ROWS;
    var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];             // right, down, left, up
    var KEYS = ['right', 'down', 'left', 'up'];             // logical button per direction
    var WALL = 7;                                           // grid value of blocks; 1..6 are cycle ids
    var MAX_RING = 15;                                      // the collapse stops here, leaving a 50x12 core
    var BOOST = 1.75, COUNT_STEP = 0.6;
    var LOCK_AT = 12;                                       // seconds of a round after which fading trails stop fading
    var GRACE = 3;                                          // seconds of a round before riders hunt or boost
    var REACT = 0.4;                                        // seconds of the player's path ahead that riders keep out of
    var C = { bg: '#0b001a', cyan: '#00f5ff', magenta: '#ff00cc', yellow: '#ffe700', fg: '#e0f8ff', dim: '#7d6aa8', block: '#8a4dff' };
    var RIDER_COLORS = ['#ff00cc', '#ffe700', '#ff7a1a', '#5dff6e', '#b78cff'];
    // Start cell and heading: the player first, then up to five riders. No two
    // lanes face each other, so nobody is forced into a head-on at the start.
    var SPAWNS = [[10, 21, 0], [69, 20, 2], [36, 5, 1], [43, 36, 3], [69, 7, 2], [69, 34, 2]];

    // How a rider thinks. look: how far ahead it sees a wall; flood: how many
    // cells of free room it counts before committing to a turn (0 = it never
    // checks and so rides into dead ends); aggr: how hard it steers to cut off
    // the nearest other cycle; wobble: chance per cell of a needless turn; miss: chance per
    // cell of reacting late; boost: whether it uses its charge.
    // Tuned so that every rider blunders now and then: even the expert misses
    // a turn about once in forty cells and checks only a few hundred cells of
    // room, so a casual player can outlast it in most rounds.
    var SKILL = {
        rookie: { look: 4, flood: 0, aggr: 0, wobble: 0.03, miss: 0.06, jitter: 6, boost: false },
        scout: { look: 8, flood: 20, aggr: 0, wobble: 0.015, miss: 0.06, jitter: 5, boost: false },
        hunter: { look: 10, flood: 60, aggr: 0.3, wobble: 0.005, miss: 0.045, jitter: 3, boost: true },
        expert: { look: 14, flood: 300, aggr: 0.35, wobble: 0, miss: 0.025, jitter: 2, boost: true }
    };

    // need: round wins to clear; speed: cells per second; decay: trail length
    // in cells before the wall fades; shrink: seconds until the first ring
    // collapses and between rings. The slope is gentle on purpose: a casual
    // player who sees the arena a quarter second late should still win the
    // expert duel in most tries with the four lives.
    var LEVELS = [
        // Grid Zero: two easy riders and the first energy pods.
        { need: 2, speed: 12, riders: ['rookie', 'scout'], pods: true },
        // Fading Light: a hunter that boosts and cuts off, bars to ride
        // around, and trails that fade until they lock.
        { need: 2, speed: 15, riders: ['hunter', 'scout', 'rookie'], pods: true, decay: 80, layout: 'bars', blocks: 5 },
        // The Expert: a duel series in an arena that collapses ring by ring.
        { need: 3, speed: 17, riders: ['expert'], pods: true, layout: 'pillars', blocks: 2, shrink: { start: 12, every: 6 } }
    ];

    // ------------------------------------------------------------------
    // Arena layout
    // ------------------------------------------------------------------

    // Blocks are mirrored into all four quadrants so no start lane is favoured.
    function mirrorRect(base, x, y, w, h) {
        for (var j = 0; j < h; j++) {
            for (var i = 0; i < w; i++) {
                var xs = [x + i, COLS - 1 - x - i], ys = [y + j, ROWS - 1 - y - j];
                for (var k = 0; k < 4; k++) base[ys[k >> 1] * COLS + xs[k & 1]] = WALL;
            }
        }
    }

    // Every rider gets a clear lane ahead of its start cell, whatever the
    // seeded layout put there, so a round never begins with a forced crash.
    function carveSpawns(base) {
        SPAWNS.forEach(function (sp) {
            var px = DY[sp[2]], py = DX[sp[2]];             // unit vector across the lane
            for (var k = -2; k <= 14; k++) {
                for (var side = -1; side <= 1; side++) {
                    var x = sp[0] + DX[sp[2]] * k + px * side, y = sp[1] + DY[sp[2]] * k + py * side;
                    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) base[y * COLS + x] = 0;
                }
            }
        });
    }

    function buildLayout(level, cfg) {
        var base = new Uint8Array(N), rnd = G.rng(level * 7919), w, h;
        for (var i = 0; i < (cfg.blocks || 0); i++) {
            if (cfg.layout === 'bars') {
                var flat = rnd() < 0.5;
                w = flat ? 6 + Math.floor(rnd() * 9) : 1;
                h = flat ? 1 : 4 + Math.floor(rnd() * 6);
            } else {
                w = 2 + Math.floor(rnd() * 3); h = 2 + Math.floor(rnd() * 3);
            }
            mirrorRect(base, 5 + Math.floor(rnd() * (34 - w)), 3 + Math.floor(rnd() * (17 - h)), w, h);
        }
        carveSpawns(base);
        return base;
    }

    function blockCells(base) {
        var cells = [];
        for (var i = 0; i < N; i++) if (base[i]) cells.push(i);
        return cells;
    }

    // ------------------------------------------------------------------
    // Rounds
    // ------------------------------------------------------------------

    function newCycle(s, n, skill) {
        var sp = SPAWNS[n], i = sp[1] * COLS + sp[0];
        s.grid[i] = n + 1;
        return {
            id: n + 1, x: sp[0], y: sp[1], dir: sp[2], prog: 0, alive: true, trail: [i], tail: 0,
            queue: [], charge: 1, boosting: false, boostT: 0, stepTick: -1,
            skill: skill, color: n ? RIDER_COLORS[n - 1] : C.cyan
        };
    }

    // A round restarts everything except the wins: the arena, the collapse,
    // the trails and every rider.
    function startRound(s) {
        s.grid.set(s.base);
        s.cycles = [newCycle(s, 0, null)];
        s.cfg.riders.forEach(function (name, i) { s.cycles.push(newCycle(s, i + 1, SKILL[name])); });
        s.me = s.cycles[0];
        s.phase = 'count'; s.timer = COUNT_STEP * 3; s.beeps = 4; s.msg = '';
        s.roundT = 0; s.ring = 0; s.warned = false; s.locked = false;
        s.shrinkT = s.cfg.shrink ? s.cfg.shrink.start : 0;
        s.pod = null; s.podT = 3; s.boostSfx = 0; s.grindSfx = 0;
        s.round++;
    }

    function init(level) {
        var cfg = LEVELS[level - 1], base = buildLayout(level, cfg);
        var s = {
            cfg: cfg, base: base, blocks: blockCells(base), wins: 0, round: 0, time: 0, tick: 0,
            touch: G.isTouch(),
            grid: new Uint8Array(N), mark: new Uint16Array(N), queue: new Int16Array(N), stamp: 0,
            note: { text: '', t: 0 }
        };
        startRound(s);
        return s;
    }

    function setNote(s, text) { s.note.text = text; s.note.t = 2.2; }

    function ridersAlive(s) {
        return s.cycles.filter(function (c) { return c !== s.me && c.alive; }).length;
    }

    // ------------------------------------------------------------------
    // Grid queries
    // ------------------------------------------------------------------

    function ringOf(x, y) { return Math.min(x, y, COLS - 1 - x, ROWS - 1 - y); }

    // `virt` also counts the ring that collapses next as solid: riders plan
    // with it so they are not standing there when it goes.
    function solid(s, x, y, virt) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
        if (s.grid[y * COLS + x]) return true;
        return !!(virt && s.cfg.shrink && s.ring < MAX_RING && ringOf(x, y) <= s.ring);
    }

    function runLength(s, x, y, d, cap, virt) {
        var n = 0;
        while (n < cap && !solid(s, x + DX[d] * (n + 1), y + DY[d] * (n + 1), virt)) n++;
        return n;
    }

    // Counts the free cells reachable from (x, y), up to `cap`. The stamp
    // saves clearing the visited map for each of the many floods per second.
    function flood(s, x, y, cap, virt) {
        if (++s.stamp > 65000) { s.mark.fill(0); s.stamp = 1; }
        var q = s.queue, mark = s.mark, st = s.stamp, head = 0, tail = 0, n = 0;
        q[tail++] = y * COLS + x; mark[y * COLS + x] = st;
        while (head < tail && n < cap) {
            var i = q[head++], cx = i % COLS, cy = (i - cx) / COLS;
            n++;
            for (var d = 0; d < 4; d++) {
                var nx = cx + DX[d], ny = cy + DY[d], j = ny * COLS + nx;
                if (solid(s, nx, ny, virt) || mark[j] === st) continue;
                mark[j] = st; q[tail++] = j;
            }
        }
        return n;
    }

    // ------------------------------------------------------------------
    // Rider AI
    // ------------------------------------------------------------------

    function options(s, c, virt) {
        var out = [], rel = [0, 1, 3];                      // straight, right, left
        for (var k = 0; k < 3; k++) {
            var d = (c.dir + rel[k]) % 4, free = runLength(s, c.x, c.y, d, c.skill.look, virt);
            if (free > 0) out.push({ d: d, free: free, straight: k === 0, area: 0 });
        }
        return out;
    }

    // Fills in the room behind each option and returns the largest, or 0 for
    // riders that do not look that far.
    function measure(s, c, opts, virt) {
        var max = 0;
        if (!c.skill.flood) return 0;
        opts.forEach(function (o) {
            o.area = flood(s, c.x + DX[o.d], c.y + DY[o.d], c.skill.flood, virt);
            max = Math.max(max, o.area);
        });
        return max;
    }

    // Hunters go for whichever cycle is nearest, rider or player, so the pack
    // fights among itself instead of ganging up. They aim at a point ahead of
    // the prey to arrive in front of its nose, and hold off for the first
    // seconds so nobody is ambushed straight off the start line.
    function target(s, c) {
        var prey = null, near = Infinity;
        if (!c.skill.aggr || s.roundT < GRACE) return null;
        s.cycles.forEach(function (o) {
            var d = Math.abs(o.x - c.x) + Math.abs(o.y - c.y);
            if (o !== c && o.alive && d < near) { near = d; prey = o; }
        });
        if (!prey) return null;
        var lead = Math.min(10, Math.floor(near / 2));
        return { x: prey.x + DX[prey.dir] * lead, y: prey.y + DY[prey.dir] * lead };
    }

    // How much a wall dropped on this cell would crowd the player: 1 for the
    // cells straight ahead that it reaches within REACT seconds, 0.5 for the
    // other cells in front of it that it could reach in that time by turning,
    // else 0. A human cannot dodge a wall that appears there, so riders cut
    // the player off further ahead than that, or not at all.
    function crowding(s, x, y) {
        var me = s.me, reach = Math.ceil(s.cfg.speed * (me.boosting ? BOOST : 1) * REACT);
        var ahead = (x - me.x) * DX[me.dir] + (y - me.y) * DY[me.dir];
        var aside = Math.abs((x - me.x) * DY[me.dir] - (y - me.y) * DX[me.dir]);
        if (!me.alive || ahead < 0 || ahead + aside > reach) return 0;
        return aside ? 0.5 : 1;
    }

    // A rider puts a wall right under the player's nose only when its other
    // ways out are dead ends: those options are dropped while a roomy one is left.
    function clearOfNose(s, c, opts, maxArea) {
        var keep = opts.filter(function (o) {
            return crowding(s, c.x + DX[o.d], c.y + DY[o.d]) < 1 && o.area >= maxArea / 4;
        });
        return keep.length ? keep : opts;
    }

    function rate(s, c, o, maxArea, tgt, wobble) {
        var sk = c.skill, sc = o.free * 2 + G.rnd(0, sk.jitter);
        if (o.straight) sc += wobble ? -6 : 6;              // going straight is the default
        if (maxArea) sc += 80 * o.area / maxArea;           // never trade room for anything else
        sc -= 60 * crowding(s, c.x + DX[o.d], c.y + DY[o.d]);   // keep out of the player's face
        if (tgt) {
            var now = Math.abs(c.x - tgt.x) + Math.abs(c.y - tgt.y);
            var then = Math.abs(c.x + DX[o.d] - tgt.x) + Math.abs(c.y + DY[o.d] - tgt.y);
            sc += sk.aggr * 8 * (now - then);
        }
        return sc;
    }

    function planBoost(s, c, best) {
        var sk = c.skill;
        if (sk.boost && s.roundT >= GRACE && c.boostT <= 0 && c.charge > 0.4 && best.free >= sk.look * 0.8 && Math.random() < 0.05) {
            c.boostT = G.rnd(0.4, 1.1);
        }
    }

    // Picks the heading for the next cell. A "miss" skips the decision, which
    // is how weaker riders end up in a wall they could have avoided.
    function think(s, c) {
        var sk = c.skill, virt = true, best = null, bestSc = -Infinity;
        if (Math.random() < sk.miss) return;
        var opts = options(s, c, virt);
        if (!opts.length) { virt = false; opts = options(s, c, virt); }
        if (!opts.length) return;
        var maxArea = measure(s, c, opts, virt), tgt = target(s, c), wobble = Math.random() < sk.wobble;
        clearOfNose(s, c, opts, maxArea).forEach(function (o) {
            var sc = rate(s, c, o, maxArea, tgt, wobble);
            if (sc > bestSc) { bestSc = sc; best = o; }
        });
        c.dir = best.d;
        planBoost(s, c, best);
    }

    // ------------------------------------------------------------------
    // Cycles
    // ------------------------------------------------------------------

    function cellX(i) { return (i % COLS) * CELL + CELL / 2; }
    function cellY(i) { return OY + Math.floor(i / COLS) * CELL + CELL / 2; }

    function readTurns(s) {
        var q = s.me.queue;
        // Two buffered turns are enough for a quick U-turn without letting
        // stale presses pile up.
        for (var d = 0; d < 4; d++) if (G.hit[KEYS[d]] && q.length < 2) q.push(d);
    }

    function steerPlayer(c) {
        while (c.queue.length) {
            var d = c.queue.shift();
            if (d === c.dir || d === (c.dir + 2) % 4) continue;   // no-op or a reversal into the own wall
            c.dir = d;
            G.tone(540, 0.03, { vol: 0.07 });
            return;
        }
    }

    // The wall goes down with its rider, which reopens the arena.
    function derez(s, c) {
        var px = cellX(c.y * COLS + c.x), py = cellY(c.y * COLS + c.x);
        c.alive = false; c.boosting = false;
        for (var k = c.tail; k < c.trail.length; k++) {
            var i = c.trail[k];
            if (s.grid[i] === c.id) s.grid[i] = 0;
            if (k % 6 === 0) G.burst(cellX(i), cellY(i), { n: 2, color: c.color, speed: 60, life: 0.7, size: 3 });
        }
        c.trail = []; c.tail = 0;
        G.burst(px, py, { n: 28, color: c.color, speed: 260, life: 0.8, size: 4, drag: 2 });
        G.burst(px, py, { n: 10, color: C.fg, speed: 140, life: 0.5 });
        G.sfx('boom');
        G.tone(700, 0.4, { type: 'sawtooth', slide: 60, vol: 0.14 });
        G.shake(5, 0.25);
        if (c !== s.me && s.me.alive && s.phase === 'run') {
            G.addScore(100 * G.level);
            G.popup(px, py - 12, '+' + 100 * G.level, c.color);
        }
    }

    // Two cycles meeting nose to nose take each other out, whichever of them
    // happens to move first on the tick they meet (the player always moves
    // first, and must not lose a head-on for that). Anything else — including
    // ramming a head from the side — only costs the one that ran into the wall.
    function crash(s, c, nx, ny) {
        var inside = nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS;
        var o = inside ? s.cycles[s.grid[ny * COLS + nx] - 1] : null;
        var headOn = o && o !== c && o.alive && o.x === nx && o.y === ny && o.dir === (c.dir + 2) % 4;
        if (headOn) derez(s, o);
        derez(s, c);
    }

    function fade(s, c) {
        if (!s.cfg.decay || s.locked) return;
        while (c.trail.length - c.tail > s.cfg.decay) {
            var i = c.trail[c.tail++];
            if (s.grid[i] === c.id) s.grid[i] = 0;
        }
        // Drop the faded prefix now and then so the list stays short.
        if (c.tail > 400) { c.trail = c.trail.slice(c.tail); c.tail = 0; }
    }

    function takePod(s, c) {
        s.pod = null; s.podT = 5;
        c.charge = Math.min(1, c.charge + 0.5);
        if (c !== s.me) { G.sfx('blip'); return; }
        G.sfx('coin');
        G.addScore(50);
        G.popup(cellX(c.y * COLS + c.x), cellY(c.y * COLS + c.x) - 10, 'CHARGE', C.yellow);
    }

    // Riding with a rival's wall right beside the cycle recharges the boost.
    function grind(s, c) {
        for (var side = 1; side <= 3; side += 2) {
            var d = (c.dir + side) % 4, x = c.x + DX[d], y = c.y + DY[d];
            if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
            var v = s.grid[y * COLS + x];
            if (!v || v === WALL || v === c.id) continue;
            c.charge = Math.min(1, c.charge + 0.035);
            G.addScore(2);
            G.burst(cellX(c.y * COLS + c.x) + DX[d] * 5, cellY(c.y * COLS + c.x) + DY[d] * 5, { n: 2, color: C.fg, speed: 90, life: 0.25, size: 2 });
            if (s.grindSfx <= 0) { G.tone(1900, 0.03, { type: 'sawtooth', vol: 0.05 }); s.grindSfx = 0.09; }
        }
    }

    function stepCell(s, c) {
        if (c === s.me) steerPlayer(c); else think(s, c);
        var nx = c.x + DX[c.dir], ny = c.y + DY[c.dir];
        if (solid(s, nx, ny, false)) { crash(s, c, nx, ny); return; }
        c.x = nx; c.y = ny; c.stepTick = s.tick;
        s.grid[ny * COLS + nx] = c.id;
        c.trail.push(ny * COLS + nx);
        fade(s, c);
        if (s.pod && s.pod.x === nx && s.pod.y === ny) takePod(s, c);
        if (c === s.me) grind(s, c);
        if (c.boosting) G.burst(cellX(ny * COLS + nx), cellY(ny * COLS + nx), { n: 1, color: c.color, speed: 50, life: 0.35, size: 2 });
    }

    // Boosting drains the charge in two seconds; it trickles back otherwise.
    function tickCharge(s, c, dt) {
        var want = c === s.me ? G.key.a : c.boostT > 0;
        if (c.boostT > 0) c.boostT -= dt;
        c.boosting = want && s.phase === 'run' && c.charge > 0.02;
        c.charge = G.clamp(c.charge + (c.boosting ? -0.5 : 0.05) * dt, 0, 1);
    }

    function moveAll(s, dt) {
        s.cycles.forEach(function (c) {
            if (!c.alive) return;
            tickCharge(s, c, dt);
            c.prog += s.cfg.speed * (c.boosting ? BOOST : 1) * dt;
            while (c.prog >= 1 && c.alive) { c.prog -= 1; stepCell(s, c); }
        });
        if (s.me.boosting && s.boostSfx <= 0) {
            G.noise(0.14, { filter: 'bandpass', freq: 900, slide: 2600, vol: 0.09 });
            s.boostSfx = 0.16;
        }
    }

    // ------------------------------------------------------------------
    // Arena events: collapse, trail lock, pods
    // ------------------------------------------------------------------

    function collapse(s) {
        var r = s.ring;
        for (var i = 0; i < N; i++) if (ringOf(i % COLS, Math.floor(i / COLS)) === r) s.grid[i] = WALL;
        if (s.pod && ringOf(s.pod.x, s.pod.y) === r) s.pod = null;
        s.ring++;
        s.cycles.forEach(function (c) { if (c.alive && ringOf(c.x, c.y) === r) derez(s, c); });
        G.noise(0.5, { freq: 320, slide: 50, vol: 0.3 });
        G.shake(4, 0.3);
    }

    function tickShrink(s, dt) {
        if (!s.cfg.shrink || s.ring >= MAX_RING) return;
        s.shrinkT -= dt;
        if (s.shrinkT < 1.3 && !s.warned) { s.warned = true; G.sfx('alarm'); }
        if (s.shrinkT > 0) return;
        collapse(s);
        s.shrinkT = s.cfg.shrink.every; s.warned = false;
    }

    // Fading trails could let a careful round go on forever, so after a while
    // they stop fading and the arena fills up like any other.
    function tickLock(s) {
        if (!s.cfg.decay || s.locked || s.roundT < LOCK_AT) return;
        s.locked = true;
        setNote(s, 'TRAILS LOCKED');
        G.tone(220, 0.5, { type: 'sawtooth', slide: 880, vol: 0.14 });
    }

    function tickPod(s, dt) {
        if (!s.cfg.pods || s.pod) return;
        s.podT -= dt;
        if (s.podT > 0) return;
        // A few tries at a free cell away from the edge; if all are taken the
        // next tick simply tries again.
        for (var k = 0; k < 12; k++) {
            var x = Math.floor(G.rnd(4, COLS - 4)), y = Math.floor(G.rnd(4, ROWS - 4));
            if (solid(s, x, y, true) || ringOf(x, y) <= s.ring + 1) continue;
            s.pod = { x: x, y: y };
            G.tone(1320, 0.08, { type: 'triangle', vol: 0.08 });
            return;
        }
    }

    function tickArena(s, dt) {
        s.roundT += dt;
        s.boostSfx -= dt; s.grindSfx -= dt;
        tickShrink(s, dt);
        tickLock(s);
        tickPod(s, dt);
    }

    // ------------------------------------------------------------------
    // Round flow
    // ------------------------------------------------------------------

    function tickCount(s, dt) {
        s.timer -= dt;
        var left = Math.ceil(s.timer / COUNT_STEP);
        // s.beeps starts one above the count, so the "3" also sounds here on
        // the first tick and init (which runs on the title screen) stays silent.
        if (left < s.beeps && left > 0) G.tone(440, 0.09, { type: 'triangle', vol: 0.16 });
        s.beeps = left;
        if (s.timer > 0) return;
        s.phase = 'run';
        G.tone(880, 0.3, { type: 'triangle', vol: 0.2 });
    }

    function endRound(s, msg) { s.phase = 'end'; s.timer = 1.7; s.msg = msg; }

    function roundWon(s) {
        s.wins++;
        G.addScore(250 * G.level);
        G.burst(cellX(s.me.y * COLS + s.me.x), cellY(s.me.y * COLS + s.me.x), { n: 30, color: C.cyan, speed: 220, life: 0.9 });
        if (s.wins >= s.cfg.need) { G.win(500 * G.level + G.lives * 200); return; }
        G.sfx('power');
        endRound(s, 'ROUND WON');
    }

    // Decides the round once per tick, after every cycle has moved, so a
    // mutual crash is seen as a draw and not as whoever moved first.
    function judge(s) {
        var riders = ridersAlive(s);
        if (s.me.alive) { if (!riders) roundWon(s); return; }
        if (!riders) { G.sfx('bounce'); endRound(s, 'DRAW — REPLAY'); return; }
        if (G.loseLife() > 0) endRound(s, 'DEREZZED');
    }

    function update(s, dt) {
        s.time += dt; s.tick++;
        if (s.note.t > 0) s.note.t -= dt;
        readTurns(s);
        if (s.phase === 'count') { tickCount(s, dt); return; }
        if (s.phase === 'run') tickArena(s, dt);
        // After a win everything freezes for the banner; after a loss the
        // surviving riders ride on.
        if (s.phase === 'run' || !s.me.alive) moveAll(s, dt);
        if (s.phase === 'run') { judge(s); return; }
        s.timer -= dt;
        if (s.timer <= 0) startRound(s);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // Batch each grid colour into one path when building the cached floor.
    function drawGrid(ctx, vertical, major) {
        var count = vertical ? COLS : ROWS;
        ctx.strokeStyle = vertical ? (major ? 'rgba(0,245,255,0.13)' : 'rgba(0,245,255,0.05)') :
            (major ? 'rgba(255,0,204,0.13)' : 'rgba(255,0,204,0.05)');
        ctx.beginPath();
        for (var k = 0; k <= count; k++) {
            if (((vertical ? k : k + 1) % 4 === 0) !== major) continue;
            var p = k * CELL + 0.5;
            if (vertical) { ctx.moveTo(p, OY); ctx.lineTo(p, OY + ROWS * CELL); }
            else { ctx.moveTo(0, OY + p); ctx.lineTo(G.W, OY + p); }
        }
        ctx.stroke();
    }

    // These detached canvases belong to the level state, so restarting or
    // switching levels cannot reuse a floor or border from another arena.
    function layer(scale) {
        var pic = document.createElement('canvas');
        pic.width = Math.round(G.W * scale); pic.height = Math.round(G.H * scale);
        pic.getContext('2d').scale(scale, scale);
        return pic;
    }

    function floorLayer(scale) {
        var pic = layer(scale), ctx = pic.getContext('2d');
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.lineWidth = 1;
        drawGrid(ctx, true, false); drawGrid(ctx, true, true);
        drawGrid(ctx, false, false); drawGrid(ctx, false, true);
        return pic;
    }

    function drawFloor(s, ctx) {
        // Match the engine's device scale so cached lines stay as sharp as
        // live geometry, including after a window resize or phone rotation.
        var scale = ctx.getTransform().a;
        if (!s.floor || s.layerScale !== scale) {
            s.floor = floorLayer(scale); s.layerScale = scale; s.border = null;
        }
        ctx.drawImage(s.floor, 0, 0, s.floor.width / scale, s.floor.height / scale);
        // A scan line sweeps the floor so the arena is never completely still.
        var sy = OY + (s.time * 90) % (ROWS * CELL), grad = ctx.createLinearGradient(0, sy - 40, 0, sy);
        grad.addColorStop(0, 'rgba(0,245,255,0)'); grad.addColorStop(1, 'rgba(0,245,255,0.10)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, Math.max(OY, sy - 40), G.W, sy - Math.max(OY, sy - 40));
    }

    function drawBlocks(s, ctx) {
        ctx.fillStyle = 'rgba(138,77,255,0.35)';
        ctx.strokeStyle = C.block;
        ctx.lineWidth = 1;
        s.blocks.forEach(function (i) {
            var x = (i % COLS) * CELL, y = OY + Math.floor(i / COLS) * CELL;
            ctx.fillRect(x, y, CELL, CELL);
            ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        });
    }

    function borderLayer(s) {
        var pic = layer(s.layerScale), ctx = pic.getContext('2d');
        drawBlocks(s, ctx);
        var t = s.ring * CELL, w = G.W - 2 * t, h = ROWS * CELL - 2 * t;
        if (t) {
            ctx.fillStyle = 'rgba(255,0,204,0.20)';
            ctx.fillRect(0, OY, G.W, t); ctx.fillRect(0, OY + ROWS * CELL - t, G.W, t);
            ctx.fillRect(0, OY + t, t, h); ctx.fillRect(G.W - t, OY + t, t, h);
        }
        ctx.shadowColor = t ? C.magenta : C.cyan; ctx.shadowBlur = 12;
        ctx.strokeStyle = t ? C.magenta : C.cyan; ctx.lineWidth = 2;
        ctx.strokeRect(t + 1, OY + t + 1, w - 2, h - 2);
        return pic;
    }

    // Only a collapse changes these walls. Cache their glow instead of
    // blurring an arena-sized surface every frame; keep the warning animated.
    function drawCollapse(s, ctx) {
        if (!s.border || s.borderRing !== s.ring) {
            s.border = borderLayer(s); s.borderRing = s.ring;
        }
        ctx.drawImage(s.border, 0, 0, s.border.width / s.layerScale, s.border.height / s.layerScale);
        if (!s.cfg.shrink || s.ring >= MAX_RING || s.phase !== 'run') return;
        var t = s.ring * CELL, w = G.W - 2 * t, h = ROWS * CELL - 2 * t;
        var urgent = s.shrinkT < 1.3, blink = 0.5 + 0.5 * Math.sin(s.time * (urgent ? 26 : 5));
        ctx.strokeStyle = 'rgba(255,0,204,' + (urgent ? 0.25 + 0.5 * blink : 0.08 + 0.08 * blink) + ')';
        ctx.lineWidth = CELL;
        ctx.strokeRect(t + CELL / 2, OY + t + CELL / 2, w - CELL, h - CELL);
    }

    function drawPod(s, ctx) {
        if (!s.pod) return;
        var x = s.pod.x * CELL + CELL / 2, y = OY + s.pod.y * CELL + CELL / 2, r = 6 + 2 * Math.sin(s.time * 8);
        ctx.shadowColor = C.yellow; ctx.shadowBlur = s.touch ? 8 : 14;
        ctx.fillStyle = C.yellow;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
    }

    // The head is drawn on its way into its current cell: the grid already
    // counts that cell as taken, so the picture never lags behind a crash.
    function headPos(c) {
        var i = c.y * COLS + c.x, back = c.stepTick < 0 ? 0 : (1 - Math.min(1, c.prog)) * CELL;
        return { x: cellX(i) - DX[c.dir] * back, y: cellY(i) - DY[c.dir] * back };
    }

    // A wide soft stroke under a thin bright one reads as glow without the
    // cost of blurring thousands of trail cells.
    function drawTrail(ctx, c, h, touch) {
        var t = c.trail, last = t.length - 1;
        ctx.beginPath();
        ctx.moveTo(cellX(t[Math.min(c.tail, last)]), cellY(t[Math.min(c.tail, last)]));
        for (var k = c.tail + 1; k < last; k++) ctx.lineTo(cellX(t[k]), cellY(t[k]));
        ctx.lineTo(h.x, h.y);
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
        ctx.strokeStyle = c.color;
        ctx.globalAlpha = 0.28; ctx.lineWidth = 9; ctx.stroke();
        // At portrait scale a four-pixel wall is barely a CSS pixel wide.
        // Keep its bright core visible without changing occupied grid cells.
        ctx.globalAlpha = 1; ctx.lineWidth = touch ? 6 : 4; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
    }

    function drawCycle(s, ctx, c) {
        if (!c.alive) return;
        var h = headPos(c), flat = DX[c.dir] !== 0, w = flat ? 16 : 9, ht = flat ? 9 : 16;
        drawTrail(ctx, c, h, s.touch);
        ctx.shadowColor = c.color; ctx.shadowBlur = s.touch ? (c.boosting ? 12 : 6) : (c.boosting ? 26 : 14);
        ctx.fillStyle = c.color;
        ctx.fillRect(h.x - w / 2, h.y - ht / 2, w, ht);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(h.x - w / 4, h.y - ht / 4, w / 2, ht / 2);
    }

    function drawPips(s, ctx) {
        var need = s.cfg.need, x0 = G.W / 2 - (need - 1) * 13, y = G.H / 2 + 86;
        for (var k = 0; k < need; k++) {
            ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
            ctx.fillStyle = k < s.wins ? C.cyan : 'rgba(0,0,0,0.5)';
            ctx.fillRect(x0 + k * 26 - 7, y - 7, 14, 14);
            ctx.strokeRect(x0 + k * 26 - 7, y - 7, 14, 14);
        }
    }

    function drawCountdown(s, ctx) {
        var h = headPos(s.me), bob = Math.sin(s.time * 9) * 3;
        var left = Math.max(1, Math.ceil(s.timer / COUNT_STEP));
        G.text(String(left), G.W / 2, G.H / 2 + 30, { size: 96, bold: true, color: C.fg, align: 'center', glow: C.cyan });
        G.text('ROUND ' + s.round + ' · FIRST TO ' + s.cfg.need, G.W / 2, G.H / 2 + 64, { size: s.touch ? 24 : 15, color: s.touch ? C.fg : C.dim, align: 'center' });
        drawPips(s, ctx);
        G.text('YOU', h.x, h.y - 26 + bob, { size: s.touch ? 24 : 13, bold: true, color: C.cyan, align: 'center', glow: C.cyan });
        ctx.fillStyle = C.cyan;
        ctx.beginPath();
        ctx.moveTo(h.x - 5, h.y - 21 + bob); ctx.lineTo(h.x + 5, h.y - 21 + bob); ctx.lineTo(h.x, h.y - 14 + bob);
        ctx.closePath(); ctx.fill();
    }

    function drawMessages(s, ctx) {
        if (s.phase === 'count') drawCountdown(s, ctx);
        if (s.phase === 'end') {
            var tint = s.msg === 'ROUND WON' ? C.cyan : (s.msg === 'DEREZZED' ? C.magenta : C.yellow);
            G.text(s.msg, G.W / 2, G.H / 2 + 20, { size: 48, bold: true, color: C.fg, align: 'center', glow: tint });
            drawPips(s, ctx);
        }
        if (s.note.t > 0) {
            ctx.globalAlpha = Math.min(1, s.note.t);
            G.text(s.note.text, G.W / 2, OY + 40, { size: s.touch ? 24 : 20, bold: true, color: C.yellow, align: 'center', glow: C.yellow });
            ctx.globalAlpha = 1;
        }
    }

    function draw(s, ctx) {
        drawFloor(s, ctx);
        drawCollapse(s, ctx);
        drawPod(s, ctx);
        // The player is drawn last so the cyan cycle is never hidden.
        for (var k = s.cycles.length - 1; k >= 0; k--) drawCycle(s, ctx, s.cycles[k]);
        drawMessages(s, ctx);
    }

    // ------------------------------------------------------------------
    // The ending: light cycles race up out of the grid and burst into neon
    // fireworks, while the player's cyan cycle laps the floor below
    // ------------------------------------------------------------------

    var END_COLORS = [C.cyan, C.magenta, C.yellow, '#ff7a1a', '#5dff6e'];
    var END_SPEED = 520, END_BURST = 1.3, END_FLOOR = 472;

    function launchRider(e) {
        var r = e.rng, x = (8 + Math.floor(r() * 64)) * CELL;
        return {
            x: x, y: G.H, pts: [{ x: x, y: G.H }], dir: 3, age: 0, turn: 0.2 + r() * 0.2, back: 0,
            fuse: 0.6 + r() * 0.3, color: END_COLORS[Math.floor(r() * END_COLORS.length)]
        };
    }

    // A rider climbs, jinks sideways once and climbs on: every turn is a
    // corner of its wall, like in the arena.
    function moveRider(e, c, dt) {
        c.age += dt;
        if (c.dir === 3 && !c.back && c.age >= c.turn) {
            c.dir = e.rng() < 0.5 ? 0 : 2; c.back = c.age + 0.1 + e.rng() * 0.12;
            c.pts.push({ x: c.x, y: c.y });
        } else if (c.dir !== 3 && c.age >= c.back) {
            c.dir = 3;
            c.pts.push({ x: c.x, y: c.y });
        }
        c.x += DX[c.dir] * END_SPEED * dt; c.y += DY[c.dir] * END_SPEED * dt;
    }

    // The scene keeps its riders and bursts in e.data and steps them by the
    // time since the last frame.
    function stepEnding(e) {
        var d = e.data, dt = Math.min(0.05, e.t - (d.last || 0)), i;
        d.last = e.t;
        if (!d.riders) { d.riders = []; d.bursts = []; d.next = 0; }
        if ((d.next -= dt) <= 0 && d.riders.length < 6) { d.riders.push(launchRider(e)); d.next = 0.3 + e.rng() * 0.4; }
        for (i = d.riders.length - 1; i >= 0; i--) {
            var c = d.riders[i];
            moveRider(e, c, dt);
            if (c.age < c.fuse) continue;
            c.pts.push({ x: c.x, y: c.y });
            d.bursts.push({ x: c.x, y: c.y, age: 0, color: c.color, pts: c.pts });
            d.riders.splice(i, 1);
        }
        for (i = d.bursts.length - 1; i >= 0; i--) if ((d.bursts[i].age += dt) > END_BURST) d.bursts.splice(i, 1);
    }

    // The arena's wall look: a wide soft stroke, a bright core, a white line.
    function glowStroke(ctx, color, alpha) {
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.28 * alpha; ctx.lineWidth = 9; ctx.stroke();
        ctx.globalAlpha = alpha; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function wallPath(ctx, pts, hx, hy) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.lineTo(hx, hy);
    }

    // The wall fades fast; eight rays of light fly out and a square ring
    // grows behind them.
    function drawBurst(ctx, b) {
        var f = b.age / END_BURST, fade = 1 - f, r = 20 + 230 * Math.sqrt(f);
        if (b.age < 0.5) { wallPath(ctx, b.pts, b.x, b.y); glowStroke(ctx, b.color, 1 - b.age / 0.5); }
        ctx.beginPath();
        for (var k = 0; k < 8; k++) {
            var cx = Math.cos(k * Math.PI / 4), sy = Math.sin(k * Math.PI / 4);
            ctx.moveTo(b.x + cx * r * 0.55, b.y + sy * r * 0.55);
            ctx.lineTo(b.x + cx * r, b.y + sy * r);
        }
        glowStroke(ctx, b.color, fade);
        ctx.beginPath();
        ctx.rect(b.x - r * 0.4, b.y - r * 0.4, r * 0.8, r * 0.8);
        glowStroke(ctx, b.color, fade * 0.6);
    }

    function drawEnding(e, ctx) {
        stepEnding(e);
        var d = e.data, x = (e.t * 360) % (G.W + 400) - 120;
        d.riders.forEach(function (c) {
            wallPath(ctx, c.pts, c.x, c.y); glowStroke(ctx, c.color, 1);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
        });
        d.bursts.forEach(function (b) { drawBurst(ctx, b); });
        ctx.beginPath(); ctx.moveTo(x - 280, END_FLOOR); ctx.lineTo(x, END_FLOOR);
        glowStroke(ctx, C.cyan, 1);
        ctx.fillStyle = C.cyan; ctx.fillRect(x - 8, END_FLOOR - 4.5, 16, 9);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, END_FLOOR - 2.25, 8, 4.5);
    }

    function hud(s) {
        if (s.touch) return s.wins + '/' + s.cfg.need + '  AI ' + ridersAlive(s) + '  BOOST ' + Math.round(s.me.charge * 100);
        return 'WINS ' + s.wins + '/' + s.cfg.need + '  RIDERS ' + ridersAlive(s) + '  BOOST ' + Math.round(s.me.charge * 100);
    }

    G.register('neon', {
        title: 'LIGHT CYCLES',
        blurb: 'Every cycle leaves a wall of light. Box the riders in and outlast them all.',
        controls: [
            'Arrows / pad turn — your cyan cycle never stops',
            'SPACE / BOOST speeds up while the charge lasts',
            'Recharge: yellow pods or ride beside a rival wall',
            'Win the rounds shown; crashing costs a life'
        ],
        levelNames: ['Grid Zero', 'Fading Light', 'The Expert'],
        colors: { bg: C.bg, fg: C.fg, accent: C.cyan, dim: C.dim },
        lives: 4,
        music: {
            bpm: 132, root: 45, scale: 'pentatonic', prog: [0, 0, 2, 2, 4, 4, 3, 3],
            bass: 'x.xox.xox.xox.o5',
            lead: [
                '5.7.9-..7.5.4...', '7.9.a-..9.7.5...', '9.a.c-..a.9.7.9-', '7-5-4-..2.4.5---',
                '5.5.7.9.a-9.7...', '7.7.9.a.c-a.9...', 'c.a.9.7.a.9.7.5.', '4-5-7-..5-------'
            ],
            arp: '0123.213',
            drums: { k: 'x...x...x...x.x.', s: '....x.......x...', h: '..x...x...x...xx' },
            leadWave: 'sawtooth', bassWave: 'sawtooth', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // Grid turns: one direction at a time, so a thumb a little off axis
        // never queues a second turn. B is unused.
        touch: { a: 'BOOST', hide: ['b'], dirs: 4 },
        ending: {
            title: 'END OF LINE',
            text: 'The last rider derezzes, and the grid lights up for you',
            colors: END_COLORS,
            fireworks: false,
            draw: drawEnding
        }
    });
})();
