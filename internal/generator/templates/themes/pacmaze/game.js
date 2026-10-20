/*
 * Neon Maze — the pacmaze theme's game: a maze chase.
 *
 * Eat every dot in the maze while four ghosts hunt you, each in its own way:
 * the chaser heads straight for you, the ambusher aims ahead of you, the
 * flanker pincers you against the chaser and the wanderer drifts. They take
 * turns scattering to their corners and chasing. A power pellet turns them
 * blue and edible for a while.
 *
 * Three mazes: First Bite (an open grid with one side tunnel), Gatecrash
 * (timed shutters, turbo pads and side tunnels on two rows) and Neon Core
 * (dark, a fifth ghost that never scatters, every kind of tunnel). Clearing
 * the core ends the campaign: the maze lights up ring by ring while Pac
 * chases blue ghosts along the top.
 *
 * Everything moves on a tile grid but is integrated with dt: an actor is
 * "p" of the way from tile (cx, cy) to its neighbour in direction (dx, dy).
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 30, COLS = 32, ROWS = 17, OY = G.HUD;
    var EXIT_ROW = 5, HOUSE_ROW = 7;                 // corridor above the ghost house / its inside
    var FRUIT_AT = [0.3, 0.65];                      // share of dots eaten when a fruit appears
    var GATE_PERIOD = 5, GATE_OPEN = 2.7, DYING = 1.2;
    var LAST_DOTS = 12;                              // this few left: they shine through the dark
    var C = {
        night: '#03051d', fill: '#0d1d6b', dot: '#ffd84a', ink: '#f6f7ff', muted: '#a6aed1',
        pink: '#ff9fcf', mint: '#8ff0d2', peach: '#ffad88', lilac: '#c7a7ff',
        scared: '#3a55ff', red: '#ff5a6e', fright: '#777dff'
    };
    // Wall outline per level: all from the theme palette, so every maze has
    // its own mood without leaving the theme. The ending cycles through them.
    var WALL_HUES = ['#168cff', '#ff9fcf', '#c7a7ff', '#8ff0d2'];
    // Up, left, down, right: also the tie-break order when a ghost has two
    // equally good ways to go.
    var DIRS = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];
    var KEYS = ['up', 'left', 'down', 'right'];
    // `home` is the corner a ghost scatters to, `slot` where it waits inside
    // the house (and returns to when eaten).
    var GHOSTS = [
        { kind: 'chaser', color: C.peach, home: { x: 30, y: 1 }, slot: 15.5 },
        { kind: 'ambusher', color: C.pink, home: { x: 1, y: 1 }, slot: 14 },
        { kind: 'flanker', color: C.mint, home: { x: 30, y: 15 }, slot: 15 },
        { kind: 'wanderer', color: C.lilac, home: { x: 1, y: 15 }, slot: 16 },
        // The fifth ghost never scatters, so it has no home corner.
        { kind: 'stalker', color: C.red, slot: 17 }
    ];
    // One entry per level. ps and gs are the player's and the ghosts' speed
    // in tiles per second, power how long a power pellet lasts, scatter and
    // chase the lengths of the two ghost phases, gap the seconds between
    // ghosts leaving the house. `five` adds the fifth ghost at that share of
    // the ghost speed (it never scatters, so it is slower than the others);
    // `dark` is the radius of the lit circle in pixels.
    var LEVELS = [
        { ps: 6.3, gs: 3.4, power: 8.6, scatter: 6.7, chase: 14.5, gap: 3 },
        { ps: 6.6, gs: 4.1, power: 7.4, scatter: 6, chase: 16, gap: 2.4 },
        { ps: 6.9, gs: 4.6, power: 6.4, scatter: 5.4, chase: 17, gap: 1.8, five: 0.72, dark: 175 }
    ];

    // The left half of each maze; the right half is its mirror image.
    //   # wall   . dot   o power pellet   P start (and fruit spot)   space: empty floor
    //   = ghost door   H ghost house   g / j shutters (two alternating groups)   b turbo pad
    // An opening in column 0 is a side tunnel, one in row 0 and 16 a vertical warp.
    // Every maze has the four corner power pellets; the dark core has eight.
    var MAZES = [
        [   // 1 First Bite: open grid, one side tunnel
            '################', '#o......#.......', '#.###.#.#.###.##', '#.....#.#.......', '#.#.###.#.#.####',
            '#...#...#.......', '#.###.###.#.###=', ' .........#.##HH', '#.###.###.#.####', '#...#...#.......',
            '#.#.###.#.#.####', '#.....#.#......P', '#.###.#.#.###.##', '#.....#.........', '#.###.###.###.##',
            '#o..............', '################'
        ],
        [   // 2 Gatecrash: shutters, pads and side tunnels on two rows
            '################', '#o......#.......', '#.###.#.#.#g####', ' ...#.#...#.....', '###.#.###.#.####',
            '#...j...#.......', '#.###.#.#.#.###=', '#.###b#.g.#.##HH', '#.###.#.#.#.####', '#...j...#.......',
            '###.#.###.#.####', '#...#.#...#....P', '#.###.#.#.#g####', ' .......#.......', '#.#####.###.####',
            '#o......b.......', '################'
        ],
        [   // 3 Neon Core: dark, five ghosts, shutters, a pad, every kind of tunnel;
            // eight power pellets instead of four make that fair
            '### ############', '#o......#.......', '#.#.###.#.###.##', '#...#...j.......', '#.#.#.###.#.####',
            '#.....#o........', '###.#.#.#.#.###=', ' ...g..b..#.##HH', '###.#.#.#.#.####', '#.....#o........',
            '#.#.#.###.#.####', '#...#...j......P', '#.#.###.#.###.##', '#.......#.......', '#.#.#####.#.####',
            '#o..............', '### ############'
        ]
    ];

    // ------------------------------------------------------------------
    // Maze
    // ------------------------------------------------------------------

    function buildGrid(level) {
        return MAZES[level - 1].map(function (row) {
            return (row + row.split('').reverse().join('')).split('');
        });
    }

    function isFloor(s, c, r) {
        return r >= 0 && r < ROWS && c >= 0 && c < COLS && s.grid[r][c] !== '#';
    }

    // Counts the dots and pulls the start tile and the shutters out of the grid.
    function scanGrid(s) {
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var ch = s.grid[r][c];
                if (ch === '.' || ch === 'o') s.total++;
                if (ch === 'P') { s.grid[r][c] = ' '; s.start = s.start || { x: c, y: r }; }
                if (ch !== 'g' && ch !== 'j') continue;
                // A shutter across a horizontal corridor is drawn as a vertical bar.
                var gate = { x: c, y: r, phase: ch === 'g' ? 0 : 1, open: true, upright: s.grid[r - 1][c] === '#' };
                s.gates.push(gate);
                s.gateAt[r * COLS + c] = gate;
            }
        }
        s.left = s.total;
    }

    // Every side of a wall tile that faces floor becomes one glowing line, so
    // the walls read as outlined neon blocks. Built once per level.
    function buildEdges(s) {
        var e = s.edges;
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (s.grid[r][c] !== '#') continue;
                var x = c * T, y = OY + r * T;
                if (isFloor(s, c, r - 1)) e.push(x, y, x + T, y);
                if (isFloor(s, c, r + 1)) e.push(x, y + T, x + T, y + T);
                if (isFloor(s, c - 1, r)) e.push(x, y, x, y + T);
                if (isFloor(s, c + 1, r)) e.push(x + T, y, x + T, y + T);
            }
        }
    }

    // Can an actor stand on this tile? Coordinates wrap, which is all a
    // tunnel is. The ghost house is closed to grid movement: ghosts glide in
    // and out of it on their own path.
    function open(s, c, r) {
        c = (c + COLS) % COLS; r = (r + ROWS) % ROWS;
        var ch = s.grid[r][c];
        if (ch === '#' || ch === 'H' || ch === '=') return false;
        if (ch === 'g' || ch === 'j') return s.gateAt[r * COLS + c].open;
        return true;
    }

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    function newGhost(s, i) {
        var d = GHOSTS[i], outside = i === 0;
        // Only the chaser starts outside; the others leave the house one by
        // one, sooner on later levels.
        var gap = LEVELS[s.level - 1].gap;
        return {
            kind: d.kind, color: d.color, home: d.home, slot: d.slot, door: d.slot <= 15.5 ? 15 : 16,
            state: outside ? 'roam' : 'house', wait: i * gap, scared: false, bob: i,
            cx: 15, cy: EXIT_ROW, dx: outside ? -1 : 0, dy: 0, p: 0,
            x: outside ? 15 : d.slot, y: outside ? EXIT_ROW : HOUSE_ROW
        };
    }

    // Puts the player and the ghosts back on their marks; the dots stay eaten.
    function resetActors(s) {
        s.pl = { cx: s.start.x, cy: s.start.y, dx: 0, dy: 0, p: 0, x: s.start.x, y: s.start.y, want: -1, face: Math.PI };
        s.ghosts = [];
        for (var i = 0; i < (s.five ? 5 : 4); i++) s.ghosts.push(newGhost(s, i));
        s.fright = 0; s.boost = 0; s.combo = 0;
        // Every life starts with a scatter phase: a breather to get going.
        s.phaseI = 0; s.phaseT = 0;
    }

    // Scatter and chase take turns for as long as the level lasts (see
    // tickPhase): the breather keeps coming, which is what lets a player
    // fetch the last dots next to the ghost house.
    function init(level) {
        var cfg = LEVELS[level - 1];
        // Ghosts run at about half the player's speed on level 1 and at two
        // thirds in the core.
        var s = {
            level: level, mobile: G.isTouch(), walls: null, grid: buildGrid(level), gates: [], gateAt: {}, gateT: 0, edges: [], start: null,
            total: 0, left: 0, eaten: 0,
            ps: cfg.ps, gs: cfg.gs, powerTime: cfg.power,
            five: cfg.five || 0, sight: cfg.dark || 0, shade: cfg.dark ? 1 : 0,
            fright: 0, combo: 0, boost: 0, hold: 0, dying: 0, ready: 1,
            phases: [cfg.scatter, cfg.chase], phaseI: 0, phaseT: 0,
            fruit: 0, fruitsOut: 0, sirenT: 0, wak: false
        };
        scanGrid(s);
        buildEdges(s);
        resetActors(s);
        return s;
    }

    // ------------------------------------------------------------------
    // Grid movement
    // ------------------------------------------------------------------

    // Moves an actor onto the tile it was heading for. Returns true when that
    // took it through a tunnel.
    function stepTile(e) {
        var nx = e.cx + e.dx, ny = e.cy + e.dy;
        e.cx = (nx + COLS) % COLS; e.cy = (ny + ROWS) % ROWS;
        return e.cx !== nx || e.cy !== ny;
    }

    // Turns an actor round between two tiles: it is now leaving the tile it
    // was heading for.
    function flip(e) {
        stepTile(e);
        e.dx = -e.dx; e.dy = -e.dy; e.p = 1 - e.p;
    }

    // Moves an actor `dist` tiles along the grid. turn(s, e, arrived) picks
    // the next direction at every tile centre; (0, 0) means it stands still.
    function advance(s, e, dist, turn) {
        while (dist > 0) {
            if (!e.dx && !e.dy) { turn(s, e, false); if (!e.dx && !e.dy) break; }
            var room = 1 - e.p;
            if (dist < room) { e.p += dist; break; }
            dist -= room;
            if (stepTile(e) && e === s.pl) G.tone(240, 0.22, { type: 'sine', slide: 70, vol: 0.16 });
            e.p = 0;
            turn(s, e, true);
        }
        e.x = e.cx + e.dx * e.p; e.y = e.cy + e.dy * e.p;
    }

    // ------------------------------------------------------------------
    // Player
    // ------------------------------------------------------------------

    // Is a remembered turn still waiting for its opening? Not once it has
    // been taken, and not while the player stands at a wall.
    function turnPending(pl) {
        var w = DIRS[pl.want];
        return !!w && (pl.dx !== 0 || pl.dy !== 0) && (w.x !== pl.dx || w.y !== pl.dy);
    }

    // A key press is remembered until the maze allows that turn. A single
    // held key counts too, so holding a direction works like tapping it —
    // but it must not wipe out a turn tapped ahead of a junction: people
    // keep the old direction held while they tap the next one.
    function readInput(s) {
        var held = -1, n = 0;
        for (var i = 0; i < 4; i++) {
            if (G.hit[KEYS[i]]) { s.pl.want = i; return; }
            if (G.key[KEYS[i]]) { held = i; n++; }
        }
        if (n === 1 && !turnPending(s.pl)) s.pl.want = held;
    }

    function eatDot(s) {
        s.wak = !s.wak;
        G.tone(s.wak ? 392 : 294, 0.07, { type: 'triangle', slide: s.wak ? 262 : 440, vol: 0.16 });
        G.addScore(10);
    }

    function eatPower(s) {
        s.fright = s.powerTime; s.combo = 0;
        s.ghosts.forEach(function (g) {
            if (g.state !== 'roam') return;
            g.scared = true;
            if (g.p > 0) flip(g);
        });
        G.sfx('power');
        G.tone(110, 0.5, { type: 'sawtooth', slide: 55, vol: 0.12 });
        G.addScore(50);
        G.burst(px(s.pl.cx), py(s.pl.cy), { n: 16, color: C.dot, speed: 200 });
    }

    function offerFruit(s) {
        if (s.fruitsOut >= FRUIT_AT.length || s.eaten < s.total * FRUIT_AT[s.fruitsOut]) return;
        s.fruitsOut++;
        s.fruit = 9;
        G.tone(1175, 0.08, { type: 'triangle', vol: 0.12 });
        G.tone(1568, 0.12, { type: 'triangle', vol: 0.12, delay: 0.08 });
    }

    // What the tile under the player does to it.
    function enterTile(s, pl) {
        var ch = s.grid[pl.cy][pl.cx];
        if (ch === 'b') {
            s.boost = 1.3;
            G.noise(0.3, { filter: 'bandpass', freq: 500, slide: 3200, vol: 0.14 });
            G.tone(330, 0.25, { type: 'sawtooth', slide: 990, vol: 0.08 });
        }
        if (ch !== '.' && ch !== 'o') return;
        s.grid[pl.cy][pl.cx] = ' ';
        s.left--; s.eaten++;
        if (ch === 'o') eatPower(s); else eatDot(s);
        offerFruit(s);
    }

    // Takes the buffered turn as soon as that way is open; otherwise carries
    // straight on and stops at a wall.
    function turnPlayer(s, pl, arrived) {
        if (arrived) enterTile(s, pl);
        var w = DIRS[pl.want];
        if (w && open(s, pl.cx + w.x, pl.cy + w.y)) { pl.dx = w.x; pl.dy = w.y; }
        else if (!open(s, pl.cx + pl.dx, pl.cy + pl.dy)) { pl.dx = 0; pl.dy = 0; }
    }

    function movePlayer(s, dt) {
        var pl = s.pl, w = DIRS[pl.want], fast = s.boost > 0;
        // Reversing needs no junction: it works anywhere between two tiles.
        if (w && pl.p > 0 && w.x === -pl.dx && w.y === -pl.dy) flip(pl);
        if (fast) {
            s.boost -= dt;
            G.burst(px(pl.x), py(pl.y), { n: 1, color: C.mint, speed: 40, life: 0.3 });
        }
        advance(s, pl, s.ps * (fast ? 1.6 : 1) * dt, turnPlayer);
        if (pl.dx || pl.dy) pl.face = Math.atan2(pl.dy, pl.dx);
    }

    // ------------------------------------------------------------------
    // Ghosts
    // ------------------------------------------------------------------

    function scattering(s) { return s.phaseI % 2 === 0; }

    // The tile a ghost steers toward: this is what gives each its character.
    function targetOf(s, g) {
        var p = s.pl, chaser = s.ghosts[0];
        if (g.kind !== 'stalker' && scattering(s)) return g.home;
        if (g.kind === 'ambusher') return { x: p.cx + p.dx * 4, y: p.cy + p.dy * 4 };
        if (g.kind === 'flanker') {
            // The chaser's position mirrored through a point just ahead of
            // the player: the two close in from opposite sides.
            return { x: 2 * (p.cx + p.dx * 2) - chaser.cx, y: 2 * (p.cy + p.dy * 2) - chaser.cy };
        }
        if (g.kind === 'wanderer' && G.dist(g.cx, g.cy, p.cx, p.cy) < 7) return g.home;
        return { x: p.cx, y: p.cy };
    }

    function pickDir(s, g, opts) {
        if (!opts.length) return null;
        // Frightened ghosts flee at random; the wanderer is never quite sure.
        if (g.scared || (g.kind === 'wanderer' && Math.random() < 0.25)) return G.pick(opts);
        var t = targetOf(s, g), best = null, bestD = Infinity;
        opts.forEach(function (d) {
            var dist = G.dist(g.cx + d.x, g.cy + d.y, t.x, t.y);
            if (dist < bestD) { bestD = dist; best = d; }
        });
        return best;
    }

    // Ghosts never turn back on themselves unless it is the only way out (a
    // shutter that closed in front of them).
    function turnGhost(s, g) {
        var opts = [], back = null;
        DIRS.forEach(function (d) {
            if (!open(s, g.cx + d.x, g.cy + d.y)) return;
            if ((g.dx || g.dy) && d.x === -g.dx && d.y === -g.dy) back = d; else opts.push(d);
        });
        if (!opts.length && back) opts.push(back);
        var d = pickDir(s, g, opts);
        g.dx = d ? d.x : 0; g.dy = d ? d.y : 0;
    }

    function ghostSpeed(s, g) {
        var v = s.gs;
        if (g.scared) return v * 0.6;
        // The stalker never rests, so it is slower to stay fair (see LEVELS).
        if (g.kind === 'stalker') v *= s.five;
        // From level 2 the chaser gets a little angry once the maze is nearly empty.
        if (g.kind === 'chaser' && s.level >= 2 && s.left < s.total * 0.25) v *= 1.06;
        // Side tunnels slow ghosts down: they are the player's escape route.
        if (s.grid[g.cy][0] !== '#' && (g.cx < 2 || g.cx > COLS - 3)) v *= 0.65;
        return Math.min(v, s.ps * 0.97);
    }

    // Glides out of the house: sideways to its door, then up through it.
    function leaveHouse(g, dt) {
        var step = 4 * dt;
        if (Math.abs(g.x - g.door) > 0.01) { g.x += G.clamp(g.door - g.x, -step, step); return; }
        g.y -= step;
        if (g.y > EXIT_ROW) return;
        g.state = 'roam'; g.cx = g.door; g.cy = EXIT_ROW; g.p = 0;
        g.dx = g.door === 15 ? -1 : 1; g.dy = 0;
        g.x = g.cx; g.y = g.cy;
    }

    // An eaten ghost's eyes fly straight home, over the walls.
    function flyHome(g, dt) {
        var d = G.dist(g.x, g.y, g.slot, HOUSE_ROW), step = 14 * dt;
        if (d > step) { g.x += (g.slot - g.x) / d * step; g.y += (HOUSE_ROW - g.y) / d * step; return; }
        g.x = g.slot; g.y = HOUSE_ROW; g.state = 'house'; g.wait = 2.5;
        G.tone(880, 0.08, { type: 'sine', slide: 440, vol: 0.1 });
    }

    function moveGhost(s, g, dt) {
        if (g.state === 'roam') advance(s, g, ghostSpeed(s, g) * dt, turnGhost);
        else if (g.state === 'leaving') leaveHouse(g, dt);
        else if (g.state === 'eyes') flyHome(g, dt);
        else {
            g.wait -= dt;
            g.y = HOUSE_ROW + 0.15 * Math.sin(G.t * 6 + g.bob);
            if (g.wait > 0) return;
            g.state = 'leaving';
            G.tone(180, 0.16, { type: 'sawtooth', slide: 360, vol: 0.07 });
        }
    }

    function reverseGhosts(s) {
        s.ghosts.forEach(function (g) {
            if (g.state === 'roam' && !g.scared && g.p > 0) flip(g);
        });
    }

    // Runs the power timer, or else the scatter/chase clock (which stands
    // still while the ghosts are frightened).
    function tickPhase(s, dt) {
        if (s.fright > 0) {
            s.fright -= dt;
            if (s.fright <= 0) s.ghosts.forEach(function (g) { g.scared = false; });
            return;
        }
        s.phaseT += dt;
        if (s.phaseT < s.phases[s.phaseI % 2]) return;
        s.phaseT = 0; s.phaseI++;
        // The sudden about-turn is the player's cue that the mood changed.
        reverseGhosts(s);
        G.tone(scattering(s) ? 300 : 200, 0.18, { type: 'square', slide: scattering(s) ? 150 : 400, vol: 0.06 });
    }

    // ------------------------------------------------------------------
    // Shutters
    // ------------------------------------------------------------------

    function onGate(e, gate) {
        var nx = (e.cx + e.dx + COLS) % COLS, ny = (e.cy + e.dy + ROWS) % ROWS;
        return (e.cx === gate.x && e.cy === gate.y) || (nx === gate.x && ny === gate.y);
    }

    function gateBusy(s, gate) {
        return onGate(s.pl, gate) || s.ghosts.some(function (g) { return g.state === 'roam' && onGate(g, gate); });
    }

    // The two groups open in turn with a short overlap, so no chamber is ever
    // sealed. A shutter never closes on someone passing through it.
    function tickGates(s, dt) {
        var moved = false;
        s.gateT += dt;
        s.gates.forEach(function (gate) {
            var want = (s.gateT + gate.phase * GATE_PERIOD / 2) % GATE_PERIOD < GATE_OPEN;
            if (want === gate.open || (!want && gateBusy(s, gate))) return;
            gate.open = want; moved = true;
        });
        if (!moved) return;
        G.noise(0.07, { freq: 700, vol: 0.1 });
        G.tone(140, 0.08, { type: 'square', vol: 0.06 });
    }

    // ------------------------------------------------------------------
    // Encounters, fruit, siren
    // ------------------------------------------------------------------

    function eatGhost(s, g) {
        var pts = 200 * Math.pow(2, s.combo++);
        g.state = 'eyes'; g.scared = false;
        G.addScore(pts);
        G.popup(px(g.x), py(g.y) - 14, pts, C.mint);
        G.burst(px(g.x), py(g.y), { n: 18, color: C.scared, speed: 220 });
        G.tone(300, 0.3, { type: 'square', slide: 1700, vol: 0.14 });
        G.noise(0.12, { filter: 'highpass', freq: 3000, vol: 0.1 });
        // A short freeze sells the bite.
        s.hold = 0.3;
    }

    function catchPlayer(s) {
        if (G.loseLife() <= 0) return;
        s.dying = DYING; s.fright = 0;
        G.burst(px(s.pl.x), py(s.pl.y), { n: 24, color: C.dot, speed: 180, life: 0.9 });
        for (var i = 0; i < 8; i++) {
            G.tone(700 - i * 70, 0.12, { type: 'triangle', slide: 500 - i * 55, vol: 0.14, delay: i * 0.1 });
        }
    }

    // Distance in tiles the short way round: the maze wraps, so two actors
    // meeting head-on in a tunnel are close although their coordinates are a
    // whole maze apart (without this they passed through each other there).
    function gap(a, b) {
        var dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
        return G.dist(0, 0, Math.min(dx, COLS - dx), Math.min(dy, ROWS - dy));
    }

    // A ghost has to overlap the player by a good half tile to count: a
    // brush past at a junction is a near miss, not a catch.
    function collide(s) {
        var pl = s.pl;
        for (var i = 0; i < s.ghosts.length && !s.dying; i++) {
            var g = s.ghosts[i];
            if (g.state !== 'roam' || gap(pl, g) > 0.55) continue;
            if (g.scared) eatGhost(s, g); else catchPlayer(s);
        }
    }

    // The fruit waits on the start tile. The second one of a level is a
    // heart: an extra life, which the dark core needs.
    function tickFruit(s, dt) {
        if (s.fruit <= 0) return;
        s.fruit -= dt;
        if (G.dist(s.pl.x, s.pl.y, s.start.x, s.start.y) > 0.6) return;
        var pts = 100 + 100 * s.level;
        s.fruit = 0;
        G.addScore(pts);
        if (s.fruitsOut === 2) G.addLife(5);
        G.popup(px(s.start.x), py(s.start.y) - 14, s.fruitsOut === 2 ? '1UP +' + pts : pts, C.pink);
        G.burst(px(s.start.x), py(s.start.y), { n: 14, color: C.pink, speed: 160 });
        G.sfx('coin');
        G.tone(1568, 0.25, { type: 'triangle', vol: 0.12, delay: 0.16 });
    }

    // The siren climbs as the dots run out; while the ghosts are blue it
    // turns into a warble that quickens when the power is about to end.
    function tickSiren(s, dt) {
        s.sirenT -= dt;
        if (s.sirenT > 0) return;
        if (s.fright > 0) {
            var ending = s.fright < 1.5;
            s.sirenT = ending ? 0.18 : 0.32;
            G.tone(ending ? 520 : 200, 0.14, { type: 'sine', slide: ending ? 260 : 400, vol: 0.07 });
            return;
        }
        var f = 300 + 520 * (1 - s.left / s.total);
        s.sirenT = 0.5;
        G.tone(f, 0.24, { type: 'sine', slide: f * 1.3, vol: 0.045 });
        G.tone(f * 1.3, 0.24, { type: 'sine', slide: f, vol: 0.045, delay: 0.25 });
    }

    function tickDying(s, dt) {
        s.dying -= dt;
        if (s.dying > 0) return;
        s.dying = 0;
        resetActors(s);
        s.ready = 1;
    }

    // In dark levels the lights come up while the ghosts are blue.
    function tickShade(s, dt) {
        var target = s.sight ? (s.fright > 0 || s.dying > 0 ? 0.3 : 1) : 0;
        s.shade += (target - s.shade) * Math.min(1, dt * 6);
    }

    function update(s, dt) {
        readInput(s);
        tickGates(s, dt);
        tickShade(s, dt);
        if (s.dying > 0) { tickDying(s, dt); return; }
        if (s.hold > 0) { s.hold -= dt; return; }
        if (s.ready > 0) { s.ready -= dt; return; }
        tickPhase(s, dt);
        movePlayer(s, dt);
        s.ghosts.forEach(function (g) { moveGhost(s, g, dt); });
        collide(s);
        tickFruit(s, dt);
        tickSiren(s, dt);
        if (!s.left) G.win(300 + 200 * G.lives + 50 * s.level);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    function px(x) { return x * T + T / 2; }
    function py(y) { return OY + y * T + T / 2; }

    function disc(ctx, x, y, r) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // An actor halfway through a tunnel is drawn at both ends of it.
    function eachCopy(e, fn) {
        fn(e.x, e.y);
        if (e.x < 0) fn(e.x + COLS, e.y);
        if (e.x > COLS - 1) fn(e.x - COLS, e.y);
        if (e.y < 0) fn(e.x, e.y + ROWS);
        if (e.y > ROWS - 1) fn(e.x, e.y - ROWS);
    }

    function paintWalls(s, ctx, hue) {
        var e = s.edges;
        ctx.fillStyle = C.fill;
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) if (s.grid[r][c] === '#') ctx.fillRect(c * T, OY + r * T, T, T);
        }
        ctx.strokeStyle = hue; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.shadowColor = hue; ctx.shadowBlur = 8;
        ctx.beginPath();
        for (var i = 0; i < e.length; i += 4) { ctx.moveTo(e[i], e[i + 1]); ctx.lineTo(e[i + 2], e[i + 3]); }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = C.pink;
        ctx.fillRect(15 * T + 2, OY + 6 * T + 12, 2 * T - 4, 5);
    }

    // The walls of a maze never move, and their glow (one blurred shadow
    // under every outline of the maze) is by far the dearest thing this game
    // draws. So they are painted once, into a picture as large as the game
    // canvas, and copied from there every frame. They are painted again
    // when the outline changes colour (a power pellet starts or stops
    // working), for another level's maze, and when the canvas changes size.
    function drawWalls(s, ctx) {
        var hue = s.fright > 0 ? C.fright : WALL_HUES[s.level - 1], w = ctx.canvas.width, h = ctx.canvas.height;
        var maze = s.walls, g;
        if (!maze || maze.hue !== hue || maze.w !== w || maze.h !== h) {
            maze = s.walls = { hue: hue, w: w, h: h, pic: maze ? maze.pic : document.createElement('canvas') };
            maze.pic.width = w; maze.pic.height = h;    // also wipes the old picture
            g = maze.pic.getContext('2d');
            g.setTransform(w / G.W, 0, 0, h / G.H, 0, 0);
            paintWalls(s, g, hue);
        }
        ctx.drawImage(maze.pic, 0, 0, G.W, G.H);
    }

    // A closed shutter is a solid bar; an open one leaves two posts, which
    // blink shortly before it shuts again.
    function drawGates(s, ctx) {
        s.gates.forEach(function (gate) {
            var x = px(gate.x), y = py(gate.y), left = GATE_OPEN - (s.gateT + gate.phase * GATE_PERIOD / 2) % GATE_PERIOD;
            var warn = gate.open && left < 0.7;
            var blink = Math.floor(G.t * 10) % 2 === 0;
            var len = gate.open ? (s.mobile && warn ? 8 : 5) : T / 2, far = T / 2;
            var thick = s.mobile ? 8 : 6, half = thick / 2;
            // Amber stays visible between pulses; white alone looked like dots.
            var warning = s.mobile ? (blink ? C.dot : C.peach) : (blink ? C.ink : C.muted);
            ctx.fillStyle = gate.open ? (warn ? warning : C.muted) : C.red;
            ctx.shadowColor = C.red; ctx.shadowBlur = gate.open ? 0 : 10;
            if (gate.upright) {
                ctx.fillRect(x - half, y - far, thick, len); ctx.fillRect(x - half, y + far - len, thick, len);
            } else {
                ctx.fillRect(x - far, y - half, len, thick); ctx.fillRect(x + far - len, y - half, len, thick);
            }
            ctx.shadowBlur = 0;
        });
    }

    function drawPad(ctx, x, y) {
        var pulse = (G.t * 1.6) % 1;
        ctx.strokeStyle = C.mint; ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - pulse;
        ctx.beginPath(); ctx.arc(x, y, 4 + pulse * 9, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.mint;
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 8); ctx.lineTo(x - 5, y + 1); ctx.lineTo(x, y + 1);
        ctx.lineTo(x - 2, y + 8); ctx.lineTo(x + 5, y - 1); ctx.lineTo(x, y - 1);
        ctx.closePath(); ctx.fill();
    }

    // Dots, pulsing power pellets and turbo pads. `onlyPower` is the pass
    // after the darkness, which keeps the power pellets findable (the
    // darkness passes false for the last few dots, so those show too).
    function drawPellets(s, ctx, onlyPower) {
        var big = 5.5 + 1.8 * Math.sin(G.t * 7);
        // One fill for all dots rather than hundreds of separate raster jobs.
        if (!onlyPower) {
            ctx.fillStyle = C.dot; ctx.beginPath();
            for (var y = 0; y < ROWS; y++) {
                for (var x = 0; x < COLS; x++) {
                    if (s.grid[y][x] === '.') ctx.rect(px(x) - 3, py(y) - 3, 6, 6);
                }
            }
            ctx.fill();
        }
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var ch = s.grid[r][c];
                ctx.fillStyle = C.dot;
                if (ch === 'o') {
                    ctx.shadowColor = C.dot; ctx.shadowBlur = 12;
                    disc(ctx, px(c), py(r), big);
                    ctx.shadowBlur = 0;
                }
                if (onlyPower) continue;
                if (ch === 'b') drawPad(ctx, px(c), py(r));
            }
        }
    }

    // Cherries first, then the heart that is worth a life.
    function drawFruit(s, ctx) {
        if (s.fruit <= 0 || (s.fruit < 2 && Math.floor(G.t * 8) % 2)) return;
        var x = px(s.start.x), y = py(s.start.y) + Math.sin(G.t * 5) * 2;
        ctx.shadowColor = C.pink; ctx.shadowBlur = 10;
        ctx.fillStyle = s.fruitsOut === 2 ? C.pink : C.red;
        disc(ctx, x - 4.5, y + 3 - (s.fruitsOut === 2 ? 5 : 0), 5.5);
        disc(ctx, x + 4.5, y + 4 - (s.fruitsOut === 2 ? 6 : 0), 5.5);
        ctx.shadowBlur = 0;
        if (s.fruitsOut === 2) {
            ctx.beginPath(); ctx.moveTo(x - 9.5, y); ctx.lineTo(x, y + 11); ctx.lineTo(x + 9.5, y); ctx.closePath(); ctx.fill();
            return;
        }
        ctx.strokeStyle = C.mint; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 3, y - 10); ctx.lineTo(x + 5, y); ctx.stroke();
    }

    function ghostBody(ctx, x, y, color, mobile) {
        var R = mobile ? 12.5 : 11, wob = Math.floor(G.t * 8) % 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y - 1, R, Math.PI, 0);
        ctx.lineTo(x + R, y + R);
        // The hem ripples by swapping which teeth hang down.
        for (var k = 1; k <= 6; k++) ctx.lineTo(x + R - k * R / 3, y + R - ((k + wob) % 2 ? 4 : 0));
        ctx.closePath(); ctx.fill();
    }

    // The pupils look where the ghost is going, which lets the player read it.
    function ghostEyes(ctx, x, y, g, mobile) {
        for (var i = -1; i <= 1; i += 2) {
            ctx.fillStyle = C.ink;
            disc(ctx, x + i * 4.5 + g.dx * 1.5, y - 3 + g.dy * 1.5, mobile ? 4.2 : 3.6);
            ctx.fillStyle = C.night;
            disc(ctx, x + i * 4.5 + g.dx * 3, y - 3 + g.dy * 3, mobile ? 2.2 : 1.8);
        }
    }

    function scaredFace(ctx, x, y, pale) {
        ctx.fillStyle = pale ? C.red : C.ink;
        ctx.fillRect(x - 6, y - 5, 3, 3); ctx.fillRect(x + 3, y - 5, 3, 3);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 7, y + 5);
        for (var k = 1; k <= 4; k++) ctx.lineTo(x - 7 + k * 3.5, y + 5 - (k % 2 ? 3 : 0));
        ctx.stroke();
    }

    function drawGhost(s, ctx, g, x, y) {
        var X = px(x), Y = py(y);
        if (g.state === 'eyes') { ghostEyes(ctx, X, Y, g, s.mobile); return; }
        if (!g.scared) { ghostBody(ctx, X, Y, g.color, s.mobile); ghostEyes(ctx, X, Y, g, s.mobile); return; }
        // Blue ghosts flash white when the power is about to run out.
        var pale = s.fright < 1.5 && Math.floor(G.t * 8) % 2 === 0;
        ghostBody(ctx, X, Y, pale ? C.ink : C.scared, s.mobile);
        scaredFace(ctx, X, Y, pale);
    }

    function drawGhosts(s, ctx) {
        if (s.dying > 0) return;
        s.ghosts.forEach(function (g) {
            eachCopy(g, function (x, y) { drawGhost(s, ctx, g, x, y); });
        });
    }

    function drawPac(s, ctx) {
        var pl = s.pl, moving = pl.dx || pl.dy;
        // The mouth keeps working even at rest, and opens all the way round
        // when the player is caught.
        var m = s.dying > 0 ? Math.PI * (1 - s.dying / DYING) : 0.06 + 0.3 * Math.abs(Math.sin(G.t * (moving ? 14 : 4)));
        ctx.fillStyle = s.boost > 0 ? C.mint : C.dot;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
        eachCopy(pl, function (x, y) {
            ctx.beginPath();
            ctx.moveTo(px(x), py(y));
            ctx.arc(px(x), py(y), s.mobile ? 12.5 : 11, pl.face + m, pl.face - m + Math.PI * 2);
            ctx.closePath(); ctx.fill();
        });
        ctx.shadowBlur = 0;
    }

    // Darkness with a hole of light around the player. Ghost eyes (on a
    // halo in the ghost's colour, so they also read on a small phone
    // screen), power pellets and the fruit still glow through it, and so do
    // the last few dots: that keeps a dark level a matter of reading the
    // maze, not of luck or of searching blind for one missed dot.
    function drawDark(s, ctx) {
        if (s.shade < 0.02) return;
        var x = px(s.pl.x), y = py(s.pl.y);
        var grad = ctx.createRadialGradient(x, y, s.sight * 0.5, x, y, s.sight);
        grad.addColorStop(0, 'rgba(3,5,29,0)');
        grad.addColorStop(1, 'rgba(3,5,29,' + (0.97 * s.shade).toFixed(3) + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(0, OY, G.W, G.H - OY);
        drawPellets(s, ctx, s.left > LAST_DOTS);
        drawFruit(s, ctx);
        // A phone must still show whether a shutter is open or closing.
        // Darkness continues to hide the walls and ordinary dots.
        if (s.mobile) drawGates(s, ctx);
        if (s.dying > 0) return;
        s.ghosts.forEach(function (g) {
            if (g.scared) return;
            ctx.fillStyle = g.color; ctx.globalAlpha = 0.3 * s.shade;
            disc(ctx, px(g.x), py(g.y), 11);
            ctx.globalAlpha = 1;
            ctx.shadowColor = g.color; ctx.shadowBlur = 10;
            ghostEyes(ctx, px(g.x), py(g.y), g, s.mobile);
            ctx.shadowBlur = 0;
        });
    }

    function draw(s, ctx) {
        ctx.fillStyle = C.night;
        ctx.fillRect(0, 0, G.W, G.H);
        // Clipped so that nobody in a vertical warp is drawn over the HUD.
        ctx.save();
        ctx.beginPath(); ctx.rect(0, OY, G.W, G.H - OY); ctx.clip();
        drawWalls(s, ctx);
        drawGates(s, ctx);
        drawPellets(s, ctx, false);
        drawFruit(s, ctx);
        drawGhosts(s, ctx);
        drawPac(s, ctx);
        drawDark(s, ctx);
        ctx.restore();
        if (s.ready > 0 && !s.dying) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 12);
            G.text('READY!', G.W / 2, py(9) + 7, { size: 22, bold: true, color: C.dot, align: 'center', glow: C.dot });
            ctx.globalAlpha = 1;
        }
    }

    // ------------------------------------------------------------------
    // The ending: the core lights up
    // ------------------------------------------------------------------

    // The wall outlines of the last maze, built once into the scene's data.
    // A ring of light spreads from the ghost house and keeps returning, each
    // ring in the next wall colour, so the maze pulses like a neon sign.
    function drawLitMaze(e, ctx) {
        if (!e.data.edges) {
            var m = { grid: buildGrid(LEVELS.length), edges: [] };
            buildEdges(m);
            e.data.edges = m.edges;
        }
        var ed = e.data.edges, cx = G.W / 2, cy = py(7);
        ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (var i = 0; i < ed.length; i += 4) {
            var d = Math.hypot(ed[i] - cx, ed[i + 1] - cy), wave = e.t * 260 - d;
            if (wave < 0) continue;
            var ring = Math.floor(wave / 180);
            ctx.globalAlpha = 0.35 + 0.5 * Math.max(0, 1 - (wave % 180) / 120);
            ctx.strokeStyle = WALL_HUES[ring % WALL_HUES.length];
            ctx.beginPath(); ctx.moveTo(ed[i], ed[i + 1]); ctx.lineTo(ed[i + 2], ed[i + 3]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // Pac runs along the top eating a line of dots, four blue ghosts
    // fleeing just ahead of him; the run loops across the screen.
    function drawChase(e, ctx) {
        var y = 70, x = (e.t * 170) % (G.W + 360) - 60, m = 0.06 + 0.3 * Math.abs(Math.sin(e.t * 14));
        ctx.fillStyle = C.dot;
        for (var d = 30; d < G.W; d += 40) if (d > x) disc(ctx, d, y, 3);
        for (var k = 0; k < 4; k++) {
            var gx = x + 70 + k * 40;
            ghostBody(ctx, gx, y, C.scared, false);
            scaredFace(ctx, gx, y, false);
        }
        ctx.fillStyle = C.dot; ctx.shadowColor = C.dot; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 13, m, Math.PI * 2 - m); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
    }

    function drawEnding(e, ctx) {
        drawLitMaze(e, ctx);
        drawChase(e, ctx);
    }

    function hud(s) {
        return 'DOTS ' + s.left + (s.fright > 0 ? '  POWER ' + s.fright.toFixed(1) : '');
    }

    G.register('pacmaze', {
        title: 'NEON MAZE',
        blurb: 'Eat every dot. Stay away from the ghosts, unless they are blue.',
        controls: [
            '← ↑ → ↓ / WASD / touch pad: steer (turns are remembered, reversing works anywhere)',
            'Power pellets turn the ghosts blue: eat them for 200, 400, 800, 1600',
            'Tunnels wrap round · fruit appears on your start tile, the second is an extra life',
            'Later: red shutters open and close, lightning pads give a burst of speed'
        ],
        levelNames: ['First Bite', 'Gatecrash', 'Neon Core'],
        colors: { bg: C.night, fg: C.ink, accent: C.dot, dim: C.muted },
        lives: 4,
        // A bouncy C-major arcade tune: eight bars over I I IV V I vi IV V,
        // the lead outlining each chord.
        music: {
            bpm: 132, root: 48, scale: 'major', prog: [0, 0, 3, 4, 0, 5, 3, 4],
            bass: 'x.o.x.o.x.5.x.o.',
            lead: [
                '0.2.4.7.4.2.4...', '7.9.b.9.7.4.2.4.', '3.5.7.5.a.7.5.3.', '4.6.8.6.b-8-4...',
                '9.7.4.7.9.b.9.7.', '5.7.9.c.9-7-5...', 'a.7.5.3.5.7.a.7.', 'b.8.6.4.6-8-b-..'
            ],
            arp: '0.2.1.3.', drums: { k: 'x.....x.x.......', s: '....x.......x...', h: '..x...x...x...x.' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOct: 1
        },
        ending: {
            title: 'MAZE CLEARED',
            text: 'The core is dark no more. Every ghost runs blue.',
            colors: [C.dot, C.pink, C.mint, C.lilac, '#168cff'],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud,
        // Steering is all there is: one direction at a time (a thumb a little
        // off axis must not hold two), and no action buttons.
        touch: { dirs: 4, hide: ['a', 'b'] }
    });
})();
