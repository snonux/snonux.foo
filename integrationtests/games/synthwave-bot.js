(function () {
    var G = SnoGame, wins = [];
    function control(i, s) {
        var z = s.pos + 1050, idx = Math.floor(z / 200), seg = s.segs[idx];
        var pct = s.speed / 12000, curve = Math.abs(seg.curve), candidates = [0.75, 0.25, -0.25, -0.75];
        var target = 0.25, best = Infinity;
        for (var n = 0; n < 35; n++) curve = Math.max(curve, Math.abs(s.segs[idx + n].curve));
        for (var lane of candidates) {
            var cost = Math.abs(lane - s.x) * 2 + (s.L.oncoming && lane < 0 ? 4 : 0);
            for (var car of s.cars) {
                var dz = car.z - z, close = s.speed - car.v;
                if (!car.gone && dz > -300 && dz < 16000 && Math.abs(lane - car.off) < 0.29) {
                    var meet = car.dir < 0 ? dz / Math.max(1, s.speed + car.speed) : dz / Math.max(1, close);
                    if (dz < 1600 || (meet > 0 && meet < 1.5)) cost += 12 / Math.max(0.2, meet);
                }
            }
            for (var k = 0; k < 45; k++) for (var spr of s.segs[idx + k].sprites) {
                if (!spr.dead && Math.abs(lane - spr.off) < (spr.kind === 'barrier' ? 0.4 : 0.28)) cost += 14 * (1 - k / 45);
            }
            if (cost < best) { best = cost; target = lane; }
        }
        var drift = 0.6 * pct * pct * seg.curve * (s.L.storm ? 1.25 : 1) * (s.slip > 0 ? 1.5 : 1);
        var desired = drift - s.wind * pct + (target - s.x) * (s.slip > 0 ? 1.4 : 3);
        var wheel = desired + (desired - s.vx) * 0.25;
        var top = Math.min(1.22, Math.sqrt(1.8 / Math.max(0.1, 0.6 * curve * (s.L.storm ? 1.25 : 1))));
        if (s.slip > 0) top = Math.min(top, 0.7);
        return { up: pct < top, down: pct > top + 0.04, left: wheel < -0.08, right: wheel > 0.08,
            a: s.nitro > 0.05 && curve < 1.1 && pct < top && Math.abs(target - s.x) < 0.18 };
    }
    for (var level of [1, 5, 10]) {
        G.debug.start(level);
        for (var tick = 0; tick < 30000 && G.debug.state().screen === 'play'; tick++) G.debug.step(1, control);
        var s = G.debug.s();
        wins.push({ level: level, screen: G.debug.state().screen, checkpoint: s.cp, time: s.time, progress: (s.pos + 1050) / (s.finish * 200) });
    }
    G.debug.start(10); G.debug.step(10000, {});
    return { wins: wins, idle: G.debug.state().screen, errors: G.debug.errors.slice() };
})()
