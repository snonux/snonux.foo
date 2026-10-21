/*
 * SERPENT.GB — the dmg theme's game: a snake on the four-shade pea-green LCD
 * of an original Game Boy.
 *
 * The snake glides from cell to cell instead of hopping: its speed eases
 * towards a target (boost with A, faster still on ice), turns are buffered
 * and taken at the next cell centre, and a turn pressed just after a centre
 * still counts. Every apple makes it one cell longer; eat the level's quota.
 * Walls, rocks, your own body and the rival's body end a life (the apples
 * already eaten are kept). Level 2 adds wrap-around tunnels and ice lanes on
 * which the snake slides on and cannot turn; level 3 adds a rival snake
 * that races you for the apples and bursts into apples when it runs into
 * your body.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 30, COLS = 32, ROWS = 17, OY = 30;
    var C = { ink: '#0f380f', dark: '#306230', mid: '#8bac0f', paper: '#9bbc0f' };
    var SHADE = [C.ink, C.dark, C.mid, C.paper];
    var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], KEYS = ['up', 'right', 'down', 'left'];
    var EMPTY = 0, WALL = 1, ROCK = 2, ICE = 3;
    var BOOST = 1.6, ICE_SPEED = 1.35, GRACE = 0.2, CRASH_P = 0.3;

    // Level 2: a cartridge board — contact pins along the top and bottom,
    // two solid chips with an ice slot through them, bracket chips in the
    // middle, ice lanes across, tunnels through all four edges. Written as the
    // top-left quarter; the rest is mirrored.
    var MAZE = [
        '###############.',
        '#...............',
        '#.##.#.#.#.##...',
        '#...............',
        '#..####....~~~~~',
        '#..####.........',
        '#..####..###....',
        '#..####..#......',
        '...~~~~..#......'
    ];
    // Level 3: an arena with four pillars and two bars, the rival's link
    // port in the right wall.
    var ARENA = [
        '################',
        '#...............',
        '#...............',
        '#...##..........',
        '#...##..........',
        '#...............',
        '#.........#.....',
        '#.........#.....',
        '#.........#.....'
    ];

    var CFG = [
        { quota: 12, apples: 2, speed: 5.4, start: [6, 8, 1], tip: 'Arrows steer · hold SPACE / A to boost' },
        { quota: 14, apples: 2, speed: 5.8, start: [8, 13, 1], map: MAZE, tip: 'Ice: no turning until you leave it · edges wrap' },
        { quota: 18, apples: 3, speed: 6.2, start: [6, 14, 1], map: ARENA, rival: 5.0, tip: 'Make the rival bite your tail: it bursts into apples' }
    ];
    var PORT = { x: 31, y: 8 };

    // 10x10 bitmaps, one character per LCD pixel: 0-3 are the four shades
    // (ink to paper), '.' is transparent.
    var APPLE = ['.....1.11.', '.....111..', '..000.000.', '.00000000.', '0330000000',
        '0300000000', '0000000000', '.00000000.', '.00000000.', '..00..00..'];
    var ROCK_BITS = ['...0000...', '..022220..', '.02232210.', '0223222210', '0222221210',
        '0221222110', '0222212110', '.01111110.', '..000000..', '..........'];
    var TROPHY = ['.3333333333.', '332222222233', '3.22222222.3', '3.21222222.3', '.3.212222.3.',
        '..3.2222.3..', '...32223....', '....322.....', '....323.....', '...32223....',
        '..3222222...', '..2111111...', '..2222222...', '.333333333..'];

    // ---------------------------------------------------------------- maps

    function mirrorMap(quarter) {
        var top = quarter.map(function (h) { return h + h.split('').reverse().join(''); });
        return top.concat(top.slice(0, ROWS - top.length).reverse());
    }

    function parseMap(rows) {
        var g = [], codes = { '#': WALL, '~': ICE, 'o': ROCK };
        rows.forEach(function (row) {
            for (var x = 0; x < COLS; x++) g.push(codes[row.charAt(x)] || EMPTY);
        });
        return g;
    }

    function rockNear(g, x, y) {
        for (var j = -1; j <= 1; j++) {
            for (var i = -1; i <= 1; i++) if (g[(y + j) * COLS + x + i] === ROCK) return true;
        }
        return false;
    }

    // The garden: a hedge all round and a few single boulders, never two
    // touching (so no pocket can close) and never on the two rings inside the
    // hedge or in the start lane. Seeded, so it is the same on every visit.
    function gardenGrid() {
        var g = [], r = G.rng(1989), placed = 0, tries = 0;
        for (var i = 0; i < COLS * ROWS; i++) {
            var x0 = i % COLS, y0 = Math.floor(i / COLS);
            g.push(x0 === 0 || y0 === 0 || x0 === COLS - 1 || y0 === ROWS - 1 ? WALL : EMPTY);
        }
        while (placed < 11 && tries++ < 600) {
            var x = 3 + Math.floor(r() * (COLS - 6)), y = 3 + Math.floor(r() * (ROWS - 6));
            if ((Math.abs(y - 8) <= 1 && x < 13) || rockNear(g, x, y)) continue;
            g[y * COLS + x] = ROCK;
            placed++;
        }
        return g;
    }

    function wrapX(x) { return (x + COLS) % COLS; }
    function wrapY(y) { return (y + ROWS) % ROWS; }
    function idx(x, y) { return wrapY(y) * COLS + wrapX(x); }
    function tile(s, x, y) { return s.grid[idx(x, y)]; }
    function solid(s, x, y) { var t = tile(s, x, y); return t === WALL || t === ROCK; }

    // --------------------------------------------------------------- state

    function newSnake(x, y, d, len, speed) {
        var body = [];
        for (var i = 0; i < len; i++) body.push({ x: wrapX(x - DX[d] * i), y: wrapY(y - DY[d] * i) });
        return { body: body, d: d, came: d, p: 0, v: speed * 0.5, q: [], grow: 0, dead: 0, ghost: [], gt: 0 };
    }

    function spawnRival(s) {
        s.rv = newSnake(PORT.x - 4, PORT.y, 3, 4, s.cfg.rival);
        s.rv.wait = 0;
    }

    function init(level) {
        var cfg = CFG[level - 1], st = cfg.start;
        var s = {
            level: level, cfg: cfg, touch: G.isTouch(), time: 0, ready: 0.8, eaten: 0, quota: cfg.quota,
            grid: cfg.map ? parseMap(mirrorMap(cfg.map)) : gardenGrid(),
            sn: newSnake(st[0], st[1], st[2], 4, cfg.speed), rv: null, apples: [],
            boostT: 0, kills: 0, stats: { ice: 0, wraps: 0, kills: 0, stolen: 0 }, glitch: 0
        };
        if (cfg.rival) spawnRival(s);
        s.leds = level === 2 ? ledCells(s) : [];
        var r = G.rng(level * 71 + 5);
        while (s.apples.length < cfg.apples) placeApple(s, r, 'red');
        return s;
    }

    // A few wall cells of the cartridge carry a blinking pixel LED.
    function ledCells(s) {
        var r = G.rng(64), out = [];
        for (var i = 0; i < s.grid.length && out.length < 14; i++) {
            var x = i % COLS, y = Math.floor(i / COLS);
            if (s.grid[i] === WALL && x > 1 && x < COLS - 2 && y > 1 && y < ROWS - 2 && r() < 0.3) out.push({ x: x, y: y, ph: r() * 6 });
        }
        return out;
    }

    function occupied(sn, x, y, from, to) {
        if (!sn) return false;
        var b = sn.body, end = to == null ? b.length : to;
        for (var i = from || 0; i < end; i++) if (b[i].x === x && b[i].y === y) return true;
        return false;
    }

    function appleAt(s, x, y) {
        for (var i = 0; i < s.apples.length; i++) if (s.apples[i].x === x && s.apples[i].y === y) return i;
        return -1;
    }

    function openSides(s, x, y) {
        var n = 0;
        for (var d = 0; d < 4; d++) if (!solid(s, x + DX[d], y + DY[d])) n++;
        return n;
    }

    // Apples grow on plain ground inside the border, away from the snake's
    // head, never on ice (a slide could not stop on them) and never in a
    // dead end.
    function appleSpot(s, x, y) {
        if (x < 1 || y < 1 || x > COLS - 2 || y > ROWS - 2 || tile(s, x, y) !== EMPTY) return false;
        var h = s.sn.body[0];
        if (Math.abs(h.x - x) + Math.abs(h.y - y) < 4 || openSides(s, x, y) < 2) return false;
        return appleAt(s, x, y) < 0 && !occupied(s.sn, x, y) && !occupied(s.rv, x, y);
    }

    function placeApple(s, rand, kind) {
        for (var k = 0; k < 400; k++) {
            var x = 1 + Math.floor(rand() * (COLS - 2)), y = 1 + Math.floor(rand() * (ROWS - 2));
            if (appleSpot(s, x, y)) { s.apples.push({ x: x, y: y, kind: kind, t: 0 }); return true; }
        }
        return false;
    }

    // -------------------------------------------------------------- input

    function reverseOf(d) { return (d + 2) % 4; }

    // Presses queue up (two at most) and are taken at the next cell centre;
    // one pressed just after a centre turns the snake there and then.
    function readInput(s) {
        var sn = s.sn;
        for (var k = 0; k < 4; k++) {
            if (!G.hit[KEYS[k]]) continue;
            var last = sn.q.length ? sn.q[sn.q.length - 1] : sn.d;
            if (k !== last && k !== reverseOf(last) && sn.q.length < 2) sn.q.push(k);
        }
        var here = sn.body[0];
        if (sn.q.length && sn.p < GRACE && sn.d === sn.came && tile(s, here.x, here.y) !== ICE) {
            var t = sn.q[0];
            if (t !== sn.d && t !== reverseOf(sn.came)) { sn.q.shift(); sn.d = t; turnSound(); }
        }
    }

    function heldTurn(d) {
        for (var k = 0; k < 4; k++) if (G.key[KEYS[k]] && k !== d && k !== reverseOf(d)) return k;
        return -1;
    }

    // The player's choice at a cell centre. On ice nothing is taken: the
    // snake slides on and the queued turn waits for solid ground.
    function playerTurn(s, sn) {
        var h = sn.body[0];
        sn.came = sn.d;
        if (tile(s, h.x, h.y) === ICE) return;
        while (sn.q.length) {
            var d = sn.q.shift();
            if (d !== sn.d && d !== reverseOf(sn.d)) { sn.d = d; turnSound(); return; }
        }
        var held = heldTurn(sn.d);
        if (held >= 0) { sn.d = held; turnSound(); }
    }

    // ------------------------------------------------------------ movement

    // What a head moving into (x, y) would hit: a wall or rock, its own body
    // (the tail cell moves away unless the snake is growing), or the other
    // snake.
    function hazard(s, sn, other, x, y) {
        if (solid(s, x, y)) return 'wall';
        var keep = sn.grow > 0 ? sn.body.length : sn.body.length - 1;
        if (occupied(sn, x, y, 0, keep)) return 'self';
        if (other && !other.wait && occupied(other, x, y)) return other.body[0].x === x && other.body[0].y === y ? 'head' : 'body';
        return null;
    }

    // Speed eases towards its target, so a boost or an ice lane builds up
    // and dies away instead of switching: the snake has momentum.
    function moveSnake(s, sn, target, dt, arrive) {
        sn.v += (target - sn.v) * Math.min(1, dt * 2.6);
        sn.p += sn.v * dt;
        sn.gt -= dt;
        if (sn.gt <= 0) {
            sn.gt = 0.05;
            sn.ghost.unshift(headPos(sn));
            if (sn.ghost.length > 4) sn.ghost.pop();
        }
        while (sn.p >= 1 && !sn.dead) { sn.p -= 1; arrive(s, sn); }
    }

    function advance(sn, nx, ny) {
        sn.body.unshift({ x: nx, y: ny });
        if (sn.grow > 0) sn.grow--; else sn.body.pop();
    }

    function playerArrive(s, sn) {
        var h = sn.body[0], nx = wrapX(h.x + DX[sn.d]), ny = wrapY(h.y + DY[sn.d]);
        var hit = hazard(s, sn, s.rv, nx, ny);
        if (hit === 'head') { killRival(s, 'head'); hit = null; }
        if (hit) { crash(s, sn, hit); return; }
        var wasIce = tile(s, h.x, h.y) === ICE;
        if (Math.abs(nx - h.x) > 1 || Math.abs(ny - h.y) > 1) { s.stats.wraps++; G.tone(300, 0.16, { type: 'square', slide: 1200, vol: 0.06 }); }
        advance(sn, nx, ny);
        if (tile(s, nx, ny) === ICE && !wasIce) { s.stats.ice++; G.tone(1100, 0.2, { type: 'triangle', slide: 1900, vol: 0.06 }); }
        eat(s, sn, nx, ny, true);
        playerTurn(s, sn);
    }

    function crash(s, sn, why) {
        sn.dead = 1;
        sn.p = CRASH_P;
        var hp = headPos(sn);
        G.burst(hp.x, hp.y, { n: 18, color: C.ink, speed: 200, life: 0.6, size: 5 });
        G.shake(7, 0.35);
        G.flash(C.paper, 0.25);
        G.noise(0.4, { vol: 0.3, freq: 900, filter: 'lowpass', slide: 120 });
        G.tone(420, 0.35, { type: 'square', slide: 55, vol: 0.12 });
        if (why === 'body') G.popup(hp.x, hp.y - 24, 'BITTEN', C.ink);
    }

    function eat(s, sn, x, y, mine) {
        var i = appleAt(s, x, y);
        if (i < 0) return;
        var a = s.apples.splice(i, 1)[0], px = x * T + T / 2, py = OY + y * T + T / 2;
        sn.grow++;
        if (mine) {
            s.eaten++;
            G.addScore(a.kind === 'gold' ? 80 : 50 * s.level);
            G.burst(px, py, { n: 10, color: C.dark, speed: 140, life: 0.4, size: 4 });
            G.tone(660 + s.eaten * 18, 0.06, { type: 'square', vol: 0.12 });
            G.tone(990 + s.eaten * 18, 0.08, { type: 'square', vol: 0.1, delay: 0.06 });
            if (s.eaten === s.quota - 1) G.sfx('power');
        } else {
            s.stats.stolen++;
            G.popup(px, py - 20, 'STOLEN', C.dark);
            G.tone(170, 0.12, { type: 'square', slide: 105, vol: 0.1 });
        }
        if (a.kind === 'red') placeApple(s, Math.random, 'red');
    }

    function turnSound() { G.tone(240, 0.025, { type: 'square', vol: 0.035 }); }

    function headPos(sn) {
        var h = sn.body[0];
        return { x: (h.x + DX[sn.d] * sn.p) * T + T / 2, y: OY + (h.y + DY[sn.d] * sn.p) * T + T / 2 };
    }

    // -------------------------------------------------------------- rival

    // Breadth-first over open cells from the rival's head to the nearest
    // apple, steering round walls, its own body and the player. It plans
    // only one cell ahead, so a player who rings it in can trap it.
    function rivalChoice(s, rv) {
        var h = rv.body[0], from = [], seen = {}, queue = [idx(h.x, h.y)], n = 0;
        seen[queue[0]] = true;
        while (n < queue.length) {
            var at = queue[n++], x = at % COLS, y = Math.floor(at / COLS);
            if (n > 1 && appleAt(s, x, y) >= 0) return firstStep(from, at, queue[0]);
            for (var d = 0; d < 4; d++) {
                var nx = wrapX(x + DX[d]), ny = wrapY(y + DY[d]), to = ny * COLS + nx;
                if (seen[to] || (n === 1 && d === reverseOf(rv.d)) || hazard(s, rv, s.sn, nx, ny)) continue;
                seen[to] = true; from[to] = { at: at, d: d }; queue.push(to);
            }
        }
        return roomiest(s, rv);
    }

    function firstStep(from, at, start) {
        var d = -1;
        while (at !== start) { d = from[at].d; at = from[at].at; }
        return d;
    }

    // No apple in reach: the neighbour with the most room around it.
    function roomiest(s, rv) {
        var h = rv.body[0], best = rv.d, most = -1;
        for (var d = 0; d < 4; d++) {
            if (d === reverseOf(rv.d)) continue;
            var nx = wrapX(h.x + DX[d]), ny = wrapY(h.y + DY[d]);
            if (hazard(s, rv, s.sn, nx, ny)) continue;
            var room = floodSize(s, rv, nx, ny, 60);
            if (room > most) { most = room; best = d; }
        }
        return best;
    }

    function floodSize(s, rv, x0, y0, cap) {
        var seen = {}, queue = [idx(x0, y0)], n = 0;
        seen[queue[0]] = true;
        while (n < queue.length && queue.length < cap) {
            var at = queue[n++], x = at % COLS, y = Math.floor(at / COLS);
            for (var d = 0; d < 4; d++) {
                var nx = wrapX(x + DX[d]), ny = wrapY(y + DY[d]), to = ny * COLS + nx;
                if (seen[to] || hazard(s, rv, s.sn, nx, ny)) continue;
                seen[to] = true; queue.push(to);
            }
        }
        return queue.length;
    }

    function rivalArrive(s, rv) {
        var h = rv.body[0], nx = wrapX(h.x + DX[rv.d]), ny = wrapY(h.y + DY[rv.d]);
        var hit = hazard(s, rv, s.sn, nx, ny);
        if (hit) { killRival(s, hit); return; }
        advance(rv, nx, ny);
        eat(s, rv, nx, ny, false);
        // Now and then it fumbles a turn, like any rival worth beating.
        rv.d = Math.random() < 0.07 ? G.pick([rv.d, (rv.d + 1) % 4, (rv.d + 3) % 4]) : rivalChoice(s, rv);
    }

    // The rival bursts into golden apples (every other segment) and plugs
    // back in through its link port a few seconds later.
    function killRival(s, why) {
        var rv = s.rv;
        if (!rv || rv.wait) return;
        rv.body.forEach(function (b, i) {
            if (i % 2 === 0 && !solid(s, b.x, b.y) && appleAt(s, b.x, b.y) < 0 && !occupied(s.sn, b.x, b.y)) s.apples.push({ x: b.x, y: b.y, kind: 'gold', t: 0 });
        });
        var hp = headPos(rv);
        G.burst(hp.x, hp.y, { n: 26, color: C.dark, speed: 260, life: 0.7, size: 5 });
        G.popup(hp.x, hp.y - 24, why === 'wall' || why === 'self' ? 'CRASHED' : 'TRAPPED +300', C.ink);
        G.addScore(why === 'wall' || why === 'self' ? 100 : 300);
        G.shake(5, 0.3);
        [880, 660, 440, 220].forEach(function (f, i) { G.tone(f, 0.09, { type: 'square', vol: 0.1, delay: i * 0.07 }); });
        G.noise(0.3, { vol: 0.18, freq: 1800, filter: 'bandpass', delay: 0.1 });
        s.stats.kills++;
        rv.wait = 5;
        rv.p = 0;
        rv.body = [];
    }

    function updateRival(s, dt) {
        var rv = s.rv;
        if (!rv) return;
        if (rv.wait) {
            rv.wait = Math.max(0, rv.wait - dt);
            s.glitch = rv.wait < 1.4 ? 1 : 0;
            if (rv.wait === 0) plugIn(s);
            return;
        }
        moveSnake(s, rv, s.cfg.rival + Math.min(0.8, rv.body.length * 0.03), dt, rivalArrive);
    }

    // Plugs back in only when the port lane is clear of the player.
    function plugIn(s) {
        for (var i = 1; i <= 5; i++) {
            if (occupied(s.sn, PORT.x - i, PORT.y)) { s.rv.wait = 0.5; return; }
        }
        spawnRival(s);
        s.glitch = 0;
        G.tone(1320, 0.05, { type: 'square', vol: 0.08 });
        G.tone(1760, 0.05, { type: 'square', vol: 0.08, delay: 0.07 });
        G.tone(990, 0.08, { type: 'square', vol: 0.08, delay: 0.14 });
    }

    // ------------------------------------------------------------- update

    function playerTarget(s, sn) {
        var h = sn.body[0], boost = G.key.a ? BOOST : 1;
        var ice = tile(s, h.x, h.y) === ICE || tile(s, h.x + DX[sn.d], h.y + DY[sn.d]) === ICE;
        return s.cfg.speed * boost * (ice ? ICE_SPEED : 1);
    }

    function boostFx(s, sn, dt) {
        s.boostT -= dt;
        if (!G.key.a || s.boostT > 0) return;
        s.boostT = 0.22;
        var t = sn.body[sn.body.length - 1];
        G.burst(t.x * T + T / 2, OY + t.y * T + T / 2, { n: 3, color: C.mid, speed: 60, life: 0.35, size: 4 });
        G.noise(0.12, { filter: 'bandpass', freq: 2600, vol: 0.04 });
    }

    // A crashed snake lies still for a moment; then a life goes and a fresh
    // snake waits at the start (the apples eaten so far are kept).
    function updateCrash(s, sn, dt) {
        sn.dead += dt;
        if (sn.dead < 0.9) return;
        if (G.loseLife() <= 0) return;
        var st = s.cfg.start;
        s.sn = newSnake(st[0], st[1], st[2], 4, s.cfg.speed);
        s.ready = 1;
        s.apples = s.apples.filter(function (a) { return !occupied(s.sn, a.x, a.y); });
    }

    function update(s, dt) {
        s.time += dt;
        s.apples.forEach(function (a) { a.t += dt; });
        updateRival(s, dt);
        var sn = s.sn;
        if (sn.dead) { updateCrash(s, sn, dt); return; }
        if (s.ready > 0) { s.ready -= dt; return; }
        readInput(s);
        moveSnake(s, sn, playerTarget(s, sn), dt, playerArrive);
        boostFx(s, sn, dt);
        while (s.apples.length < s.cfg.apples && placeApple(s, Math.random, 'red')) { /* refill */ }
        if (s.eaten >= s.quota) G.win(400 + G.lives * 200 + Math.max(0, Math.round(150 - s.time)) * 4);
    }

    // --------------------------------------------------------------- draw

    // Draws a bitmap with one fillRect per run of equal pixels in a row.
    function bits(ctx, rows, x, y, px, map) {
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r], c = 0;
            while (c < row.length) {
                var ch = row.charAt(c), e = c + 1;
                while (e < row.length && row.charAt(e) === ch) e++;
                if (ch !== '.') { ctx.fillStyle = (map || SHADE)[+ch]; ctx.fillRect(x + c * px, y + r * px, (e - c) * px, px); }
                c = e;
            }
        }
    }

    function cellX(x) { return x * T; }
    function cellY(y) { return OY + y * T; }

    function paintWall(s, g, x, y) {
        var px = cellX(x), py = cellY(y);
        g.fillStyle = C.dark; g.fillRect(px, py, T, T);
        g.fillStyle = C.ink;
        if (s.level === 1) {
            // Hedge: leaf pixels in a scattered pattern.
            for (var k = 0; k < 5; k++) g.fillRect(px + ((x * 7 + k * 11) % 24) + 1, py + ((y * 5 + k * 13) % 24) + 1, 5, 5);
        } else if (s.level === 2) {
            // Cartridge plastic: a ridged block with a lit top edge.
            g.fillRect(px, py + T - 4, T, 4); g.fillRect(px + T - 4, py, 4, T);
            g.fillStyle = C.mid; g.fillRect(px + 3, py + 3, T - 10, 3);
        } else {
            // Brick: mortar lines offset on every other row.
            g.fillRect(px, py + 14, T, 2); g.fillRect(px, py + T - 2, T, 2);
            g.fillRect(px + (y % 2 ? 8 : 22), py, 2, 14); g.fillRect(px + (y % 2 ? 22 : 8), py + 16, 2, 12);
        }
    }

    function paintIce(g, x, y) {
        var px = cellX(x), py = cellY(y);
        g.fillStyle = C.mid; g.fillRect(px, py, T, T);
        g.fillStyle = C.paper;
        for (var k = 0; k < 3; k++) g.fillRect(px + 4 + k * 3, py + 18 - k * 6, 9, 3);
        g.fillStyle = C.dark;
        g.fillRect(px, py, 3, 3); g.fillRect(px + T - 3, py + T - 3, 3, 3);
    }

    // Ground texture: grass tufts, circuit traces or a checkered floor.
    function paintFloor(s, g, x, y) {
        var px = cellX(x), py = cellY(y), h = (x * 31 + y * 17) % 7;
        g.fillStyle = C.mid;
        if (s.level === 1 && h < 2) { g.fillRect(px + 8 + h * 6, py + 18, 3, 6); g.fillRect(px + 12 + h * 6, py + 15, 3, 9); }
        else if (s.level === 2 && h === 0) { g.fillRect(px, py + 14, T, 2); g.fillRect(px + 13, py + 11, 6, 6); }
        else if (s.level === 3 && (x + y) % 2 === 0) g.fillRect(px + 13, py + 13, 4, 4);
    }

    function paintField(s, g) {
        g.fillStyle = C.ink; g.fillRect(0, 0, G.W, OY);
        g.fillStyle = C.paper; g.fillRect(0, OY, G.W, G.H - OY);
        for (var i = 0; i < s.grid.length; i++) {
            var x = i % COLS, y = Math.floor(i / COLS), t = s.grid[i];
            if (t === WALL) paintWall(s, g, x, y);
            else if (t === ICE) paintIce(g, x, y);
            else if (t === ROCK) bits(g, ROCK_BITS, cellX(x), cellY(y), 3);
            else paintFloor(s, g, x, y);
            // Tunnel mouths: dashed arrows out through the edge.
            if (t !== WALL && (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1)) {
                g.fillStyle = C.dark;
                for (var k = 0; k < 3; k++) g.fillRect(cellX(x) + (x % (COLS - 1) ? 6 + k * 8 : 12), cellY(y) + (x % (COLS - 1) ? 12 : 6 + k * 8), 6, 6);
            }
        }
    }

    // The board never changes within a level, so it is painted once into a
    // canvas-sized picture (again when the canvas is resized) and blitted.
    function drawField(s, ctx) {
        var w = ctx.canvas.width, h = ctx.canvas.height, f = s.pic;
        if (!f || f.w !== w || f.h !== h) {
            f = s.pic = { w: w, h: h, pic: f ? f.pic : document.createElement('canvas') };
            f.pic.width = w; f.pic.height = h;
            var g = f.pic.getContext('2d');
            g.setTransform(w / G.W, 0, 0, h / G.H, 0, 0);
            paintField(s, g);
        }
        ctx.drawImage(f.pic, 0, 0, G.W, G.H);
    }

    // The LCD's dot grid: a 3x3 tile with a dark gap line, laid over the
    // whole screen as one pattern fill.
    function drawPixelGrid(s, ctx) {
        if (!s.lcd) {
            var c = document.createElement('canvas');
            c.width = 3; c.height = 3;
            var g = c.getContext('2d');
            g.fillStyle = C.ink; g.fillRect(0, 2, 3, 1); g.fillRect(2, 0, 1, 3);
            s.lcd = ctx.createPattern(c, 'repeat');
        }
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = s.lcd;
        ctx.fillRect(0, OY, G.W, G.H - OY);
        ctx.globalAlpha = 1;
    }

    // Cloud shadows drift over the garden.
    function drawClouds(s, ctx) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = C.mid;
        for (var i = 0; i < 3; i++) {
            var x = ((i * 380 + 900 - s.time * (14 + i * 5)) % 1200 + 1200) % 1200 - 160, y = 90 + i * 150;
            ctx.fillRect(x, y, 120, 24); ctx.fillRect(x + 24, y - 15, 66, 15); ctx.fillRect(x + 15, y + 24, 84, 12);
        }
        ctx.globalAlpha = 1;
    }

    function drawLeds(s, ctx) {
        s.leds.forEach(function (l) {
            ctx.fillStyle = Math.sin(s.time * 3 + l.ph) > 0.2 ? C.paper : C.ink;
            ctx.fillRect(cellX(l.x) + 18, cellY(l.y) + 10, 6, 6);
        });
    }

    // The link port: a socket in the right wall, glitching while the rival
    // is about to plug back in.
    function drawPort(s, ctx) {
        var px = cellX(PORT.x), py = cellY(PORT.y), on = s.rv && s.rv.wait > 0;
        ctx.fillStyle = C.ink; ctx.fillRect(px + 2, py - 6, T - 4, T + 12);
        ctx.fillStyle = on && Math.floor(s.time * 8) % 2 ? C.paper : C.mid;
        for (var k = 0; k < 3; k++) ctx.fillRect(px + 8, py - 1 + k * 9, 14, 4);
        if (!s.glitch) return;
        ctx.fillStyle = C.dark;
        for (var i = 0; i < 4; i++) ctx.fillRect(G.W - 300 + ((s.time * 900 + i * 77) % 270), py + ((i * 37 + s.time * 300) % 60) - 30, 40 + i * 12, 3);
        G.text('LINK', px - 40, py - 12, { size: 20, color: C.ink, align: 'center', bold: true });
    }

    function drawApples(s, ctx) {
        var gold = [C.dark, C.ink, C.mid, C.paper];
        s.apples.forEach(function (a) {
            var bob = Math.round(Math.sin(a.t * 4 + a.x) * 1.5), x = cellX(a.x), y = cellY(a.y) + bob;
            if (a.t < 0.3) { ctx.globalAlpha = a.t / 0.3; }
            bits(ctx, APPLE, x, y, 3, a.kind === 'gold' ? gold : SHADE);
            ctx.globalAlpha = 1;
            if (a.kind === 'gold' && Math.floor(a.t * 4) % 2) {
                ctx.fillStyle = C.ink;
                ctx.fillRect(x + 24, y - 4, 3, 9); ctx.fillRect(x + 21, y - 1, 9, 3);
            }
        });
    }

    // Axis-aligned piece of the snake's body between two cell points (in
    // cells); a link across a wrap-around edge is drawn as two stubs.
    function link(ctx, ax, ay, bx, by, w) {
        var dx = bx - ax, dy = by - ay;
        if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {
            var ux = dx ? -Math.sign(dx) : 0, uy = dy ? -Math.sign(dy) : 0;
            link(ctx, ax, ay, ax + ux, ay + uy, w); link(ctx, bx - ux, by - uy, bx, by, w);
            return;
        }
        var x0 = Math.min(ax, bx) * T + T / 2, y0 = OY + Math.min(ay, by) * T + T / 2;
        ctx.fillRect(x0 - w / 2, y0 - w / 2, Math.abs(dx) * T + w, Math.abs(dy) * T + w);
    }

    function spine(sn) {
        var b = sn.body, n = b.length, pts = [{ x: b[0].x + DX[sn.d] * sn.p, y: b[0].y + DY[sn.d] * sn.p }];
        for (var i = 0; i < n - 1; i++) pts.push(b[i]);
        var t = b[n - 1], u = b[n - 2] || t, f = sn.grow > 0 || sn.dead ? 0 : sn.p;
        var dx = u.x - t.x, dy = u.y - t.y;
        if (Math.abs(dx) > 1) dx = -Math.sign(dx);
        if (Math.abs(dy) > 1) dy = -Math.sign(dy);
        pts.push({ x: t.x + dx * f, y: t.y + dy * f });
        return pts;
    }

    function drawBody(ctx, pts, outer, inner, ow, iw) {
        ctx.fillStyle = outer;
        for (var i = 0; i < pts.length - 1; i++) link(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, ow);
        ctx.fillStyle = inner;
        for (var j = 0; j < pts.length - 1; j++) link(ctx, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y, iw);
    }

    function drawHead(s, ctx, sn, rival) {
        var hp = headPos(sn), d = sn.d, px = -DY[d], py = DX[d];
        ctx.fillStyle = rival ? C.dark : C.ink;
        ctx.fillRect(hp.x - 14, hp.y - 14, 28, 28);
        // A flicking tongue, about once a second.
        if (!rival && (s.time % 1.3) < 0.18) {
            ctx.fillStyle = C.dark;
            ctx.fillRect(hp.x + DX[d] * 16 - 2, hp.y + DY[d] * 16 - 2, 4 + Math.abs(DX[d]) * 6, 4 + Math.abs(DY[d]) * 6);
        }
        for (var e = -1; e <= 1; e += 2) {
            var ex = hp.x + DX[d] * 4 + px * 7 * e, ey = hp.y + DY[d] * 4 + py * 7 * e;
            ctx.fillStyle = C.paper; ctx.fillRect(ex - 4, ey - 4, 8, 8);
            ctx.fillStyle = C.ink; ctx.fillRect(ex - 2 + DX[d] * 2, ey - 2 + DY[d] * 2, 4, 4);
        }
        if (rival) { ctx.fillStyle = C.ink; ctx.fillRect(hp.x - 10 + DX[d] * 9, hp.y - 10 + DY[d] * 9, 20 - Math.abs(DX[d]) * 14, 20 - Math.abs(DY[d]) * 14); }
    }

    // The LCD's slow pixels: the head leaves fading copies behind it.
    function drawGhost(sn, ctx) {
        ctx.fillStyle = C.mid;
        for (var i = sn.ghost.length - 1; i >= 1; i--) {
            ctx.globalAlpha = 0.5 - i * 0.1;
            ctx.fillRect(sn.ghost[i].x - 13, sn.ghost[i].y - 13, 26, 26);
        }
        ctx.globalAlpha = 1;
    }

    function drawSnake(s, ctx, sn, rival) {
        if (!sn || !sn.body.length) return;
        if (sn.dead && Math.floor(sn.dead * 10) % 2) return;
        if (!rival && s.ready > 0 && Math.floor(s.ready * 8) % 2) return;
        drawGhost(sn, ctx);
        var pts = spine(sn);
        if (rival) drawBody(ctx, pts, C.dark, C.mid, 22, 8);
        else drawBody(ctx, pts, C.ink, C.dark, 24, 10);
        ctx.fillStyle = rival ? C.ink : C.mid;
        for (var i = 1; i < pts.length - 1; i += rival ? 1 : 2) {
            var p = pts[i], cx = p.x * T + T / 2, cy = OY + p.y * T + T / 2;
            if (rival) ctx.fillRect(cx - 3, cy - 3, 6, 6); else ctx.fillRect(cx - 2, cy - 2, 4, 4);
        }
        drawHead(s, ctx, sn, rival);
    }

    function drawTip(s, ctx) {
        var a = s.time < 4.2 ? Math.min(1, 4.2 - s.time) : 0;
        if (s.ready > 0 && G.lives < 3) { a = 1; }
        if (a <= 0) return;
        var text = s.ready > 0 && G.lives < 3 ? 'READY?' : (s.touch ? s.cfg.tip.replace('SPACE / A', 'A').replace('Arrows', 'Pad') : s.cfg.tip);
        ctx.globalAlpha = a;
        ctx.fillStyle = C.ink;
        ctx.fillRect(140, G.H - 40, G.W - 280, 34);
        G.text(text, G.W / 2, G.H - 16, { size: s.touch ? 20 : 17, color: C.paper, align: 'center', max: G.W - 300 });
        ctx.globalAlpha = 1;
    }

    function draw(s, ctx) {
        drawField(s, ctx);
        if (s.level === 1) drawClouds(s, ctx);
        if (s.level === 2) drawLeds(s, ctx);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, OY, G.W, G.H - OY); ctx.clip();
        drawApples(s, ctx);
        drawSnake(s, ctx, s.rv, true);
        drawSnake(s, ctx, s.sn, false);
        ctx.restore();
        if (s.level === 3) drawPort(s, ctx);
        drawPixelGrid(s, ctx);
        drawTip(s, ctx);
    }

    function hud(s) {
        var rv = s.rv ? (s.rv.wait ? '  RIVAL OFFLINE' : '  RIVAL ' + s.rv.body.length) : '';
        return 'APPLES ' + s.eaten + '/' + s.quota + rv + (G.key.a ? '  BOOST' : '');
    }

    // ------------------------------------------------------------- ending

    // HIGH SCORE: the battery LED blinks, a pixel trophy shines on the left,
    // the staff roll scrolls on the right and a snake marches round the
    // screen edge. Only e.t drives it; e.data caches the trophy picture.
    var CREDITS = ['SERPENT.GB', '', 'STAFF', '', 'GAME DESIGN', 'SNONUX', '', 'SNAKE', 'YOU', '', 'RIVAL', 'LINK CABLE',
        '', 'MUSIC', '4 CHANNELS', '', 'APPLES', 'LOTS', '', 'THANK YOU', 'FOR PLAYING'];

    function drawLed(e, ctx) {
        var on = Math.floor(e.t * 2.5) % 2 === 0;
        ctx.fillStyle = C.dark; ctx.fillRect(30, 40, 20, 20);
        ctx.fillStyle = on ? C.paper : C.ink; ctx.fillRect(34, 44, 12, 12);
        G.text('BATTERY', 60, 57, { size: 14, color: C.mid });
        G.text('DOT MATRIX WITH STEREO SOUND', G.W / 2, 60, { size: 14, color: C.mid, align: 'center' });
    }

    function drawTrophy(e, ctx) {
        var y = 226 + Math.round(Math.sin(e.t * 2) * 4);
        bits(ctx, TROPHY, 64, y, 9, SHADE);
        if (Math.floor(e.t * 3) % 3 === 0) {
            ctx.fillStyle = C.paper;
            ctx.fillRect(64 + 27, y + 18, 6, 18); ctx.fillRect(64 + 21, y + 24, 18, 6);
        }
    }

    function drawCredits(e, ctx) {
        var top = 200, h = 180, len = CREDITS.length * 26 + h;
        ctx.save();
        ctx.beginPath(); ctx.rect(740, top, 200, h); ctx.clip();
        var off = (e.t * 28) % len;
        for (var i = 0; i < CREDITS.length; i++) {
            var y = top + h - off + i * 26;
            if (y > top - 10 && y < top + h + 20) G.text(CREDITS[i], 840, y, { size: 16, color: i % 3 === 0 ? C.paper : C.mid, align: 'center' });
        }
        ctx.restore();
    }

    function drawEdgeSnake(e, ctx) {
        var w = G.W - 24, h = G.H - 24, per = 2 * (w + h);
        for (var i = 0; i < 26; i++) {
            var d = ((e.t * 160 - i * 16) % per + per) % per, x, y;
            if (d < w) { x = d; y = 0; } else if (d < w + h) { x = w; y = d - w; } else if (d < 2 * w + h) { x = 2 * w + h - d; y = h; } else { x = 0; y = per - d; }
            ctx.fillStyle = i === 0 ? C.paper : (i % 2 ? C.mid : C.dark);
            ctx.fillRect(6 + x, 6 + y, 12, 12);
        }
    }

    function drawEnding(e, ctx) {
        drawEdgeSnake(e, ctx);
        drawLed(e, ctx);
        drawTrophy(e, ctx);
        drawCredits(e, ctx);
    }

    G.register('dmg', {
        title: 'SERPENT.GB',
        blurb: 'Eat the apples, grow longer, never bite yourself. The snake keeps sliding.',
        controls: [
            '← ↑ → ↓ / pad: steer (a turn pressed early waits for the next cell)',
            'hold SPACE / BOOST: speed up · ice lanes: no turning until you leave them',
            'Walls, rocks and bodies cost a life · eat the apple quota to clear the level'
        ],
        levelNames: ['Garden', 'Cartridge Maze', 'The Rival'],
        colors: { bg: C.ink, fg: C.paper, accent: C.mid, dim: C.mid },
        lives: 3,
        cursor: 'none',
        music: {
            bpm: 148, root: 48, scale: 'major', prog: [0, 5, 3, 4],
            bass: 'x.x.o.x.x.o.5.o.',
            lead: ['7.7.4.7.9-7.4...', '5.5.2.5.7-5.2...', '3.5.7.8-7.5.3.5.', '4.6.8.b-a.8.6.4.',
                '9.7.4.0.2.4.7.4.', '5---7.5.4.2.0...', '3.3.5.3.7-5.3...', '4.4.6.8.b---....'],
            arp: '0123', drums: { k: 'x...x...x...x...', s: '....x.......x.x.', h: 'x.xxx.xxx.xxx.xx' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'square', leadOct: 2
        },
        touch: { a: 'BOOST', hide: ['b'], dirs: 4 },
        ending: {
            title: 'HIGH SCORE',
            text: 'Every apple eaten. The rival is unplugged.',
            colors: [C.paper, C.mid, C.dark, C.paper],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
