// Drives the campaign bot (bots/volcano.js, passed in as BOT) through the
// level already started with debug.start, for at most LIMIT ticks, and
// records which of the level's mechanics the climb really met. volcano.mjs
// runs it in node and, with --browser, in Chrome on desktop and phones.
(function (bot, limit) {
    var G = SnoGame, ticks = 0, mem = {}, was = {}, columns = {};
    var met = { crumble: 0, move: 0, steam: 0, bombs: 0, quakes: 0, surges: 0 };
    // Counts each mechanic once per occurrence (on its rising edge).
    function edge(name, now) {
        if (now && !was[name]) met[name]++;
        was[name] = now;
    }
    // In the air inside a blowing vent's steam column (the game's own test).
    function inSteam(s, p) {
        return !p.ground && s.ledges.some(function (l) {
            var v = l.vent, feet = p.y + 30;
            return v && (s.time + v.ph) % v.period < v.on && Math.abs(p.x + 10 - v.x) <= 26 && feet <= l.y + 1 && feet >= l.y - 300;
        });
    }
    function record(s) {
        var p = s.p;
        edge('crumble', p.on && p.on.kind === 'crumble');
        edge('move', p.on && p.on.kind === 'move');
        edge('steam', inSteam(s, p));
        edge('bombs', s.bombs.length > 0);
        edge('quakes', s.quakeWarn);
        edge('surges', s.surgeLeft > 0);
        s.falls.forEach(function (f, i) { if (p.y + 30 < f.y0) columns[i] = true; });
    }
    function input(i, s) {
        record(s);
        return bot.play(s, G, mem);
    }
    // After a lost life the page shows the dead and intro screens; JUMP
    // taps through them like a player would.
    while (ticks < limit && ['play', 'dead', 'intro'].indexOf(G.debug.state().screen) >= 0) {
        var screen = G.debug.state().screen;
        G.debug.step(1, screen === 'play' ? input : { a: screen === 'intro' && ticks % 2 === 0 });
        ticks++;
    }
    met.kicks = mem.kicks || 0;
    met.columns = Object.keys(columns).length;
    return { ticks: ticks, state: G.debug.state(), top: G.debug.s().top, ledges: G.debug.s().ledges.length, falls: G.debug.s().falls.length, met: met };
})(BOT, LIMIT)
