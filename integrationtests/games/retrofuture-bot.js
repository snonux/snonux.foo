(function () {
    var G = SnoGame, wins = [];
    for (var level of [1, 5, 10]) {
        G.debug.start(level);
        var ticks = 0, wait = 0;
        while (ticks++ < 40000 && G.debug.state().screen === 'play') {
            var s = G.debug.s(), target = null;
            var threats = s.foes.slice().sort(function (a, b) { return b.y - a.y; });
            for (var f of threats) {
                if (s.blasts.some(function (b) { return !b.hostile && G.dist(f.x, f.y, b.x, b.y) < b.max + 10; })) continue;
                if (s.shots.some(function (sh) { return G.dist(f.x, f.y, sh.tx, sh.ty) < 65; })) continue;
                var travel = G.dist(f.x, f.y, f.tx < 300 ? 70 : f.tx > 660 ? 890 : 480, 472) / 760 + .2;
                target = { x: f.x + f.vx * travel, y: f.y + f.vy * travel }; break;
            }
            if (!target && s.saucers.length) {
                var sc = s.saucers[0]; target = { x: sc.x + sc.vx * .5, y: sc.y };
            }
            if (!target && s.boss && s.boss.volley && s.boss.hurt < .25) {
                var m = s.boss;
                target = { x: 480 + 330 * Math.sin((m.t + .5) * .4), y: 96 };
            }
            var shoot = target && wait <= 0;
            G.debug.step(1, { mouse: { x: target ? target.x : s.cur.x, y: target ? target.y : s.cur.y, down: !!shoot } });
            wait = shoot ? 14 : wait - 1;
        }
        wins.push({ level: level, screen: G.debug.state().screen, ticks: ticks });
    }
    G.debug.start(10); G.debug.step(50000, {});
    return { wins: wins, idle: G.debug.state().screen, errors: G.debug.errors.slice() };
})()
