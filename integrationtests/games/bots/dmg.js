// SERPENT.GB campaign bot. Once the head is a quarter into a cell it plans
// from the cell it is entering: a breadth-first search over (cell, heading)
// that knows the snake cannot turn on ice, wraps through the tunnels and
// times its own body (a body cell is free once the tail has passed it). The
// rival's body is a wall and the cells beside its head are kept clear for
// the next two steps. A route is taken only if the snake could keep going
// from its first cell for as long as it is long (so the body it has now
// can never close it in); otherwise the bot takes the longest way out. It presses one direction at a time, like the pad, and releases the
// keys at the start of every cell so each turn is a fresh press.
(function () {
    var COLS = 32, ROWS = 17, WALL = 1, ROCK = 2, ICE = 3;
    var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], KEYS = ['up', 'right', 'down', 'left'];

    function wrap(x, y) { return ((y + ROWS) % ROWS) * COLS + (x + COLS) % COLS; }

    // freeAt[i]: the first arrival (1 = reaching the cell being entered) at
    // which cell i can be entered.
    function timing(s) {
        var sn = s.sn, n = sn.body.length, freeAt = new Array(COLS * ROWS).fill(0);
        for (var i = 0; i < s.grid.length; i++) if (s.grid[i] === WALL || s.grid[i] === ROCK) freeAt[i] = Infinity;
        sn.body.forEach(function (b, k) {
            var at = wrap(b.x, b.y);
            freeAt[at] = Math.max(freeAt[at], n - k + sn.grow);
        });
        var rv = s.rv;
        if (rv && !rv.wait && rv.body.length) {
            rv.body.forEach(function (b) { freeAt[wrap(b.x, b.y)] = Infinity; });
            var h = rv.body[0];
            for (var d = 0; d < 4; d++) {
                var at = wrap(h.x + DX[d], h.y + DY[d]);
                freeAt[at] = Math.max(freeAt[at], 3);
            }
        }
        return freeAt;
    }

    function moves(s, cell, d) {
        if (s.grid[cell] === ICE) return [d];
        return [d, (d + 1) % 4, (d + 3) % 4];
    }

    // Shortest timed route from (start, d) to any apple; returns the first
    // heading taken at start, or -1.
    function route(s, freeAt, start, d, apples) {
        var seen = {}, queue = [[start, d, 1, -1]], n = 0;
        seen[start * 4 + d] = true;
        while (n < queue.length) {
            var q = queue[n++], x = q[0] % COLS, y = Math.floor(q[0] / COLS);
            if (q[3] >= 0 && apples[q[0]]) return q[3];
            var opts = moves(s, q[0], q[1]);
            for (var k = 0; k < opts.length; k++) {
                var nd = opts[k], to = wrap(x + DX[nd], y + DY[nd]), key = to * 4 + nd;
                if (seen[key] || freeAt[to] >= q[2] + 1) continue;
                seen[key] = true;
                queue.push([to, nd, q[2] + 1, q[3] < 0 ? nd : q[3]]);
            }
        }
        return -1;
    }

    // How many arrivals the snake can keep going for from (cell, d) at
    // arrival t, capped: a route that lasts as long as the snake is long
    // has left the whole present body behind, so it is not a trap.
    function room(s, freeAt, cell, d, t, cap) {
        var seen = {}, queue = [[cell, d, t]], n = 0, deepest = t;
        seen[cell * 4 + d] = true;
        while (n < queue.length && deepest - t < cap) {
            var q = queue[n++], x = q[0] % COLS, y = Math.floor(q[0] / COLS);
            deepest = Math.max(deepest, q[2]);
            var opts = moves(s, q[0], q[1]);
            for (var k = 0; k < opts.length; k++) {
                var nd = opts[k], to = wrap(x + DX[nd], y + DY[nd]), key = to * 4 + nd;
                if (seen[key] || freeAt[to] >= q[2] + 1) continue;
                seen[key] = true;
                queue.push([to, nd, q[2] + 1]);
            }
        }
        return deepest - t;
    }

    function decide(s, bold) {
        var sn = s.sn, h = sn.body[0], start = wrap(h.x + DX[sn.d], h.y + DY[sn.d]);
        var freeAt = timing(s), apples = {}, need = sn.body.length + sn.grow + 2;
        // The cell being entered becomes the neck: the search may not
        // loop back through it until the tail has passed.
        freeAt[start] = Math.max(freeAt[start], sn.body.length + sn.grow + 1);
        s.apples.forEach(function (a) { apples[wrap(a.x, a.y)] = true; });
        var opts = moves(s, start, sn.d), sx = start % COLS, sy = Math.floor(start / COLS);
        var best = sn.d, most = -1, go = bold ? -1 : route(s, freeAt, start, sn.d, apples);
        for (var k = 0; k < opts.length; k++) {
            var d = opts[k], to = wrap(sx + DX[d], sy + DY[d]);
            if (freeAt[to] >= 2) continue;
            var r = room(s, freeAt, to, d, 2, need);
            if (d === go && r >= need) return d;
            // A stalled bot wanders: among roomy ways it picks at random,
            // which breaks a loop round its own body.
            if (bold && r >= need) r += Math.random() * 20;
            if (r > most) { most = r; best = d; }
        }
        return best;
    }

    return {
        play: function (s, G, mem) {
            var sn = s.sn;
            // Ten seconds without an apple means it is circling its own body
            // next to an apple it dares not reach: it wanders for three
            // seconds to lay its body out differently, then tries again.
            if (mem.eaten !== s.eaten) { mem.eaten = s.eaten; mem.since = s.time; }
            if (s.time - mem.since > 13) mem.since = s.time;
            if (sn.dead || s.ready > 0 || sn.p < 0.25) return {};
            var d = decide(s, s.time - mem.since > 10), out = {};
            if (d !== sn.d) out[KEYS[d]] = true;
            return out;
        },
        // Never steers: the snake runs into the hedge until the lives are gone.
        fail: function () { return {}; },
        budget: 300
    };
})()
