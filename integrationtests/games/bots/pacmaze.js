// Neon Maze campaign bot. It plans like a careful player: a shortest-path
// search over the open tiles (shutters count only while open, tunnels and
// warps wrap round) where tiles near a hunting ghost cost more the closer
// they are, heading for the nearest dot. A power pellet is worth a detour,
// and while the ghosts are blue a nearby one becomes the target. It sends
// one direction at a time, like the pad, and finishes a tile before it
// reverses so the route stays on the grid.
({
    play: function (s, G, mem) {
        if (s.dying > 0 || s.ready > 0 || s.hold > 0) return {};
        var COLS = 32, ROWS = 17;
        var DIRS = [[0, -1, 'up'], [-1, 0, 'left'], [0, 1, 'down'], [1, 0, 'right']];
        var p = s.pl, x = p.cx, y = p.cy;
        // Once under way, plan from the tile the player is entering.
        if (p.p > 0.13) { x = (x + p.dx + COLS) % COLS; y = (y + p.dy + ROWS) % ROWS; }
        function open(c, r) {
            var ch = s.grid[r][c];
            if (ch === '#' || ch === 'H' || ch === '=') return false;
            return (ch !== 'g' && ch !== 'j') || s.gateAt[r * COLS + c].open;
        }
        var hunters = s.ghosts.filter(function (g) { return g.state === 'roam' && !(g.scared && s.fright > 1.2); });
        var prey = s.fright > 2 ? s.ghosts.filter(function (g) { return g.scared && g.state === 'roam'; }) : [];
        function gap(a, b, n) { var d = Math.abs(a - b); return Math.min(d, n - d); }
        function danger(c, r) {
            var cost = 0;
            hunters.forEach(function (g) {
                var d = Math.hypot(gap(c, g.x, COLS), gap(r, g.y, ROWS));
                if (d < 4) cost += (4 - d) * (4 - d) * 6;
            });
            return cost;
        }
        function value(at) {
            var c = at % COLS, r = Math.floor(at / COLS), ch = s.grid[r][c];
            var hit = prey.some(function (g) { return gap(c, Math.round(g.x), COLS) + gap(r, Math.round(g.y), ROWS) === 0; });
            if (hit) return -8;
            if (ch === 'o') return s.fright < 1.2 ? -6 : 0;
            return ch === '.' ? 0 : null;
        }
        // Dijkstra with a small binary heap of [cost, tile].
        var start = y * COLS + x, dist = [], first = [], heap = [[0, start]], goal = -1, best = Infinity;
        dist[start] = 0;
        function push(item) {
            heap.push(item);
            for (var i = heap.length - 1; i > 0;) {
                var up = (i - 1) >> 1;
                if (heap[up][0] <= heap[i][0]) break;
                var t = heap[up]; heap[up] = heap[i]; heap[i] = t; i = up;
            }
        }
        function pop() {
            var top = heap[0], last = heap.pop();
            if (heap.length) {
                heap[0] = last;
                for (var i = 0; ;) {
                    var l = 2 * i + 1, r = l + 1, m = i;
                    if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                    if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                    if (m === i) break;
                    var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
                }
            }
            return top;
        }
        while (heap.length) {
            var item = pop(), d = item[0], at = item[1];
            if (d > dist[at]) continue;
            if (d > best + 8) break;
            var v = at === start ? null : value(at);
            if (v !== null && d + v < best) { best = d + v; goal = at; }
            var c = at % COLS, r = Math.floor(at / COLS);
            for (var k = 0; k < 4; k++) {
                var nc = (c + DIRS[k][0] + COLS) % COLS, nr = (r + DIRS[k][1] + ROWS) % ROWS, to = nr * COLS + nc;
                if (!open(nc, nr)) continue;
                var nd = d + 1 + danger(nc, nr);
                if (dist[to] === undefined || nd < dist[to]) { dist[to] = nd; first[to] = at === start ? k : first[at]; push([nd, to]); }
            }
        }
        if (goal < 0) return {};
        var dir = DIRS[first[goal]], input = {};
        // Halfway into a tile, finish it before turning back.
        if (p.p > 0.13 && dir[0] === -p.dx && dir[1] === -p.dy) {
            input[DIRS.filter(function (q) { return q[0] === p.dx && q[1] === p.dy; })[0][2]] = true;
            return input;
        }
        input[dir[2]] = true;
        return input;
    },
    budget: 300
})
