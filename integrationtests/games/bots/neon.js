// Light Cycles campaign bot: once per cell it weighs straight, left and right
// by the share of the arena it would reach before any rider (counting the
// ring that collapses next as already gone), keeps out of the cells a
// rider's head can reach next, and among equal ways hugs the walls so its
// room fills up tightly. It boosts down long empty lanes when no rider is
// near. Input only.
(function () {
    var COLS = 80, ROWS = 42, MAX_RING = 15;
    var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], KEYS = ['right', 'down', 'left', 'up'];

    function ringOf(x, y) { return Math.min(x, y, COLS - 1 - x, ROWS - 1 - y); }

    // A plain copy of the arena: 1 for every cell that is or will soon be a wall.
    function snapshot(s) {
        var grid = new Uint8Array(COLS * ROWS), shrink = s.cfg.shrink && s.ring < MAX_RING;
        for (var i = 0; i < grid.length; i++) {
            grid[i] = s.grid[i] || (shrink && ringOf(i % COLS, Math.floor(i / COLS)) <= s.ring) ? 1 : 0;
        }
        return grid;
    }

    function free(grid, x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS && !grid[y * COLS + x]; }

    // Breadth-first distances from the given cells over free cells.
    function distances(grid, starts) {
        var dist = new Int16Array(COLS * ROWS).fill(-1), queue = starts.slice(), n = 0;
        starts.forEach(function (i) { dist[i] = 0; });
        while (n < queue.length) {
            var i = queue[n++], cx = i % COLS, cy = (i - cx) / COLS;
            for (var d = 0; d < 4; d++) {
                var nx = cx + DX[d], ny = cy + DY[d], j = ny * COLS + nx;
                if (free(grid, nx, ny) && dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
            }
        }
        return dist;
    }

    // The cells the player reaches before any rider does (a Voronoi split of
    // the arena); once the riders are walled off that is simply its room.
    function territory(grid, at, riders) {
        var mine = distances(grid, [at]), theirs = distances(grid, riders), n = 0;
        for (var i = 0; i < mine.length; i++) if (mine[i] > 0 && (theirs[i] < 0 || mine[i] < theirs[i])) n++;
        return n;
    }

    // The cells a living rider's head can step into next (head-ons are a draw
    // at best, and a boosting rider can get there first).
    function nearHeads(s) {
        var hot = {};
        s.cycles.forEach(function (c) {
            if (c === s.me || !c.alive) return;
            for (var d = 0; d < 4; d++) if (d !== (c.dir + 2) % 4) hot[(c.y + DY[d]) * COLS + c.x + DX[d]] = true;
        });
        return hot;
    }

    function walls(grid, x, y) {
        var n = 0;
        for (var d = 0; d < 4; d++) if (!free(grid, x + DX[d], y + DY[d])) n++;
        return n;
    }

    function choose(s) {
        var me = s.me, grid = snapshot(s), hot = nearHeads(s), best = me.dir, top = -Infinity;
        var riders = s.cycles.filter(function (c) { return c !== me && c.alive; }).map(function (c) { return c.y * COLS + c.x; });
        [0, 1, 3].forEach(function (rel) {
            var d = (me.dir + rel) % 4, x = me.x + DX[d], y = me.y + DY[d], at = y * COLS + x;
            if (!free(grid, x, y)) return;
            grid[at] = 1;
            var score = territory(grid, at, riders) * 10 + walls(grid, x, y) * 3 + (rel ? 0 : 2) - (hot[at] ? 4000 : 0);
            grid[at] = 0;
            if (score > top) { top = score; best = d; }
        });
        return best;
    }

    function lane(s, grid) {
        var me = s.me, n = 0;
        while (n < 30 && free(grid, me.x + DX[me.dir] * (n + 1), me.y + DY[me.dir] * (n + 1))) n++;
        return n;
    }

    function play(s, G, mem) {
        var me = s.me, input = {};
        if (s.phase !== 'run' || !me.alive) return input;
        var at = me.y * COLS + me.x;
        // One decision per cell, on the first tick in it: the turn is queued
        // for the step out of this cell.
        if (mem.at !== at) {
            mem.at = at;
            var d = choose(s);
            if (d !== me.dir) input[KEYS[d]] = true;
            var alone = s.cycles.every(function (c) { return c === me || !c.alive || Math.abs(c.x - me.x) + Math.abs(c.y - me.y) > 16; });
            mem.boost = d === me.dir && alone && me.charge > 0.3 && lane(s, snapshot(s)) >= 25;
        }
        input.a = mem.boost;
        return input;
    }

    return { play: play, budget: 300 };
})()
