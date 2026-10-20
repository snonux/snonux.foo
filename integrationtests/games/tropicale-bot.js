// Drives the campaign bot (bots/tropicale.js, passed in as BOT) through each
// level with debug.start/step, recording what the run met on the way, then
// idles each level as the negative case. tropicale.mjs runs it in node and,
// with --browser, in Chrome on desktop and phones.
(function (bot) {
    var G = SnoGame;
    return [1, 2, 3].map(function (level) {
        var mem = {}, rode = {}, sprung = 0, surges = 0, n, s;
        G.debug.start(level);
        for (n = 0; n < 60 * 300 && G.debug.state().screen === 'play'; n++) {
            G.debug.step(1, function (i, st) { return bot.play(st, G, mem); });
            s = G.debug.s();
            if (s.p.on) rode[s.p.on.kind] = true;
            if (s.p.sprung && s.p.vy < -800) sprung++;
            if (s.surge === 1 && s.tideT < 8 + 1 / 60) surges++;
        }
        var result = {
            level: level, screen: G.debug.state().screen, lives: G.debug.state().lives, seconds: Math.round(n / 60),
            fruit: s.got, flags: s.flags.filter(function (f) { return f.on; }).length, rode: Object.keys(rode).sort().join(' '),
            springs: sprung, surges: surges
        };
        G.debug.start(level); G.debug.step(6000, {});
        result.idle = G.debug.state().screen;
        return result;
    });
})(BOT)
