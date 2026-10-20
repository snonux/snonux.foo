// Drives the campaign bot (bots/tropicale.js, passed in as BOT) through each
// level with debug.start/step, recording what the run met on the way, then
// idles each level as the negative case. tropicale.mjs runs it in node and,
// with --browser, in Chrome on desktop and phones.
(function (bot) {
    var G = SnoGame;
    // Foes the player came close to, so a level can be shown to really put
    // its enemies in the bot's way (a drip counts once it starts to fall).
    function meet(s, met) {
        s.foes.forEach(function (f) {
            if (Math.abs(f.x - s.p.x) < 96 && (f.kind !== 'drip' || f.state > 0)) met[f.kind] = true;
        });
    }
    function play(level) {
        var mem = {}, rode = {}, met = {}, sprung = 0, surges = 0, stomps = 0, combo = 0, n, s;
        G.debug.start(level);
        for (n = 0; n < 60 * 300 && G.debug.state().screen === 'play'; n++) {
            G.debug.step(1, function (i, st) { return bot.play(st, G, mem); });
            s = G.debug.s();
            if (s.p.on) rode[s.p.on.kind] = true;
            if (s.p.sprung && s.p.vy < -800) sprung++;
            if (s.surge === 1 && s.tideT < 8 + 1 / 60) surges++;
            // combo only grows on a stomp and resets on landing.
            if (s.combo > combo) stomps += s.combo - combo;
            combo = s.combo; meet(s, met);
        }
        return {
            level: level, screen: G.debug.state().screen, lives: G.debug.state().lives, seconds: Math.round(n / 60),
            fruit: s.got, flags: s.flags.filter(function (f) { return f.on; }).length, rode: Object.keys(rode).sort().join(' '),
            met: Object.keys(met).sort().join(' '), stomps: stomps, springs: sprung, surges: surges
        };
    }
    return [1, 2, 3].map(function (level) {
        var result = play(level);
        G.debug.start(level); G.debug.step(6000, {});
        result.idle = G.debug.state().screen;
        return result;
    });
})(BOT)
