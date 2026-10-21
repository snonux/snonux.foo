// Draftsman campaign bot: plays the Qix-style sheet with the pad only.
// It reads the sheet, then picks a cut from the claimed edge: a straight
// line, an L or a U into the open sheet that closes on a claimed edge. A
// cut is only drawn when no enemy could reach any cell of it before it is
// closed, even running straight at it at top speed (the enemies only
// bounce, so that bound is safe); among the safe cuts it takes the one that
// claims the most sheet per second, and on the tower level any cut that
// separates the spider's twins. It runs along the edges to the cut's start
// around the eraser crumbs, waits there for a safe moment, and bails out to
// the nearest edge if a line turns dangerous. Ordinary input only.
(function () {
    var CS = 10, COLS = 88, ROWS = 46, N = COLS * ROWS, X0 = 40, Y0 = 46, PEN = 13, SLOWPEN = 6.5;
    var OPEN = 0, TRAIL = 2;
    var DIRS = [[-1, 0, 'left'], [1, 0, 'right'], [0, -1, 'up'], [0, 1, 'down']];
    var KS = [2, 4, 7, 11, 16, 24], KU = [3, 6, 10, 15], WU = [5, 10, 18, 28];

    function cx(i) { return X0 + (i % COLS) * CS + CS / 2; }
    function cy(i) { return Y0 + Math.floor(i / COLS) * CS + CS / 2; }
    function claimed(k) { return k === 1 || k === 3 || k === 4; }

    function snapshot(s) {
        var g = new Uint8Array(N), src = s.grid;
        for (var i = 0; i < N; i++) g[i] = src[i];
        return g;
    }

    function enemies(s) {
        var out = [];
        for (var j = 0; j < s.enemies.length; j++) {
            var e = s.enemies[j];
            out.push({ x: e.x, y: e.y, r: e.r, v: e.max, kind: e.kind });
        }
        return out;
    }

    function sparkCells(s) {
        var out = [];
        for (var j = 0; j < s.sparks.length; j++) out.push(s.sparks[j].i, s.sparks[j].from);
        return out;
    }

    function isEdge(g, i) {
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

    function step(i, d) {
        var c = i % COLS + d[0], r = Math.floor(i / COLS) + d[1];
        return c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : r * COLS + c;
    }

    function cellGap(a, b) {
        return Math.max(Math.abs(a % COLS - b % COLS), Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)));
    }

    // Edge cells reachable from the pen, avoiding the crumbs' surroundings.
    function edgeBFS(g, from, sparks, maxD) {
        var dist = new Int16Array(N).fill(-1), par = new Int32Array(N).fill(-1), list = [from], h = 0;
        dist[from] = 0;
        while (h < list.length) {
            var i = list[h++];
            if (dist[i] >= maxD) continue;
            for (var k = 0; k < 4; k++) {
                var n = step(i, DIRS[k]);
                if (n < 0 || dist[n] >= 0 || !isEdge(g, n) || nearSpark(n, sparks, 3)) continue;
                dist[n] = dist[i] + 1; par[n] = i; list.push(n);
            }
        }
        return { dist: dist, par: par, list: list };
    }

    function nearSpark(i, sparks, gap) {
        for (var j = 0; j < sparks.length; j++) if (cellGap(i, sparks[j]) <= gap) return true;
        return false;
    }

    // Walks segments [dx, dy, len] from s0 through open cells; returns the
    // cells up to and including the claimed cell that closes the line.
    function walk(g, s0, segs) {
        var path = [], i = s0;
        for (var a = 0; a < segs.length; a++) {
            for (var k = 0; k < segs[a][2]; k++) {
                i = step(i, segs[a]);
                if (i < 0 || g[i] === TRAIL) return null;
                path.push(i);
                if (g[i] !== OPEN) return claimed(g[i]) && path.length > 1 ? path : null;
                if (path.length > 110) return null;
            }
        }
        return null;
    }

    function shapes(d) {
        var out = [[[d[0], d[1], 200]]], perps = [[-d[1], d[0]], [d[1], -d[0]]];
        perps.forEach(function (p) {
            KS.forEach(function (k) { out.push([[d[0], d[1], k], [p[0], p[1], 200]]); });
            KU.forEach(function (k) { WU.forEach(function (w) { out.push([[d[0], d[1], k], [p[0], p[1], w], [-d[0], -d[1], 200]]); }); });
        });
        return out;
    }

    // Slack in pixels: how far the closest enemy stays from the line even if
    // it ran straight at it for the whole time the line is open.
    function slack(path, from, ens, t0, speed) {
        var T = t0 + (path.length - from) / speed, worst = 1e9;
        for (var j = 0; j < ens.length; j++) {
            var e = ens[j], md = 1e12;
            for (var k = 0; k < path.length - 1; k++) {
                var dx = cx(path[k]) - e.x, dy = cy(path[k]) - e.y, d2 = dx * dx + dy * dy;
                if (d2 < md) md = d2;
            }
            worst = Math.min(worst, Math.sqrt(md) - e.r - 8 - e.v * T);
        }
        return worst;
    }

    function enemyCell(g, e) {
        var c0 = Math.floor((e.x - X0) / CS), r0 = Math.floor((e.y - Y0) / CS);
        for (var rad = 0; rad <= 3; rad++) {
            for (var dr = -rad; dr <= rad; dr++) {
                for (var dc = -rad; dc <= rad; dc++) {
                    var c = c0 + dc, r = r0 + dr;
                    if (c >= 0 && r >= 0 && c < COLS && r < ROWS && g[r * COLS + c] === OPEN) return r * COLS + c;
                }
            }
        }
        return -1;
    }

    // Cells the cut would claim, and whether it leaves the twins apart.
    function claimOf(g, path, ens, work, open) {
        var tg = work.g, lab = work.lab, q = work.q, reached = 0, rid = [];
        tg.set(g); lab.fill(0);
        for (var j = 0; j < path.length; j++) tg[path[j]] = 3;
        ens.forEach(function (e, id) {
            var c = enemyCell(tg, e);
            if (c < 0) { rid.push(-1); return; }
            if (lab[c]) { rid.push(lab[c]); return; }
            var h = 0, t = 0;
            q[t++] = c; lab[c] = id + 1;
            // Open cells never lie on the sheet's border, so their four
            // neighbours are always inside the grid.
            while (h < t) {
                var i = q[h++], n;
                n = i - 1; if (tg[n] === OPEN && !lab[n]) { lab[n] = id + 1; q[t++] = n; }
                n = i + 1; if (tg[n] === OPEN && !lab[n]) { lab[n] = id + 1; q[t++] = n; }
                n = i - COLS; if (tg[n] === OPEN && !lab[n]) { lab[n] = id + 1; q[t++] = n; }
                n = i + COLS; if (tg[n] === OPEN && !lab[n]) { lab[n] = id + 1; q[t++] = n; }
            }
            reached += t; rid.push(id + 1);
        });
        var twins = [];
        ens.forEach(function (e, id) { if (e.kind === 'twin') twins.push(rid[id]); });
        return { area: open - reached, apart: twins.length === 2 && twins[0] !== twins[1] };
    }

    function routeTo(bfs, S) {
        var r = [];
        for (var i = S; i >= 0; i = bfs.par[i]) r.unshift(i);
        return r;
    }

    // Every cut the pen could start within reach, kept if it is safe.
    function candidates(g, bfs, ens, sparks, maxTravel) {
        var out = [];
        bfs.list.forEach(function (S, n) {
            var d0 = bfs.dist[S];
            if (d0 > maxTravel || (d0 > 6 && n % 2)) return;
            DIRS.forEach(function (d) {
                var f = step(S, d);
                if (f < 0 || g[f] !== OPEN) return;
                shapes(d).forEach(function (sh) {
                    var path = walk(g, S, sh);
                    if (!path) return;
                    var t0 = d0 / PEN, m = slack(path, 0, ens, t0, PEN);
                    if (m < 0) return;
                    // Crumbs wait at the start of a line while it is drawn,
                    // so a line that closes near its start or near a crumb
                    // lands the pen in their reach.
                    var T = t0 + path.length / PEN, end = path[path.length - 1], reach = 5 + Math.round(T * 7);
                    var risky = nearSpark(end, sparks, reach) || (sparks.length > 0 && cellGap(end, S) < 8);
                    out.push({ S: S, d: d, path: path, t: t0 + path.length / PEN, m: m, risky: risky });
                });
            });
        });
        return out;
    }

    function plan(s, mem, maxTravel) {
        var g = snapshot(s), ens = enemies(s), sparks = sparkCells(s), open = 0;
        for (var i = 0; i < N; i++) if (g[i] === OPEN) open++;
        var bfs = edgeBFS(g, s.pen.i, sparks, maxTravel);
        var list = candidates(g, bfs, ens, sparks, maxTravel);
        if (!list.length) return null;
        list.sort(function (a, b) { return b.path.length - a.path.length; });
        var stride = Math.max(1, Math.floor(list.length / 140)), best = null;
        mem.work = mem.work || { g: new Uint8Array(N), lab: new Int32Array(N), q: new Int32Array(N) };
        for (var k = 0; k < list.length; k += (k < 40 ? 1 : stride)) {
            var c = list[k], cl = claimOf(g, c.path, ens, mem.work, open);
            c.score = cl.area / (c.t + 0.6) * (c.risky ? 0.02 : 1) + (cl.apart ? 1e6 : 0);
            if (cl.area > 0 && (!best || c.score > best.score)) best = c;
        }
        if (!best) return null;
        // Short, very safe cuts on the later sheets are drawn slowly for
        // double points.
        var slow = s.level > 1 && best.path.length <= 14 && slack(best.path, 0, ens, best.t - best.path.length / PEN, SLOWPEN) > 120;
        return { S: best.S, at: best.S, dir: best.d[2], path: best.path, route: routeTo(bfs, best.S), slow: slow, g: g };
    }

    function dirTo(a, b) {
        for (var k = 0; k < 4; k++) if (step(a, DIRS[k]) === b) return DIRS[k][2];
        return null;
    }

    function press(dir, a, b) {
        var o = { a: !!a, b: !!b };
        if (dir) o[dir] = true;
        return o;
    }

    // The quickest way off a line that turned dangerous: the safest of the
    // shortest routes from the pen to any claimed cell.
    function bail(s, mem) {
        var g = mem.plan ? mem.plan.g : snapshot(s), tr = s.trail, ens = enemies(s);
        var block = new Uint8Array(N), par = new Int32Array(N).fill(-1), q = [s.pen.i], h = 0, ends = [];
        for (var j = 0; j < tr.length; j++) block[tr[j]] = 1;
        block[s.pen.i] = 1;
        while (h < q.length && ends.length < 30) {
            var i = q[h++];
            for (var k = 0; k < 4; k++) {
                var n = step(i, DIRS[k]);
                if (n < 0 || block[n] || g[n] === TRAIL) continue;
                block[n] = 1; par[n] = i;
                if (claimed(g[n])) ends.push(n); else q.push(n);
            }
        }
        var best = null, bm = -1e9, sparks = sparkCells(s);
        ends.forEach(function (e) {
            var p = [];
            for (var c = e; c !== s.pen.i && c >= 0; c = par[c]) p.unshift(c);
            var m = slack(p, 0, ens, 0, PEN) - (nearSpark(e, sparks, 3) ? 1000 : 0);
            if (m > bm) { bm = m; best = p; }
        });
        return best;
    }

    function drawing(s, mem) {
        var p = mem.plan;
        if (!p || mem.phase !== 'draw') {
            mem.phase = 'draw';
            p = mem.plan = { path: bail(s, mem) || [], at: s.pen.i, g: snapshot(s), slow: false, bailed: 0 };
        }
        var k = p.path.indexOf(s.pen.i);
        if (k < 0 && s.pen.i !== p.at) { p.path = bail(s, mem) || []; p.at = s.pen.i; }
        // Danger check on what is left of the line (and the line behind).
        mem.tick = (mem.tick || 0) + 1;
        var ens = enemies(s), cur = s.trail.concat(p.path.slice(k + 1));
        if (mem.tick - (p.bailed || 0) > 8 && slack(cur, s.trail.length, ens, 0, p.slow ? SLOWPEN : PEN) < 0) {
            var b = bail(s, mem);
            p.bailed = mem.tick;
            if (b && slack(s.trail.concat(b), s.trail.length, ens, 0, PEN) > slack(cur, s.trail.length, ens, 0, PEN)) { p.path = b; p.at = s.pen.i; p.slow = false; k = -1; mem.why = 'bailed'; }
        }
        // About to close beside a crumb: close somewhere else, or hold
        // back a moment (well before the fuse lights).
        var end = p.path[p.path.length - 1];
        if (end !== undefined && p.path.length - k <= 4 && nearSpark(end, sparkCells(s), 2)) {
            var alt = bail(s, mem);
            if (alt && !nearSpark(alt[alt.length - 1], sparkCells(s), 3)) { p.path = alt; p.at = s.pen.i; k = -1; }
            else if ((mem.hold = (mem.hold || 0) + 1) < 15) return {};
        } else mem.hold = 0;
        var next = p.path[k + 1];
        return next === undefined ? {} : press(dirTo(s.pen.i, next), true, p.slow);
    }

    function threatened(s) {
        var sp = sparkCells(s);
        for (var j = 0; j < sp.length; j++) if (cellGap(sp[j], s.pen.i) <= 6) return true;
        return false;
    }

    // Step along the edge away from the nearest crumb.
    function flee(s) {
        var g = snapshot(s), sp = sparkCells(s), best = null, bd = -1;
        DIRS.forEach(function (d) {
            var n = step(s.pen.i, d);
            if (n < 0 || !isEdge(g, n)) return;
            var m = 1e9;
            sp.forEach(function (c) { m = Math.min(m, cellGap(c, n)); });
            if (m > bd) { bd = m; best = d[2]; }
        });
        return press(best);
    }

    function onEdge(s, mem) {
        mem.cool = (mem.cool || 0) - 1;
        var danger = threatened(s);
        if (danger && (!mem.plan || mem.plan.S !== s.pen.i)) {
            var e = plan(s, mem, 0);
            if (e) { mem.plan = e; mem.phase = 'ready'; mem.cool = 0; }
            else return flee(s);
        }
        if (!mem.plan || mem.phase === 'draw' || mem.cool <= -30) {
            mem.plan = null; mem.phase = 'idle';
            if (mem.cool > 0) return {};
            mem.plan = plan(s, mem, 70); mem.cool = mem.plan ? 0 : 10; mem.wait = 0;
            if (!mem.plan) return {};
            mem.phase = 'travel';
        }
        var p = mem.plan, k = p.route.indexOf(s.pen.i);
        if (k < 0) { mem.plan = null; return {}; }
        if (k < p.route.length - 1) return press(dirTo(s.pen.i, p.route[k + 1]));
        // At the start: go only while the cut is still safe from here.
        if (slack(p.path, 0, enemies(s), 0, p.slow ? SLOWPEN : PEN) >= 0) { mem.phase = 'draw'; return press(p.dir, true, p.slow); }
        mem.wait = (mem.wait || 0) + 1;
        if (mem.wait > 30) { mem.plan = null; mem.cool = 0; }
        return {};
    }

    return {
        play: function (s, G, mem) {
            if (s.pen.drawing) return drawing(s, mem);
            if (mem.phase === 'draw') { mem.plan = null; mem.phase = 'idle'; }
            return onEdge(s, mem);
        },
        // Negative control: start a line and stand still on it, so the fuse
        // burns down to the pen every time.
        fail: function (s) {
            if (s.pen.drawing) return {};
            for (var k = 0; k < 4; k++) {
                var n = step(s.pen.i, DIRS[k]);
                if (n >= 0 && s.grid[n] === OPEN) return press(DIRS[k][2], true);
            }
            return {};
        },
        budget: 420
    };
})()
