// Drives the campaign bot (bots/terminal.js, passed in as BOT) through each
// level with debug.start/step, then idles each level as the negative case.
// terminal-local.mjs runs it in node, terminal.mjs in Chrome on desktop and
// phones. The wins also record which mechanics came up on the way.
(function (bot) {
    var G = SnoGame, results = [], idle = [];
    function play(level) {
        var mem = {}, seen = {}, bombs = 0, picks = 0, s, n;
        G.debug.start(level);
        for (n = 0; n < 24000 && G.debug.state().screen === 'play'; n++) {
            s = G.debug.s();
            var had = s.p.bombs, spread = s.p.spread;
            G.debug.step(1, function (i, st) { return bot.play(st, G, mem); });
            s = G.debug.s();
            if (s.p.bombs < had) bombs++;
            // A spread shot or a bomb picked up (score and life pickups leave no trace here).
            if (s.p.spread > spread + 1 || s.p.bombs > had) picks++;
            s.enemies.forEach(function (e) { seen[e.kind] = true; });
        }
        return { level: level, screen: G.debug.state().screen, ticks: n, lives: G.lives, kinds: Object.keys(seen).sort().join(''), bombs: bombs, picks: picks };
    }
    [1, 2, 3].forEach(function (level) {
        results.push(play(level));
        G.debug.start(level);
        for (var n = 0; n < 24000 && G.debug.state().screen === 'play'; n++) G.debug.step(1, {});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: results, idle: idle };
})(BOT)
