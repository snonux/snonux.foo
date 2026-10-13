(function () {
    var G = SnoGame, results = [];
    function input(s) {
        if (!s.ground || s.redial > 0) return {};
        var h = s.haz.find(function (h) { return h.lane === s.g && h.d1 > s.x; });
        if (!h) return {};
        var at = h.d0;
        s.zones.forEach(function (z) {
            if (z.type === 'jam' && h.d0 >= z.x0 && h.d0 < z.x1) at = Math.min(at, z.x0);
        });
        // Press near the last safe part of the visible approach, leaving
        // the previous opposite-lane obstacle behind. Only normal FLIP input.
        return { a: s.x >= at - s.v * 0.12 };
    }
    for (var level of [1, 5, 10]) {
        G.debug.start(level);
        var ticks = 0;
        while (ticks++ < 14000 && G.debug.state().screen === 'play') {
            G.debug.step(1, input(G.debug.s()));
        }
        results.push({ level: level, screen: G.debug.state().screen, ticks: ticks });
    }
    G.debug.start(1); G.debug.step(14000, {});
    return { wins: results, idle: G.debug.state().screen, errors: G.debug.errors.slice() };
})()
