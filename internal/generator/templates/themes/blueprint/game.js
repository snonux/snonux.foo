/*
 * Draftsman — the blueprint theme's game: Qix-style territory claiming on a
 * drafting sheet.
 *
 * The pen runs along the claimed edges of the sheet. Holding DRAW while it
 * moves into the open sheet draws a line; closing that line on a claimed
 * edge claims (hatches) every part of the sheet that holds no enemy. A
 * line is fragile while it is drawn: an enemy touching it or the pen costs
 * a life, and a pen that stands still lets the fuse creep along the line.
 * Level 1 is a plain sheet with one bouncing ink blot, level 2 adds eraser
 * crumbs that hunt along the edges and slow (double-score) drawing, level 3
 * is a tower-shaped sheet with a compass spider that splits in two once it
 * is cornered: the claim that separates the twins approves the drawing.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    // The sheet is a grid of 10 px cells inside the canvas margins, which
    // hold the dimension lines and the title block.
    var CS = 10, COLS = 88, ROWS = 46, N = COLS * ROWS, X0 = 40, Y0 = 46, FW = COLS * CS, FH = ROWS * CS;
    var OPEN = 0, PRE = 1, TRAIL = 2, FAST = 3, SLOW = 4;
    var PEN_SPEED = 13, SLOW_SPEED = 6.5, SPARK_SPEED = 6.4, FUSE_SPEED = 10, FUSE_DELAY = 0.4, INVULN = 2;
    var SPLIT_AT = 0.55, FALLBACK = 0.88;
    var DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    var ORDER = ['left', 'right', 'up', 'down'];
    var C = {
        paper: '#0b2748', ink: '#eaf6ff', cyan: '#7fd6ff', dim: '#7fa7cc', red: '#ff5a4e', gold: '#ffd479',
        pink: '#ffb3c1', deep: '#04101f', pre: '#17406b', fast: '#1a4f80', slow: '#2d4f6e'
    };
    var NAMES = ['Floor Plan', 'Elevation', 'The Tower'];

    function plainSheet() { return false; }

    // Level 2: the ground floor of the elevation is already drawn in, so
    // the open sheet is a skyline the pen has to work around.
    function elevation(c, r) {
        return (c >= 8 && c <= 21 && r >= 36) || (c >= 34 && c <= 50 && r >= 31) || (c >= 62 && c <= 74 && r >= 38);
    }

    // Level 3: the sheet is cut to a setback tower's silhouette.
    function tower(c, r) {
        return (r < 12 && (c < 28 || c > 59)) || (r < 22 && (c < 15 || c > 72));
    }

    // blots: [x, y, heading, speed]; boss: the same for the compass spider.
    var LEVEL_CFG = [
        { target: 0.7, layout: plainSheet, sparks: 0, slow: false, blots: [[620, 260, 0.62, 118]] },
        { target: 0.7, layout: elevation, sparks: 2, slow: true, blots: [[520, 170, 2.4, 126]] },
        { target: FALLBACK, layout: tower, sparks: 2, slow: true, blots: [[300, 410, 0.55, 110]], boss: [640, 360, 2.25, 84] }
    ];

    function cx(i) { return X0 + (i % COLS) * CS + CS / 2; }
    function cy(i) { return Y0 + Math.floor(i / COLS) * CS + CS / 2; }
    function claimed(k) { return k === PRE || k === FAST || k === SLOW; }

    function enemy(kind, def, r) {
        return {
            kind: kind, x: def[0], y: def[1], vx: Math.cos(def[2]) * def[3], vy: Math.sin(def[2]) * def[3],
            speed: def[3], max: kind === 'boss' ? def[3] * 1.35 : def[3], r: r, spin: 0, cd: 0, arc: 0, phase: def[2] * 3
        };
    }

    function init(level) {
        var cfg = LEVEL_CFG[level - 1], grid = new Uint8Array(N), open = 0;
        for (var i = 0; i < N; i++) {
            var c = i % COLS, r = Math.floor(i / COLS);
            var edge = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
            grid[i] = edge || cfg.layout(c, r) ? PRE : OPEN;
            if (!grid[i]) open++;
        }
        var s = {
            level: level, cfg: cfg, touch: G.isTouch(), grid: grid, open0: open, claimed: 0, ver: 1, t: 0,
            pen: { i: 0, from: 0, anim: 1, prog: 1, drawing: false, inv: 0, idle: 0, want: null },
            trail: [], trailSlow: [], slowN: 0, fuse: 0, fuseOn: false,
            enemies: cfg.blots.map(function (b) { return enemy('blot', b, 11); }),
            sparks: [], sparkWait: 2.5, sparkMap: null, split: false, won: false,
            sweeps: [], arcs: [], banner: null, pic: null, picVer: 0,
            snd: { step: 0, scratch: 0, fuse: 0 }
        };
        if (cfg.boss) s.enemies.push(enemy('boss', cfg.boss, 24));
        s.pen.i = s.pen.from = nearestEdge(s, (ROWS - 1) * COLS + 44);
        if (level === 2) s.banner = { text: 'HOLD X / SLOW WHILE DRAWING: DOUBLE POINTS', t: 6 };
        if (level === 3) s.banner = { text: 'CORNER THE COMPASS SPIDER', t: 5 };
        return s;
    }

    // ------------------------------------------------------------------
    // The grid: edges, regions and the claim
    // ------------------------------------------------------------------

    // An edge is a claimed cell that touches the open sheet (or a line
    // being drawn), diagonals included: the pen and the crumbs live there.
    function isEdge(s, i) {
        var g = s.grid;
        if (!claimed(g[i])) return false;
        var c = i % COLS, r = Math.floor(i / COLS);
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                var cc = c + dc, rr = r + dr;
                if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
                var k = g[rr * COLS + cc];
                if (k === OPEN || k === TRAIL) return true;
            }
        }
        return false;
    }

    function neighbours(i) {
        var c = i % COLS, r = Math.floor(i / COLS), out = [];
        if (c > 0) out.push(i - 1);
        if (c < COLS - 1) out.push(i + 1);
        if (r > 0) out.push(i - COLS);
        if (r < ROWS - 1) out.push(i + COLS);
        return out;
    }

    // Breadth-first search from cell `from` for the closest edge cell.
    function nearestEdge(s, from) {
        var seen = new Uint8Array(N), q = [from], h = 0;
        seen[from] = 1;
        while (h < q.length) {
            var i = q[h++];
            if (isEdge(s, i)) return i;
            var nb = neighbours(i);
            for (var j = 0; j < nb.length; j++) if (!seen[nb[j]]) { seen[nb[j]] = 1; q.push(nb[j]); }
        }
        return from;
    }

    // Distance along the edges from `target` to every edge cell (-1 where
    // unreachable): the crumbs follow it downhill to the pen.
    function edgeMap(s, target) {
        var key = target + ':' + s.ver + ':' + s.trail.length;
        if (s.sparkMap && s.sparkMap.key === key) return s.sparkMap.d;
        var d = new Int16Array(N).fill(-1), q = [target], h = 0;
        d[target] = 0;
        while (h < q.length) {
            var i = q[h++], nb = neighbours(i);
            for (var j = 0; j < nb.length; j++) {
                var n = nb[j];
                if (d[n] < 0 && isEdge(s, n)) { d[n] = d[i] + 1; q.push(n); }
            }
        }
        s.sparkMap = { key: key, d: d };
        return d;
    }

    function flood(g, lab, q, start, id) {
        var h = 0, t = 0;
        q[t++] = start; lab[start] = id;
        while (h < t) {
            var nb = neighbours(q[h++]);
            for (var j = 0; j < nb.length; j++) {
                var n = nb[j];
                if (g[n] === OPEN && !lab[n]) { lab[n] = id; q[t++] = n; }
            }
        }
        return t;
    }

    // The open cell an enemy stands on (or the nearest one under its body).
    function enemyCell(s, e) {
        var c0 = Math.floor((e.x - X0) / CS), r0 = Math.floor((e.y - Y0) / CS);
        for (var rad = 0; rad <= 3; rad++) {
            for (var dr = -rad; dr <= rad; dr++) {
                for (var dc = -rad; dc <= rad; dc++) {
                    var c = c0 + dc, r = r0 + dr;
                    if (c >= 0 && r >= 0 && c < COLS && r < ROWS && s.grid[r * COLS + c] === OPEN) return r * COLS + c;
                }
            }
        }
        return -1;
    }

    // Labels the open regions and claims every one that holds no enemy.
    function fillRegions(s, kind) {
        var g = s.grid, lab = new Int16Array(N), q = new Int32Array(N), sizes = [0], keep = {};
        for (var i = 0; i < N; i++) if (g[i] === OPEN && !lab[i]) sizes.push(flood(g, lab, q, i, sizes.length));
        var regs = s.enemies.map(function (e) { var c = enemyCell(s, e); return c < 0 ? 0 : lab[c]; });
        regs.forEach(function (r) { keep[r] = true; });
        var f = { n: 0, regs: regs, sizes: sizes, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
        for (i = 0; i < N; i++) {
            if (g[i] !== OPEN || keep[lab[i]]) continue;
            g[i] = kind; f.n++;
            f.x0 = Math.min(f.x0, cx(i)); f.x1 = Math.max(f.x1, cx(i));
            f.y0 = Math.min(f.y0, cy(i)); f.y1 = Math.max(f.y1, cy(i));
        }
        return f;
    }

    // ------------------------------------------------------------------
    // The pen
    // ------------------------------------------------------------------

    // The most recently pressed direction that is still held wins, so a
    // turn can be pressed before the old key is let go.
    function wantDir(s) {
        var p = s.pen;
        ORDER.forEach(function (d) { if (G.hit[d]) p.want = d; });
        if (p.want && G.key[p.want]) return p.want;
        for (var j = 0; j < ORDER.length; j++) if (G.key[ORDER[j]]) { p.want = ORDER[j]; return p.want; }
        return null;
    }

    function penXY(s) {
        var p = s.pen, a = Math.min(1, p.anim);
        return { x: G.lerp(cx(p.from), cx(p.i), a), y: G.lerp(cy(p.from), cy(p.i), a) };
    }

    function updatePen(s, dt) {
        var p = s.pen, d = wantDir(s), slow = s.cfg.slow && p.drawing && G.key.b, speed = slow ? SLOW_SPEED : PEN_SPEED;
        if (p.inv > 0) p.inv -= dt;
        p.anim += dt * speed;
        if (!d) { p.prog = 1; idle(s, dt); return; }
        p.prog += dt * speed;
        if (p.prog < 1) return;
        if (stepPen(s, d, slow)) { p.prog -= 1; p.idle = 0; } else { p.prog = 1; idle(s, dt); }
    }

    // A pen standing still on an unfinished line lights the fuse, which
    // creeps from the start of the line towards it.
    function idle(s, dt) {
        var p = s.pen;
        if (!p.drawing) return;
        p.idle += dt;
        if (p.idle < FUSE_DELAY) return;
        s.fuseOn = true;
        s.fuse += FUSE_SPEED * dt;
        s.snd.fuse -= dt;
        if (s.snd.fuse <= 0) { s.snd.fuse = 0.09; G.noise(0.05, { vol: 0.05, freq: 2600, filter: 'bandpass' }); }
        if (s.fuse >= s.trail.length - 1) hitPen(s);
    }

    function stepPen(s, d, slow) {
        var p = s.pen, v = DIRS[d], c = p.i % COLS + v[0], r = Math.floor(p.i / COLS) + v[1];
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
        var n = r * COLS + c, k = s.grid[n];
        if (k === TRAIL) return false;
        if (!p.drawing && k === OPEN && !G.key.a) return false;
        if (!p.drawing && k !== OPEN && !isEdge(s, n)) return false;
        if (!p.drawing && k === OPEN) startLine(s);
        p.from = p.i; p.i = n; p.anim = 0;
        if (!p.drawing) { stepSound(s); return true; }
        if (k !== OPEN) { closeTrail(s); return true; }
        s.grid[n] = TRAIL;
        s.trail.push(n); s.trailSlow.push(slow ? 1 : 0);
        if (slow) s.slowN++;
        scratchSound(s, slow);
        return true;
    }

    function startLine(s) {
        var p = s.pen;
        p.drawing = true; p.idle = 0;
        s.trail = [p.i]; s.trailSlow = [0]; s.slowN = 0; s.fuse = 0; s.fuseOn = false;
        G.tone(880, 0.06, { type: 'triangle', vol: 0.12 });
    }

    // The plotter clicks every few cells along an edge.
    function stepSound(s) {
        if (++s.snd.step % 4) return;
        G.tone(1900, 0.018, { type: 'square', vol: 0.03 });
    }

    function scratchSound(s, slow) {
        if (++s.snd.scratch % (slow ? 2 : 3)) return;
        G.noise(0.04, { vol: 0.05, freq: slow ? 1800 : 3200, filter: 'bandpass', q: 3 });
    }

    // ------------------------------------------------------------------
    // Claims
    // ------------------------------------------------------------------

    function closeTrail(s) {
        var tr = s.trail, len = tr.length - 1, kind = s.slowN > 0 && s.slowN * 2 >= len ? SLOW : FAST;
        for (var j = 1; j < tr.length; j++) s.grid[tr[j]] = kind;
        var f = fillRegions(s, kind), cells = f.n + len;
        tr.forEach(function (i) {
            f.x0 = Math.min(f.x0, cx(i)); f.x1 = Math.max(f.x1, cx(i));
            f.y0 = Math.min(f.y0, cy(i)); f.y1 = Math.max(f.y1, cy(i));
        });
        s.claimed += cells; s.ver++;
        s.trail = []; s.trailSlow = []; s.slowN = 0; s.fuse = 0; s.fuseOn = false;
        s.pen.drawing = false;
        reward(s, cells, kind, f);
        afterClaim(s, f);
    }

    // Points per cell, doubled for a slow line; a chime that climbs with
    // the size of the claim and a plotter sweep over the hatched area.
    function reward(s, cells, kind, f) {
        var pts = cells * (kind === SLOW ? 2 : 1) * 2;
        G.addScore(pts);
        var pct = cells / s.open0 * 100;
        G.popup((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, '+' + pct.toFixed(1) + '%' + (kind === SLOW ? ' x2' : ''), kind === SLOW ? C.gold : C.cyan);
        var notes = Math.min(6, 2 + Math.floor(pct / 3));
        for (var n = 0; n < notes; n++) G.tone([523, 659, 784, 988, 1175, 1319][n], 0.22, { type: 'sine', vol: 0.11, delay: n * 0.06 });
        if (pct >= 8) G.sfx('power');
        s.sweeps.push({ x0: f.x0 - CS / 2, y0: f.y0 - CS / 2, x1: f.x1 + CS / 2, y1: f.y1 + CS / 2, t: 0, slow: kind === SLOW });
        if (s.sweeps.length > 4) s.sweeps.shift();
    }

    function afterClaim(s, f) {
        var p = s.pen;
        if (!isEdge(s, p.i)) { p.i = p.from = nearestEdge(s, p.i); p.anim = 1; }
        // A crumb whose edge was drawn in is swept to the far side of the
        // sheet rather than dropped beside the pen.
        var map = null;
        s.sparks.forEach(function (k) {
            if (isEdge(s, k.i)) return;
            map = map || edgeMap(s, p.i);
            k.i = k.from = farthestEdge(s, map); k.prog = 0;
        });
        var twins = [], boss = null;
        s.enemies.forEach(function (e, j) { if (e.kind === 'twin') twins.push(f.regs[j]); if (e.kind === 'boss') boss = { e: e, reg: f.regs[j] }; });
        dropTrapped(s, f);
        if (boss && boss.reg && f.sizes[boss.reg] < SPLIT_AT * s.open0) splitBoss(s, boss.e);
        var apart = twins.length === 2 && twins[0] !== twins[1];
        var pct = s.claimed / s.open0;
        if (s.won) return;
        if (s.cfg.boss ? apart || pct >= FALLBACK : pct >= s.cfg.target) {
            s.won = true;
            if (apart) G.popup(480, 280, 'TWINS SEPARATED', C.red);
            G.win(500 * s.level + Math.round(pct * 1000));
        }
    }

    // An enemy whose body no longer covers any open cell has been drawn in
    // around: it is erased (rare, but it must not keep a region open).
    function dropTrapped(s, f) {
        s.enemies = s.enemies.filter(function (e, j) {
            if (f.regs[j]) return true;
            G.burst(e.x, e.y, { n: 18, color: C.cyan, speed: 160 });
            return false;
        });
    }

    // Cornered, the compass spider splits into two twins that run apart.
    function splitBoss(s, e) {
        var a = Math.atan2(e.vy, e.vx) + Math.PI / 2, sp = 78;
        s.enemies.splice(s.enemies.indexOf(e), 1);
        [0, Math.PI].forEach(function (o) {
            var t = enemy('twin', [e.x + Math.cos(a + o) * 6, e.y + Math.sin(a + o) * 6, a + o, sp], 15);
            s.enemies.push(t);
        });
        s.split = true;
        s.banner = { text: 'IT SPLIT! SEPARATE THE TWINS WITH ONE LINE', t: 4 };
        G.sfx('bigboom'); G.flash(C.red, 0.25); G.shake(8, 0.4);
        G.burst(e.x, e.y, { n: 40, color: C.red, speed: 260, life: 0.8 });
    }

    // ------------------------------------------------------------------
    // Hazards
    // ------------------------------------------------------------------

    function hitPen(s) {
        var p = s.pen, at = penXY(s);
        G.burst(at.x, at.y, { n: 26, color: C.red, speed: 200, life: 0.6 });
        G.shake(6, 0.3);
        G.noise(0.3, { vol: 0.2, freq: 400, filter: 'lowpass' });
        if (p.drawing) {
            for (var j = 1; j < s.trail.length; j++) s.grid[s.trail[j]] = OPEN;
            p.i = p.from = s.trail[0];
        }
        s.trail = []; s.trailSlow = []; s.slowN = 0; s.fuse = 0; s.fuseOn = false;
        p.drawing = false; p.anim = 1; p.inv = INVULN; p.idle = 0;
        // Crumbs right beside the pen are swept back to the far side of
        // the sheet, so a lost life is not lost twice.
        var map = edgeMap(s, p.i);
        s.sparks.forEach(function (k) { if (map[k.i] >= 0 && map[k.i] < 16) { k.i = k.from = farthestEdge(s, map); k.prog = 0; } });
        G.loseLife();
    }

    function farthestEdge(s, map) {
        var best = 0, bd = -1;
        for (var i = 0; i < N; i++) if (map[i] > bd) { bd = map[i]; best = i; }
        return best;
    }

    function checkHits(s) {
        var p = s.pen;
        if (p.inv > 0) return;
        var at = penXY(s);
        if (!p.drawing) {
            for (var k = 0; k < s.sparks.length; k++) {
                var sp = sparkXY(s.sparks[k]);
                if (G.dist(sp.x, sp.y, at.x, at.y) < 11) { G.sfx('hit'); hitPen(s); return; }
            }
            return;
        }
        for (var j = 0; j < s.enemies.length; j++) if (touchesLine(s, s.enemies[j], at)) { hitPen(s); return; }
    }

    // An enemy touching the pen or any cell of its unfinished line.
    function touchesLine(s, e, at) {
        if (G.dist(e.x, e.y, at.x, at.y) < e.r + 5) return true;
        var reach = e.r + 3;
        for (var j = 1; j < s.trail.length; j++) {
            var i = s.trail[j], dx = cx(i) - e.x, dy = cy(i) - e.y;
            if (dx * dx + dy * dy < reach * reach) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Enemies: blots, the compass spider and its twins bounce off claimed
    // cells; crumbs run along the edges.
    // ------------------------------------------------------------------

    function solidAt(s, x, y) {
        var c = Math.floor((x - X0) / CS), r = Math.floor((y - Y0) / CS);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
        return claimed(s.grid[r * COLS + c]);
    }

    function wallX(s, e) {
        var dir = e.vx > 0 ? 1 : -1, px = e.x + dir * e.r, o = e.r * 0.6;
        if (!solidAt(s, px, e.y) && !solidAt(s, px, e.y - o) && !solidAt(s, px, e.y + o)) return;
        e.vx = -dir * Math.abs(e.vx); bounced(s, e);
    }

    function wallY(s, e) {
        var dir = e.vy > 0 ? 1 : -1, py = e.y + dir * e.r, o = e.r * 0.6;
        if (!solidAt(s, e.x, py) && !solidAt(s, e.x - o, py) && !solidAt(s, e.x + o, py)) return;
        e.vy = -dir * Math.abs(e.vy); bounced(s, e);
    }

    // A little spin on every bounce keeps the path from repeating, and the
    // heading never lies flat along an axis (it would rattle in place).
    function bounced(s, e) {
        var a = Math.atan2(e.vy, e.vx) + G.rnd(-0.12, 0.12), sp = Math.hypot(e.vx, e.vy);
        var q = Math.PI / 2, off = ((a % q) + q) % q;
        if (off < 0.26) a += 0.26 - off;
        if (off > q - 0.26) a -= off - (q - 0.26);
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
        if (e.cd <= 0) { e.cd = 0.25; G.tone(e.kind === 'blot' ? 150 : 95, 0.07, { type: 'sine', vol: 0.06, slide: 70 }); }
    }

    function moveEnemy(s, e, dt) {
        var sp = e.speed;
        // The spider surges and pauses as it strides; e.max is its top speed.
        if (e.kind === 'boss') sp = e.speed * (1 + 0.35 * Math.sin(s.t * 1.4 + e.phase));
        if (e.kind === 'twin') repel(s, e, dt);
        var cur = Math.hypot(e.vx, e.vy) || 1;
        e.vx *= sp / cur; e.vy *= sp / cur;
        var steps = Math.max(1, Math.ceil(sp * dt / 3)), h = dt / steps;
        for (var j = 0; j < steps; j++) {
            e.x += e.vx * h; wallX(s, e);
            e.y += e.vy * h; wallY(s, e);
        }
        e.spin += dt * (e.kind === 'blot' ? 1.5 : 3);
        e.cd -= dt;
        if (e.kind !== 'blot') compassArc(s, e, dt);
    }

    // The twins steer away from each other, so they drift to opposite ends
    // of their corner and leave a gap to draw the separating line through.
    function repel(s, e, dt) {
        s.enemies.forEach(function (o) {
            if (o === e || o.kind !== 'twin') return;
            var dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy) || 1;
            e.vx += dx / d * 160 * dt; e.vy += dy / d * 160 * dt;
        });
    }

    // The spider's pencil leg leaves fading compass arcs behind it.
    function compassArc(s, e, dt) {
        e.arc -= dt;
        if (e.arc > 0) return;
        e.arc = 0.45;
        s.arcs.push({ x: e.x, y: e.y, r: e.r + 16, a: e.spin, life: 1.4 });
        if (s.arcs.length > 10) s.arcs.shift();
    }

    function sparkXY(k) {
        var a = Math.min(1, k.prog);
        return { x: G.lerp(cx(k.from), cx(k.i), a), y: G.lerp(cy(k.from), cy(k.i), a) };
    }

    function spawnSpark(s) {
        var map = edgeMap(s, s.pen.drawing ? s.trail[0] : s.pen.i), i = farthestEdge(s, map);
        s.sparks.push({ i: i, from: i, prog: 0, rot: G.rnd(0, 6) });
        s.sparkWait = 2.5;
        G.burst(cx(i), cy(i), { n: 12, color: C.pink, speed: 90, life: 0.5 });
        G.sfx('blip');
    }

    function updateSparks(s, dt) {
        if (s.sparks.length < s.cfg.sparks) {
            s.sparkWait -= dt;
            if (s.sparkWait <= 0) spawnSpark(s);
        }
        if (!s.sparks.length) return;
        var map = edgeMap(s, s.pen.drawing ? s.trail[0] : s.pen.i);
        s.sparks.forEach(function (k) {
            k.prog += SPARK_SPEED * dt;
            k.rot += dt * 4;
            if (k.prog >= 1) { k.prog -= 1; stepSpark(s, k, map); }
        });
    }

    // Downhill on the edge map, turning back only when that is clearly
    // shorter, with a little randomness so two crumbs do not stack up.
    function stepSpark(s, k, map) {
        var opts = neighbours(k.i).filter(function (n) { return isEdge(s, n); });
        if (!opts.length) { k.i = k.from = nearestEdge(s, k.i); return; }
        var score = function (n) { return (map[n] < 0 ? 999 : map[n]) + (n === k.from ? 3 : 0); };
        var pick = opts[0];
        if (Math.random() < 0.15) pick = G.pick(opts);
        else opts.forEach(function (n) { if (score(n) < score(pick)) pick = n; });
        k.from = k.i; k.i = pick;
    }

    function update(s, dt) {
        s.t += dt;
        updatePen(s, dt);
        if (s.won) return;
        s.enemies.forEach(function (e) { moveEnemy(s, e, dt); });
        updateSparks(s, dt);
        checkHits(s);
        s.sweeps.forEach(function (w) { w.t += dt; });
        s.sweeps = s.sweeps.filter(function (w) { return w.t < 0.9; });
        s.arcs.forEach(function (a) { a.life -= dt; });
        s.arcs = s.arcs.filter(function (a) { return a.life > 0; });
        if (s.banner && (s.banner.t -= dt) <= 0) s.banner = null;
    }

    // ------------------------------------------------------------------
    // Drawing: the sheet is painted into an offscreen picture once per claim
    // ------------------------------------------------------------------

    function kindPath(g, s, kind) {
        g.beginPath();
        for (var r = 0; r < ROWS; r++) {
            var run = -1;
            for (var c = 0; c <= COLS; c++) {
                var on = c < COLS && s.grid[r * COLS + c] === kind;
                if (on && run < 0) run = c;
                if (!on && run >= 0) { g.rect(run * CS, r * CS, (c - run) * CS, CS); run = -1; }
            }
        }
    }

    // Hatching clipped to one kind of claimed cell: poché for what was
    // drawn before, single hatch for fast lines, cross-hatch for slow ones.
    function hatch(g, s, kind, fill, stroke, gap, cross) {
        g.save();
        kindPath(g, s, kind);
        g.fillStyle = fill; g.fill(); g.clip();
        g.beginPath();
        for (var k = -FH; k < FW; k += gap) {
            g.moveTo(k, FH); g.lineTo(k + FH, 0);
            if (cross) { g.moveTo(k, 0); g.lineTo(k + FH, FH); }
        }
        g.strokeStyle = stroke; g.lineWidth = 1; g.stroke();
        g.restore();
    }

    function paper(g) {
        g.fillStyle = C.paper; g.fillRect(0, 0, FW, FH);
        g.lineWidth = 1;
        [[CS, 'rgba(127,214,255,0.09)'], [CS * 5, 'rgba(127,214,255,0.2)']].forEach(function (grid) {
            g.beginPath();
            for (var x = 0; x <= FW; x += grid[0]) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, FH); }
            for (var y = 0; y <= FH; y += grid[0]) { g.moveTo(0, y + 0.5); g.lineTo(FW, y + 0.5); }
            g.strokeStyle = grid[1]; g.stroke();
        });
    }

    // White ink along every side where claimed meets open sheet.
    function edgeLines(g, s) {
        g.beginPath();
        for (var i = 0; i < N; i++) {
            if (!claimed(s.grid[i])) continue;
            var c = i % COLS, r = Math.floor(i / COLS), x = c * CS, y = r * CS;
            if (c > 0 && s.grid[i - 1] === OPEN) { g.moveTo(x, y); g.lineTo(x, y + CS); }
            if (c < COLS - 1 && s.grid[i + 1] === OPEN) { g.moveTo(x + CS, y); g.lineTo(x + CS, y + CS); }
            if (r > 0 && s.grid[i - COLS] === OPEN) { g.moveTo(x, y); g.lineTo(x + CS, y); }
            if (r < ROWS - 1 && s.grid[i + COLS] === OPEN) { g.moveTo(x, y + CS); g.lineTo(x + CS, y + CS); }
        }
        g.strokeStyle = C.ink; g.lineWidth = 2; g.lineCap = 'square'; g.stroke();
    }

    function sheetPic(s) {
        if (s.pic && s.picVer === s.ver) return s.pic;
        if (!s.pic) { s.pic = document.createElement('canvas'); s.pic.width = FW; s.pic.height = FH; }
        var g = s.pic.getContext('2d');
        paper(g);
        hatch(g, s, PRE, C.pre, 'rgba(127,214,255,0.32)', 6, true);
        hatch(g, s, FAST, C.fast, 'rgba(127,214,255,0.55)', 9, false);
        hatch(g, s, SLOW, C.slow, 'rgba(255,212,121,0.6)', 7, true);
        edgeLines(g, s);
        s.picVer = s.ver;
        return s.pic;
    }

    function arrowHead(ctx, x, y, a) {
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(a - 0.35) * 9, y - Math.sin(a - 0.35) * 9);
        ctx.lineTo(x - Math.cos(a + 0.35) * 9, y - Math.sin(a + 0.35) * 9);
        ctx.closePath();
    }

    // Dimension lines in the margins; the bottom one measures the claim.
    function drawMargins(s, ctx) {
        var pct = s.claimed / s.open0, goal = s.cfg.target, y = 518, x1 = X0 + FW, gx = X0 + FW * goal;
        ctx.strokeStyle = C.dim; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(X0, y); ctx.lineTo(x1, y); ctx.moveTo(X0, y - 8); ctx.lineTo(X0, y + 8); ctx.moveTo(x1, y - 8); ctx.lineTo(x1, y + 8);
        ctx.moveTo(22, Y0); ctx.lineTo(22, Y0 + FH); ctx.moveTo(14, Y0); ctx.lineTo(30, Y0); ctx.moveTo(14, Y0 + FH); ctx.lineTo(30, Y0 + FH);
        ctx.stroke();
        ctx.fillStyle = C.dim; ctx.beginPath();
        arrowHead(ctx, X0, y, Math.PI); arrowHead(ctx, x1, y, 0); arrowHead(ctx, 22, Y0, -Math.PI / 2); arrowHead(ctx, 22, Y0 + FH, Math.PI / 2);
        ctx.fill();
        ctx.fillStyle = C.cyan; ctx.fillRect(X0, y - 2, FW * Math.min(1, pct), 4);
        ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, y - 10); ctx.lineTo(gx, y + 10); ctx.stroke();
        G.text(Math.round(goal * 100) + '%', gx + 5, y - 5, { size: 12, color: C.red });
        G.text('CLAIMED ' + Math.floor(pct * 100) + '% OF ' + Math.round(goal * 100) + '%', X0, 536, { size: 13, color: C.ink });
        G.text('DWG A-0' + s.level + ' · ' + NAMES[s.level - 1].toUpperCase() + ' · SCALE 1:100 · DRAWN SNONUX', x1, 536, { size: 13, color: C.dim, align: 'right' });
        ctx.save(); ctx.translate(17, Y0 + FH / 2); ctx.rotate(-Math.PI / 2);
        G.text('4600', 0, 0, { size: 12, color: C.dim, align: 'center' });
        ctx.restore();
    }

    function drawSweeps(s, ctx) {
        s.sweeps.forEach(function (w) {
            var a = Math.min(1, w.t / 0.6), x = G.lerp(w.x0, w.x1, a);
            ctx.globalAlpha = 1 - w.t / 0.9;
            ctx.strokeStyle = w.slow ? C.gold : C.ink; ctx.lineWidth = 2;
            ctx.strokeRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);
            ctx.fillStyle = 'rgba(234,246,255,0.18)'; ctx.fillRect(w.x0, w.y0, x - w.x0, w.y1 - w.y0);
            ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, w.y0); ctx.lineTo(x, w.y1); ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    function drawArcs(s, ctx) {
        ctx.lineWidth = 1.5;
        s.arcs.forEach(function (a) {
            ctx.globalAlpha = Math.max(0, a.life / 1.4) * 0.7;
            ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, a.a, a.a + 2.2); ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    function drawTrail(s, ctx) {
        var tr = s.trail;
        if (!tr.length) return;
        var p = penXY(s), j;
        ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(cx(tr[0]), cy(tr[0]));
        for (j = 1; j < tr.length - 1; j++) ctx.lineTo(cx(tr[j]), cy(tr[j]));
        ctx.lineTo(p.x, p.y); ctx.stroke();
        if (s.slowN) {
            ctx.strokeStyle = C.gold; ctx.beginPath();
            for (j = 1; j < tr.length - 1; j++) if (s.trailSlow[j]) { ctx.moveTo(cx(tr[j - 1]), cy(tr[j - 1])); ctx.lineTo(cx(tr[j]), cy(tr[j])); }
            ctx.stroke();
        }
        if (s.fuseOn) drawFuse(s, ctx);
    }

    function drawFuse(s, ctx) {
        var tr = s.trail, j = Math.min(tr.length - 2, Math.floor(s.fuse)), f = s.fuse - j;
        var x = G.lerp(cx(tr[j]), cx(tr[j + 1]), f), y = G.lerp(cy(tr[j]), cy(tr[j + 1]), f), fl = 5 + Math.sin(s.t * 40) * 2;
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(x, y, fl, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.beginPath();
        for (var k = 0; k < 4; k++) { var a = s.t * 9 + k * 1.6; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11); }
        ctx.stroke();
    }

    function drawBlot(ctx, e, t) {
        var n = 12, j;
        ctx.fillStyle = C.deep; ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.beginPath();
        for (j = 0; j <= n; j++) {
            var a = j / n * Math.PI * 2, rr = e.r * (1 + 0.14 * Math.sin(t * 5 + j * 2.1 + e.phase));
            if (j) ctx.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr); else ctx.moveTo(e.x + rr, e.y);
        }
        ctx.fill(); ctx.stroke();
        // Droplets trail behind the blot's heading.
        var h = Math.atan2(e.vy, e.vx);
        ctx.beginPath();
        for (j = 1; j <= 3; j++) {
            var d = e.r + 4 + j * 5, w = Math.sin(t * 6 + j) * 3;
            ctx.moveTo(e.x - Math.cos(h) * d + 4 - j, e.y - Math.sin(h) * d + w);
            ctx.arc(e.x - Math.cos(h) * d, e.y - Math.sin(h) * d + w, 4 - j, 0, Math.PI * 2);
        }
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(234,246,255,0.75)'; ctx.beginPath(); ctx.arc(e.x - e.r * 0.35, e.y - e.r * 0.35, e.r * 0.22, 0, Math.PI * 2); ctx.fill();
    }

    // The compass spider: eight jointed legs, a needle leg and a pencil leg.
    function drawSpider(ctx, e, t) {
        var j, legs = e.r + 14, h = Math.atan2(e.vy, e.vx);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath();
        for (j = 0; j < 8; j++) {
            var a = j / 8 * Math.PI * 2 + Math.PI / 8, step = Math.sin(t * 9 + j * 1.7) * 0.22;
            var kx = e.x + Math.cos(a + step) * (e.r + 6), ky = e.y + Math.sin(a + step) * (e.r + 6);
            ctx.moveTo(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8);
            ctx.lineTo(kx, ky - 5);
            ctx.lineTo(e.x + Math.cos(a - step) * legs, e.y + Math.sin(a - step) * legs);
        }
        ctx.stroke();
        var sw = Math.sin(e.spin) * 0.5, nx = e.x + Math.cos(h - 0.3 + sw) * (legs + 10), ny = e.y + Math.sin(h - 0.3 + sw) * (legs + 10);
        var px = e.x + Math.cos(h + 0.3 - sw) * (legs + 10), py = e.y + Math.sin(h + 0.3 - sw) * (legs + 10);
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = C.deep; ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 0.45, 0, Math.PI * 2);
        ctx.moveTo(e.x - e.r * 0.8, e.y); ctx.lineTo(e.x + e.r * 0.8, e.y); ctx.moveTo(e.x, e.y - e.r * 0.8); ctx.lineTo(e.x, e.y + e.r * 0.8);
        ctx.stroke();
    }

    // Eraser crumbs: tumbling pink chips.
    function drawSparks(s, ctx) {
        if (!s.sparks.length) return;
        var big = s.touch ? 1.4 : 1;
        ctx.fillStyle = C.pink; ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.beginPath();
        s.sparks.forEach(function (k) {
            var p = sparkXY(k);
            for (var j = 0; j < 4; j++) {
                var a = k.rot + j * Math.PI / 2, r = (j % 2 ? 6 : 8) * big;
                if (j) ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); else ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
            }
            ctx.closePath();
        });
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,179,193,0.6)';
        s.sparks.forEach(function (k) {
            var p = sparkXY(k);
            ctx.fillRect(p.x + Math.sin(k.rot * 3) * 10, p.y + Math.cos(k.rot * 2) * 10, 3, 3);
        });
    }

    function drawPen(s, ctx) {
        var p = penXY(s), pen = s.pen, big = s.touch ? 1.4 : 1;
        if (pen.inv > 0 && Math.floor(s.t * 12) % 2) return;
        ctx.strokeStyle = 'rgba(127,214,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(p.x - 20 * big, p.y); ctx.lineTo(p.x + 20 * big, p.y); ctx.moveTo(p.x, p.y - 20 * big); ctx.lineTo(p.x, p.y + 20 * big);
        ctx.stroke();
        ctx.fillStyle = C.ink; ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 * big, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (pen.drawing) {
            ctx.fillStyle = G.key.b && s.cfg.slow ? C.gold : C.red;
            ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * big, 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawHints(s, ctx) {
        var y = Y0 + FH - 40;
        if (s.banner) {
            ctx.globalAlpha = Math.min(1, s.banner.t * 2);
            ctx.fillStyle = 'rgba(4,16,31,0.78)'; ctx.fillRect(X0 + 120, Y0 + 24, FW - 240, 38);
            G.text(s.banner.text, G.W / 2, Y0 + 50, { size: 20, color: s.split ? C.red : C.gold, align: 'center', max: FW - 260 });
            ctx.globalAlpha = 1;
        }
        if (s.claimed || s.pen.drawing) return;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(s.t * 4);
        var txt = s.touch ? 'HOLD DRAW + ◀ ▲ ▶ ▼ TO DRAW · CLOSE THE LINE TO CLAIM' : 'HOLD SPACE + ARROWS TO DRAW · CLOSE THE LINE TO CLAIM';
        G.text(txt, G.W / 2, y, { size: s.touch ? 22 : 18, color: C.ink, align: 'center', max: FW - 40 });
        ctx.globalAlpha = 1;
    }

    function draw(s, ctx) {
        ctx.fillStyle = '#071d38';
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.drawImage(sheetPic(s), X0, Y0);
        drawMargins(s, ctx);
        drawSweeps(s, ctx);
        drawArcs(s, ctx);
        drawTrail(s, ctx);
        s.enemies.forEach(function (e) { if (e.kind === 'blot') drawBlot(ctx, e, s.t); else drawSpider(ctx, e, s.t); });
        drawSparks(s, ctx);
        drawPen(s, ctx);
        drawHints(s, ctx);
    }

    function hud(s) {
        var pct = Math.floor(s.claimed / s.open0 * 100);
        if (s.cfg.boss) return (s.split ? 'SEPARATE THE TWINS ' : 'CORNER IT ') + pct + '%';
        return 'SHEET ' + pct + '/' + Math.round(s.cfg.target * 100) + '%';
    }

    // ------------------------------------------------------------------
    // The ending: a setback tower drafts itself edge by edge while the red
    // APPROVED stamp slams down on the sheet.
    // ------------------------------------------------------------------

    var TIERS = [[62, 0, 96], [48, 96, 196], [34, 196, 280], [20, 280, 336]];

    function towerEdges() {
        var out = [];
        TIERS.forEach(function (b) {
            var w = b[0], c = [[-w, -w], [w, -w], [w, w], [-w, w]];
            for (var k = 0; k < 4; k++) {
                var a = c[k], n = c[(k + 1) % 4];
                out.push([a[0], b[1], a[1], n[0], b[1], n[1]], [a[0], b[2], a[1], n[0], b[2], n[1]], [a[0], b[1], a[1], a[0], b[2], a[1]]);
            }
        });
        out.push([0, 336, 0, 0, 392, 0]);
        return out;
    }

    function project(x, y, z, th) {
        var X = x * Math.cos(th) - z * Math.sin(th), Z = x * Math.sin(th) + z * Math.cos(th);
        return { x: 132 + X * 0.8, y: 448 - y * 0.8 + Z * 0.4 };
    }

    function drawEndingTower(e, ctx) {
        var edges = e.data.edges || (e.data.edges = towerEdges()), th = 0.6 + e.t * 0.3, done = e.t * 18, tip = null;
        ctx.strokeStyle = 'rgba(127,214,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (var g = -80; g <= 80; g += 32) {
            var a = project(g, 0, -80, th), b = project(g, 0, 80, th), c = project(-80, 0, g, th), d = project(80, 0, g, th);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        }
        ctx.stroke();
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.beginPath();
        for (var k = 0; k < edges.length && k < done; k++) {
            var ed = edges[k], f = Math.min(1, done - k), p = project(ed[0], ed[1], ed[2], th), q = project(ed[3], ed[4], ed[5], th);
            tip = { x: G.lerp(p.x, q.x, f), y: G.lerp(p.y, q.y, f) };
            ctx.moveTo(p.x, p.y); ctx.lineTo(tip.x, tip.y);
        }
        ctx.stroke();
        if (tip && done < edges.length) { ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2); ctx.fill(); }
    }

    function drawStamp(e, ctx) {
        var t = e.t - 2.4;
        if (t < 0) return;
        var sc = Math.max(1, 3 - t * 9), specks = e.data.specks;
        if (!specks) { specks = e.data.specks = []; for (var k = 0; k < 14; k++) specks.push([e.rng() * 320 - 160, e.rng() * 150 - 75, 1 + e.rng() * 3]); }
        ctx.save(); ctx.translate(805, 245); ctx.rotate(-0.2); ctx.scale(sc * 0.85, sc * 0.85);
        ctx.globalAlpha = Math.min(0.85, t * 6);
        ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.strokeRect(-135, -48, 270, 96);
        ctx.lineWidth = 2; ctx.strokeRect(-124, -38, 248, 76);
        G.text('APPROVED', 0, 14, { size: 44, bold: true, color: C.red, align: 'center' });
        if (sc === 1) {
            ctx.fillStyle = C.red; ctx.beginPath();
            specks.forEach(function (p) { ctx.moveTo(p[0] + p[2], p[1]); ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2); });
            ctx.fill();
        }
        ctx.restore();
        var ring = t - 0.22;
        if (ring > 0 && ring < 0.5) {
            ctx.globalAlpha = 1 - ring * 2; ctx.strokeStyle = C.red; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(805, 245, 120 + ring * 300, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        drawEndingTower(e, ctx);
        drawStamp(e, ctx);
    }

    G.register('blueprint', {
        title: 'DRAFTSMAN',
        blurb: 'Draw lines to claim the sheet. Keep the ink blot off your pen.',
        controls: [
            '← ↑ → ↓ / pad: run the pen along the white claimed edges',
            'Hold SPACE / DRAW and move: draw a line into the open sheet',
            'Close the line to claim the side without the ink blot',
            'Hold X / SLOW while drawing: half speed, double points (level 2+)'
        ],
        levelNames: ['Floor Plan', 'Elevation', 'The Tower'],
        colors: { bg: C.paper, fg: C.ink, accent: C.cyan, dim: C.dim },
        lives: 4,
        // Minimal, glassy D dorian: a marimba-like figure over a slow modal
        // progression, while the 13-step arp and the 17-step plotter click
        // drift against the bar like phasing tape loops.
        music: {
            bpm: 108, root: 38, scale: 'dorian', prog: [0, 6, 3, 0],
            bass: 'x-------o-------',
            lead: ['0.4.7.4.2.4.7.9.', '6.4.1.4.6.8.6.4.', '3.5.7.5.3.5.a.7.', '4.2.0.2.4---7---'],
            arp: '0.1.2.3.2.1.',
            drums: { h: 'x..x..x..x..x..x.', k: 'x...............................' },
            leadWave: 'triangle', bassWave: 'sine', arpWave: 'sine', leadOct: 2
        },
        touch: { a: 'DRAW', b: 'SLOW', dirs: 4 },
        ending: {
            title: 'APPROVED',
            text: 'Drawing A-03 signed off. The tower can be built.',
            colors: [C.cyan, C.ink, C.red],
            draw: drawEnding
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
