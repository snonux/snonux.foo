// Atomic Defense campaign bot: a gunner with a mouse. It takes the lowest
// warhead that no blast or shot in flight already covers, leads it by the
// counter-missile's flight time from the nearest battery and clicks there;
// with the sky clear it goes for saucers, and for the mothership's hull
// once its shield is down. One click every quarter second, as a person
// would, so ammunition runs short when it wastes shots.
({
    play: function (s, G, mem) {
        var target = null;
        if (mem.wait > 0) mem.wait--;
        var threats = s.foes.slice().sort(function (a, b) { return b.y - a.y; });
        for (var i = 0; i < threats.length && !target; i++) {
            var f = threats[i];
            if (s.blasts.some(function (b) { return !b.hostile && G.dist(f.x, f.y, b.x, b.y) < b.max + 10; })) continue;
            if (s.shots.some(function (sh) { return G.dist(f.x, f.y, sh.tx, sh.ty) < 65; })) continue;
            var travel = G.dist(f.x, f.y, f.tx < 300 ? 70 : f.tx > 660 ? 890 : 480, 472) / 760 + 0.2;
            target = { x: f.x + f.vx * travel, y: f.y + f.vy * travel };
        }
        if (!target && s.saucers.length) target = { x: s.saucers[0].x + s.saucers[0].vx * 0.5, y: s.saucers[0].y };
        if (!target && s.boss && s.boss.volley && s.boss.hurt < 0.25) {
            target = { x: 480 + 330 * Math.sin((s.boss.t + 0.5) * 0.4), y: 96 };
        }
        // The click must be released between shots: hold it for one tick.
        var shoot = !!target && !(mem.wait > 0);
        if (shoot) mem.wait = 14;
        return { mouse: { x: target ? target.x : s.cur.x, y: target ? target.y : s.cur.y, down: shoot } };
    },
    budget: 400
})
