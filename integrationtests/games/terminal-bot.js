(function () {
    var G = SnoGame, results = [], idle = [];
    function input(i, s) {
        var p = s.p, target = null, nearest = Infinity, nest = null, nestDistance = Infinity, dx = 0, dy = 0;
        s.enemies.forEach(function (e) {
            if (e.dead || e.born > 0) return;
            var d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < nearest) { target = e; nearest = d; }
            if (e.kind === 'S' && d < nestDistance) { nest = e; nestDistance = d; }
            var reach = e.kind === 'I' ? 170 : 130;
            if (d < reach) { dx += (p.x - e.x) / Math.max(d, 1) * (reach - d) / reach * 3; dy += (p.y - e.y) / Math.max(d, 1) * (reach - d) / reach * 3; }
        });
        if (nest && nearest > 100 && nestDistance < 580) target = nest;
        s.ebul.forEach(function (b) {
            var d = Math.hypot(p.x - b.x, p.y - b.y);
            if (d < 85) { dx += (p.x - b.x) / Math.max(d, 1) * 1.6; dy += (p.y - b.y) / Math.max(d, 1) * 1.6; }
        });
        // Circle the arena, then give nearby hazards and solid directories room.
        var a = Math.atan2(p.y - 277, p.x - 480), radius = 170;
        dx += -Math.sin(a) * 0.8 + (480 + Math.cos(a) * radius - p.x) / 120;
        dy += Math.cos(a) * 0.8 + (277 + Math.sin(a) * radius - p.y) / 120;
        s.blocks.forEach(function (b) {
            var x = Math.max(b.x, Math.min(b.x + b.w, p.x)), y = Math.max(b.y, Math.min(b.y + b.h, p.y)), d = Math.hypot(p.x - x, p.y - y);
            if (d < 65 && d > 0) { dx += (p.x - x) / d * 3; dy += (p.y - y) / d * 3; }
        });
        return { codes: { KeyD: dx > 0.2, KeyA: dx < -0.2, KeyS: dy > 0.2, KeyW: dy < -0.2 },
            a: nearest < 70 && i % 60 === 0,
            mouse: { x: target ? target.x : p.x, y: target ? target.y : p.y, down: !!target } };
    }
    [1, 5, 10].forEach(function (level) {
        G.debug.start(level);
        for (var n = 0; n < 24000 && G.debug.state().screen === 'play'; n++) G.debug.step(1, function (i, s) { return input(n, s); });
        results.push({ level: level, screen: G.debug.state().screen, ticks: n, lives: G.lives });
        G.debug.start(level);
        for (n = 0; n < 24000 && G.debug.state().screen === 'play'; n++) G.debug.step(1, {});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: results, idle: idle };
})()
