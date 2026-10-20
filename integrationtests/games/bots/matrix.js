// Bullet Time campaign bot: shoots the nearest hostile in sight (the mouse
// on a desktop, FIRE and the game's own auto-aim on a phone), walks to a gun
// when the rounds run low, and picks each tick the step (or standing still)
// that keeps it furthest from incoming rounds, aimed agents and sentinels.
// Input only.
(function () {
    var T = 30, COLS = 32, WALL = 1, FLOOR = 0, RUN = 220;
    var STEPS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    function tile(x, y) { return Math.floor(y / T) * COLS + Math.floor(x / T); }

    function visible(s, G, e) {
        var p = s.p, n = Math.ceil(G.dist(p.x, p.y, e.x, e.y) / 8);
        for (var j = 1; j < n; j++) if (s.grid[tile(p.x + (e.x - p.x) * j / n, p.y + (e.y - p.y) * j / n)] === WALL) return false;
        return true;
    }

    // The next tile centre on the walking route to the goal.
    function routeStep(s, goal) {
        var start = tile(s.p.x, s.p.y), end = tile(goal.x, goal.y), queue = [end], flow = [], k, best = start;
        for (k = 0; k < s.grid.length; k++) flow.push(9999);
        flow[end] = 0;
        for (k = 0; k < queue.length; k++) {
            [1, -1, COLS, -COLS].forEach(function (d) {
                var t = queue[k] + d;
                if (s.grid[t] === FLOOR && flow[t] === 9999) { flow[t] = flow[queue[k]] + 1; queue.push(t); }
            });
        }
        [1, -1, COLS, -COLS].forEach(function (d) { if (flow[start + d] < flow[best]) best = start + d; });
        return best === start ? goal : { x: (best % COLS) * T + T / 2, y: Math.floor(best / COLS) * T + T / 2 };
    }

    // Where to walk: a gun when nearly out, else the nearest hostile when
    // none is in sight, else nowhere (stand and shoot).
    function goalFor(s, target, ammo) {
        var goal = null, nearest = Infinity;
        if (ammo < 3 || !target) {
            (ammo < 3 ? s.pickups : s.agents.concat(s.drones)).forEach(function (e) {
                var d = s.flow[tile(e.x, e.y)];
                if (d < nearest) { nearest = d; goal = e; }
            });
        }
        if (!goal && !ammo) goal = { x: s.lv.cache[0] * T + T / 2, y: s.lv.cache[1] * T + T / 2 };
        return goal;
    }

    // How bad it is to be at (x, y) after a step with velocity (vx, vy).
    function threat(s, G, x, y, vx, vy, still) {
        var p = s.p, cost = 0;
        s.bullets.forEach(function (b) {
            if (b.own === p) return;
            var k = still ? Math.max(s.ts, 0.25) : 1, rx = b.x - p.x, ry = b.y - p.y, bvx = b.vx * k - vx, bvy = b.vy * k - vy;
            var t = Math.max(0, Math.min(0.45, -(rx * bvx + ry * bvy) / (bvx * bvx + bvy * bvy || 1)));
            var d = Math.hypot(rx + bvx * t, ry + bvy * t);
            if (d < 50) cost += (50 - d) * 200;
        });
        s.drones.forEach(function (d) {
            var dist = G.dist(x, y, d.x, d.y);
            if (d.wake <= 0 && dist < 90) cost += (90 - dist) * 30;
        });
        s.agents.forEach(function (a) {
            if (a.wind <= 0) return;
            var lane = a.kind === 's' ? 70 : 25, along = (x - a.x) * Math.cos(a.face) + (y - a.y) * Math.sin(a.face);
            var cross = Math.abs((x - a.x) * Math.sin(a.face) - (y - a.y) * Math.cos(a.face));
            if (along > 0 && cross < lane) cost += (lane - cross) * 12;
        });
        return cost;
    }

    function chooseStep(s, G, goal) {
        var p = s.p, to = goal ? routeStep(s, goal) : null, chosen = {}, min = Infinity;
        STEPS.forEach(function (st) {
            var len = Math.hypot(st[0], st[1]) || 1, vx = st[0] / len * RUN, vy = st[1] / len * RUN;
            var body = { x: p.x - 8, y: p.y - 8, w: 16, h: 16, vx: vx, vy: vy };
            G.tileMove(body, 0.22, T, s.solid);
            var x = body.x + 8, y = body.y + 8;
            var cost = (to ? G.dist(x, y, to.x, to.y) : len * 8) + threat(s, G, x, y, vx, vy, !st[0] && !st[1]);
            if (cost < min) { min = cost; chosen = { left: st[0] < 0, right: st[0] > 0, up: st[1] < 0, down: st[1] > 0 }; }
        });
        return chosen;
    }

    function play(s, G) {
        var p = s.p, ammo = s.ammo.pistol + s.ammo.shotgun, target = null, best = Infinity;
        s.agents.concat(s.drones).forEach(function (e) {
            var d = G.dist(p.x, p.y, e.x, e.y);
            if (d < best && visible(s, G, e)) { target = e; best = d; }
        });
        var input = chooseStep(s, G, goalFor(s, target, ammo));
        input.a = !!(target && ammo && s.fireT <= 0 && (s.gun !== 'shotgun' || best < 300));
        // The shotgun is for close range: swap back to the pistol beyond it.
        if (s.gun === 'shotgun' && best >= 300 && s.ammo.pistol) input.b = true;
        if (!s.touch && target) { input.mouse = { x: target.x, y: target.y, down: input.a }; input.a = false; }
        return input;
    }

    return { play: play, budget: 300 };
})()
