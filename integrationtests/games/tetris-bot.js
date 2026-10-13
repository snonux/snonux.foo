(function () {
    var G = SnoGame, wins = [], idle = [];
    function target(s) {
        var best = -1, cost = Infinity;
        for (var c = 0; c < 12; c++) {
            if (s.shots.some(function (sh) { return sh.c === c; })) continue;
            var low = s.rows.findIndex(function (row) { return row.cells[c]; });
            if (low < 0) continue;
            var armour = s.rows[low].cells[c].kind === 'armour';
            if (!armour && (low === 0 || s.rows[low - 1].stub)) continue;
            var value = low * 20 + Math.abs(c - s.col) + (armour ? 3 : 0);
            if (value < cost) { best = c; cost = value; }
        }
        return best;
    }
    [1, 5, 10].forEach(function (level) {
        G.debug.start(level);
        for (var n = 0; n < 36000 && G.debug.state().screen === 'play'; n++) {
            G.debug.step(1, function (_, s) {
                var c = target(s);
                if (c < 0) return {};
                if (s.touch) return n % 24 === 0 ? { mouse: { x: 156 + (c + 0.5) * 54, y: 460, down: true } } : {};
                if (c !== s.col) return { left: c < s.col, right: c > s.col };
                return { a: n % 24 === 0 };
            });
        }
        wins.push({ level: level, screen: G.debug.state().screen, ticks: n, lives: G.lives });
        G.debug.start(level);
        for (n = 0; n < 12000 && G.debug.state().screen === 'play'; n++) G.debug.step(1, {});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: wins, idle: idle };
})()
