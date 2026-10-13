(function () {
    var G = SnoGame, wins = [];
    for (var level of [1, 5, 10]) {
        G.debug.start(level);
        var ticks = 0, bombHeld = false;
        while (ticks < 30000 && G.debug.state().screen === 'play') {
            var s = G.debug.s(), p = s.p, tx = 480, ty = 415;
            var target = s.boss && !s.boss.dead ? s.boss :
                s.enemies.filter(function (e) { return !e.gone && e.y > 30 && e.y < 320; })
                    .sort(function (a, b) { return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); })[0];
            if (target) tx = target.x;
            var orb = s.drops.filter(function (o) { return Math.hypot(o.x - p.x, o.y - p.y) < 160; })[0];
            if (orb) { tx = orb.x; ty = orb.y; }
            var best, score = Infinity, danger = Infinity;
            for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
                var speed = (s.touch ? 340 : 170) / (dx && dy ? Math.SQRT2 : 1);
                var risk = 0, clearance = Infinity;
                for (var t of [0.08, 0.2, 0.4]) {
                    var x = G.clamp(p.x + dx * speed * t, 14, 946), y = G.clamp(p.y + dy * speed * t, 44, 526);
                    for (var b of s.bullets) {
                        if (Math.abs(b.x - p.x) > 220 || Math.abs(b.y - p.y) > 220) continue;
                        var d = Math.hypot(x - b.x - b.vx * t, y - b.y - b.vy * t) - b.r * .6 - 3;
                        clearance = Math.min(clearance, d);
                        risk += Math.max(0, 35 - d) * Math.max(0, 35 - d) * (p.inv > .5 ? .002 : 4);
                    }
                    for (var lane of s.lanes) if (lane.t + t >= 1 && y > lane.y) {
                        var distance = Math.abs(x - lane.x) - 16;
                        clearance = Math.min(clearance, distance);
                        risk += Math.max(0, 50 - distance) * Math.max(0, 50 - distance) * 4;
                    }
                    for (var e of s.enemies) if (e.y > 30 && !e.gone) {
                        risk += Math.max(0, 40 - Math.hypot(x - e.x, y - e.y)) ** 2 * 4;
                    }
                }
                var x = G.clamp(p.x + dx * speed * .4, 14, 946), y = G.clamp(p.y + dy * speed * .4, 44, 526);
                var value = risk + Math.abs(x - tx) * .6 + Math.abs(y - ty) * .9;
                if (value < score) { score = value; best = { dx: dx, dy: dy }; danger = clearance; }
            }
            var bomb = !bombHeld && s.bombs > 0 && s.bombT <= 0 && p.inv < .4 && danger < 12;
            G.debug.step(1, { left: best.dx < 0, right: best.dx > 0, up: best.dy < 0, down: best.dy > 0,
                a: !s.touch, b: bomb });
            bombHeld = bomb; ticks++;
        }
        wins.push({ level: level, screen: G.debug.state().screen, ticks: ticks, lives: G.lives });
    }
    G.debug.start(10); G.debug.step(30000, {});
    return { wins: wins, idle: G.debug.state().screen, errors: G.debug.errors.slice() };
})()
