// Plasma Storm campaign bot: each tick it scores the nine stick directions
// by how close they would bring the ship to the bullets, charging lanes and
// enemy hulls in the next 0.4 s, plus how far they leave it from its goal
// (under the target's column, or on a nearby orb, so weapons get upgraded).
// It holds fire on a desktop (the phone fires by itself), bombs only when no
// move keeps it clear, and grazes as a side effect of threading close.
({
    play: function (s, G, mem) {
        var p = s.p, tx = 480, ty = 415;
        var target = s.boss && !s.boss.dead ? s.boss :
            s.enemies.filter(function (e) { return !e.gone && e.y > 30 && e.y < 320; })
                .sort(function (a, b) { return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); })[0];
        if (target) tx = target.x;
        var orb = s.drops.filter(function (o) { return Math.hypot(o.x - p.x, o.y - p.y) < 160; })[0];
        if (orb) { tx = orb.x; ty = orb.y; }
        var best = { dx: 0, dy: 0 }, score = Infinity, danger = Infinity;
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
            // Desktop: SPACE is held, so the ship flies at focus speed.
            var speed = (s.touch ? 340 : 170) / (dx && dy ? Math.SQRT2 : 1);
            var risk = 0, clearance = Infinity;
            [0.08, 0.2, 0.4].forEach(function (t) {
                var x = G.clamp(p.x + dx * speed * t, 14, 946), y = G.clamp(p.y + dy * speed * t, 44, 526);
                s.bullets.forEach(function (b) {
                    if (Math.abs(b.x - p.x) > 220 || Math.abs(b.y - p.y) > 220) return;
                    var d = Math.hypot(x - b.x - b.vx * t, y - b.y - b.vy * t) - b.r * 0.6 - 3;
                    clearance = Math.min(clearance, d);
                    risk += Math.pow(Math.max(0, 35 - d), 2) * (p.inv > 0.5 ? 0.002 : 4);
                });
                s.lanes.forEach(function (lane) {
                    if (lane.t + t < 1 || y <= lane.y) return;
                    var d = Math.abs(x - lane.x) - 16;
                    clearance = Math.min(clearance, d);
                    risk += Math.pow(Math.max(0, 50 - d), 2) * 4;
                });
                s.enemies.forEach(function (e) {
                    if (e.y > 30 && !e.gone) risk += Math.pow(Math.max(0, 40 - Math.hypot(x - e.x, y - e.y)), 2) * 4;
                });
            });
            var fx = G.clamp(p.x + dx * speed * 0.4, 14, 946), fy = G.clamp(p.y + dy * speed * 0.4, 44, 526);
            var value = risk + Math.abs(fx - tx) * (s.boss ? 2 : 0.6) + Math.abs(fy - ty) * 0.9;
            if (value < score) { score = value; best = { dx: dx, dy: dy }; danger = clearance; }
        }
        // A bomb is a fresh press of B: release it for a tick after each one.
        var bomb = !mem.bombHeld && s.bombs > 0 && s.bombT <= 0 && p.inv < 0.4 && danger < 12;
        mem.bombHeld = bomb;
        return { left: best.dx < 0, right: best.dx > 0, up: best.dy < 0, down: best.dy > 0, a: !s.touch, b: bomb };
    },
    budget: 420
})
