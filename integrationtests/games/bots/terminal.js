// kill -9 campaign bot. Movement: a steering force (circle the arena, keep
// away from processes, directories and the arena edge) picks the preferred
// direction, and each of the nine stick positions is then scored against
// where every bullet and process will be over the next half second, so the
// `@` sidesteps a fan or a ring instead of averaging two pushes into none.
// Aim: the mouse leads the nearest process (a [fork] nest when nothing is
// close). Bomb: A when a process is in reach. Ordinary input only.
(function () {
    var DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [0.71, -0.71], [-0.71, 0.71], [-0.71, -0.71]];
    var SPEED = 235, L = 17, R = 943, T = 47, B = 507;

    function nearestTarget(s) {
        var p = s.p, best = null, bestD = Infinity, nest = null, nestD = Infinity, i, e, d;
        for (i = 0; i < s.enemies.length; i++) {
            e = s.enemies[i];
            if (e.dead || e.born > 0) continue;
            d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bestD) { best = e; bestD = d; }
            if (e.kind === 'S' && d < nestD) { nest = e; nestD = d; }
        }
        return { e: nest && bestD > 100 && nestD < 580 ? nest : best, d: bestD };
    }

    // Where the player would like to drift, ignoring bullets.
    function steering(s) {
        var p = s.p, dx = 0, dy = 0, i, e, d, reach;
        for (i = 0; i < s.enemies.length; i++) {
            e = s.enemies[i];
            d = Math.hypot(e.x - p.x, e.y - p.y);
            reach = e.kind === 'I' ? 220 : 130;
            if (d < reach) { dx += (p.x - e.x) / Math.max(d, 1) * (reach - d) / reach * 3; dy += (p.y - e.y) / Math.max(d, 1) * (reach - d) / reach * 3; }
        }
        var a = Math.atan2(p.y - 277, p.x - 480);
        dx += -Math.sin(a) * 0.8 + (480 + Math.cos(a) * 170 - p.x) / 120;
        dy += Math.cos(a) * 0.8 + (277 + Math.sin(a) * 170 - p.y) / 120;
        if (p.x < 90) dx += (90 - p.x) / 30; else if (p.x > 870) dx -= (p.x - 870) / 30;
        if (p.y < 100) dy += (100 - p.y) / 30; else if (p.y > 450) dy -= (p.y - 450) / 30;
        for (i = 0; i < s.blocks.length; i++) {
            var b = s.blocks[i], x = Math.max(b.x, Math.min(b.x + b.w, p.x)), y = Math.max(b.y, Math.min(b.y + b.h, p.y));
            d = Math.hypot(p.x - x, p.y - y);
            if (d < 65 && d > 0) { dx += (p.x - x) / d * 3; dy += (p.y - y) / d * 3; }
        }
        var n = Math.hypot(dx, dy);
        return n > 0.2 ? { x: dx / n, y: dy / n } : { x: 0, y: 0 };
    }

    function inBlock(s, x, y) {
        for (var i = 0; i < s.blocks.length; i++) {
            var b = s.blocks[i];
            if (x > b.x - 9 && x < b.x + b.w + 9 && y > b.y - 9 && y < b.y + b.h + 9) return true;
        }
        return false;
    }

    // A pipe that is taking aim will dash about 460 px along its drawn line:
    // standing on that line when it goes is a hit.
    function dashCost(e, x, y) {
        var ex = e.x + e.dx * 460, ey = e.y + e.dy * 460, vx = ex - e.x, vy = ey - e.y;
        var u = Math.max(0, Math.min(1, ((x - e.x) * vx + (y - e.y) * vy) / (vx * vx + vy * vy)));
        var d = Math.hypot(e.x + vx * u - x, e.y + vy * u - y) - e.r - 9;
        return d < 16 ? 16 - d : 0;
    }

    // Whether walking this way for a quarter of a second stays clear of the
    // arena edge and the directories; if not, the `@` would stand still.
    function walkable(s, dir) {
        var x = s.p.x + dir[0] * SPEED * 0.25, y = s.p.y + dir[1] * SPEED * 0.25;
        return x >= L && x <= R && y >= T && y <= B && !inBlock(s, x, y);
    }

    // Closest approach of a bullet to the walking `@` within the next 0.6 s
    // (constant velocities, solved exactly so a fast pass is never missed).
    function bulletCost(b, p, vx, vy) {
        var rx = b.x - p.x, ry = b.y - p.y, wx = b.vx - vx, wy = b.vy - vy, ww = wx * wx + wy * wy || 1;
        var tm = Math.max(0, Math.min(0.6, -(rx * wx + ry * wy) / ww));
        var d = Math.hypot(rx + wx * tm, ry + wy * tm);
        return d < 24 ? (24 - d) * (1.2 - tm) * 3 : 0;
    }

    // How close this stick position comes to being hit in the next half second.
    function danger(s, dir) {
        var p = s.p, go = walkable(s, dir) ? SPEED : 0, vx = dir[0] * go, vy = dir[1] * go, cost = 0, k, i, t, x, y, e, d;
        if (!go && (dir[0] || dir[1])) cost += 4;
        for (i = 0; i < s.ebul.length; i++) cost += bulletCost(s.ebul[i], p, vx, vy);
        for (k = 1; k <= 3; k++) {
            t = k * 0.15; x = p.x + vx * t; y = p.y + vy * t;
            for (i = 0; i < s.enemies.length; i++) {
                e = s.enemies[i];
                if (e.born > 0.3) continue;
                if (e.kind === '>' && (e.mode === 'dash' || (e.mode === 'aim' && e.mt < 0.6))) cost += dashCost(e, x, y) * 0.5;
                d = Math.hypot(e.x + e.vx * t - x, e.y + e.vy * t - y) - e.r - 9;
                if (d < 14) cost += (14 - d) * (4 - k);
            }
        }
        return cost;
    }

    // The stick position kept from the last tick gets a head start: the
    // `@` has inertia, and flipping between two near-equal escapes every
    // tick leaves it standing in the bullet's way.
    function move(s, mem) {
        var want = steering(s), best = 0, bestCost = Infinity, i, c;
        for (i = 0; i < DIRS.length; i++) {
            c = danger(s, DIRS[i]) * 3 - (DIRS[i][0] * want.x + DIRS[i][1] * want.y) - (i === mem.dir ? 1.5 : 0);
            if (c < bestCost) { bestCost = c; best = i; }
        }
        mem.dir = best;
        return DIRS[best];
    }

    return {
        play: function (s, G, mem) {
            var p = s.p, dir = move(s, mem), tg = nearestTarget(s), e = tg.e;
            mem.t = (mem.t || 0) + 1;
            // Lead the target by the shot's flight time (shots fly 640 px/s).
            var lead = e ? Math.hypot(e.x - p.x, e.y - p.y) / 640 : 0;
            return {
                codes: { KeyD: dir[0] > 0.3, KeyA: dir[0] < -0.3, KeyS: dir[1] > 0.3, KeyW: dir[1] < -0.3 },
                a: tg.d < 70 && mem.t % 60 === 0,
                mouse: { x: e ? e.x + e.vx * lead : p.x, y: e ? e.y + e.vy * lead : p.y, down: !!e }
            };
        },
        // Idle (the default) loses: the swarm walks into the `@`.
        budget: 300
    };
})()
