(function () {
    var G = SnoGame, results = [], idle = [];
    function input(s, mem) {
        var p = s.p, target = null, nearest = Infinity, nest = null, nestD = Infinity, dx = 0, dy = 0, i, e, d, reach;
        mem.t = (mem.t || 0) + 1;
        for (i = 0; i < s.enemies.length; i++) {
            e = s.enemies[i];
            if (e.dead || e.born > 0) continue;
            d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < nearest) { target = e; nearest = d; }
            if (e.kind === 'S' && d < nestD) { nest = e; nestD = d; }
            reach = e.kind === 'I' ? 220 : 130;
            if (d < reach) { dx += (p.x - e.x) / Math.max(d, 1) * (reach - d) / reach * 3; dy += (p.y - e.y) / Math.max(d, 1) * (reach - d) / reach * 3; }
        }
        if (nest && nearest > 100 && nestD < 580) target = nest;
        // Bullets: step aside from the closest point of each one's path over
        // the next 0.7 s, harder the sooner and nearer it passes.
        for (i = 0; i < s.ebul.length; i++) {
            e = s.ebul[i];
            var rx = p.x - e.x, ry = p.y - e.y, vv = e.vx * e.vx + e.vy * e.vy || 1;
            var tc = Math.max(0, Math.min(0.7, (rx * e.vx + ry * e.vy) / vv));
            var cx = p.x - (e.x + e.vx * tc), cy = p.y - (e.y + e.vy * tc);
            d = Math.hypot(cx, cy);
            if (d < 40) { dx += cx / Math.max(d, 1) * 2.4 * (1 - tc); dy += cy / Math.max(d, 1) * 2.4 * (1 - tc); }
        }
        // Circle the arena, then give solid directories room.
        var a = Math.atan2(p.y - 277, p.x - 480), radius = 170;
        dx += -Math.sin(a) * 0.8 + (480 + Math.cos(a) * radius - p.x) / 120;
        dy += Math.cos(a) * 0.8 + (277 + Math.sin(a) * radius - p.y) / 120;
        // Never get pinned against the arena edge (init corners players).
        if (p.x < 90) dx += (90 - p.x) / 30; else if (p.x > 870) dx -= (p.x - 870) / 30;
        if (p.y < 100) dy += (100 - p.y) / 30; else if (p.y > 450) dy -= (p.y - 450) / 30;
        for (i = 0; i < s.blocks.length; i++) {
            var b = s.blocks[i], x = Math.max(b.x, Math.min(b.x + b.w, p.x)), y = Math.max(b.y, Math.min(b.y + b.h, p.y));
            d = Math.hypot(p.x - x, p.y - y);
            if (d < 65 && d > 0) { dx += (p.x - x) / d * 3; dy += (p.y - y) / d * 3; }
        }
        // Lead the target by the shot's flight time (shots fly 640 px/s).
        var lead = target ? Math.hypot(target.x - p.x, target.y - p.y) / 640 : 0;
        return {
            codes: { KeyD: dx > 0.2, KeyA: dx < -0.2, KeyS: dy > 0.2, KeyW: dy < -0.2 },
            a: nearest < 70 && mem.t % 60 === 0,
            mouse: { x: target ? target.x + target.vx * lead : p.x, y: target ? target.y + target.vy * lead : p.y, down: !!target }
        };
    }
    [1, 2, 3].forEach(function (level) {
        var mem = {};
        G.debug.start(level);
        for (var n = 0; n < 24000 && G.debug.state().screen === 'play'; n++) G.debug.step(1, function (i, s) { return input(s, mem); });
        results.push({ level: level, screen: G.debug.state().screen, ticks: n, lives: G.lives });
        G.debug.start(level);
        for (n = 0; n < 24000 && G.debug.state().screen === 'play'; n++) G.debug.step(1, {});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: results, idle: idle };
})()
