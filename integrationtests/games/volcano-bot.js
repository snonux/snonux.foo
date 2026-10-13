(function () {
    var G = SnoGame, ticks = 0, held = false, kicked = false, lastOn = -1, lastTime = -1;
    function input(i, s) {
        if (s.time < lastTime) { held = false; kicked = false; lastOn = -1; }
        lastTime = s.time;
        var p = s.p, feet = p.y + 30;
        var on = p.on, idx = on ? on.i : s.top;
        var next = s.ledges[Math.min(idx + 1, s.ledges.length - 1)];
        var tx = Math.max(next.x + 5, Math.min(next.x + next.w - 25, p.x)), a = !p.ground && held;
        if (on && on.i !== lastOn) { lastOn = on.i; kicked = false; }
        if (on && on.vent && on.y - next.y > 145) tx = on.vent.x - 10;
        if (p.ground) {
            kicked = false;
            var dy = on.y - next.y;
            if (dy > 145 && !on.vent) tx = on.hint < 0 ? 180 : 760;
            var ready = Math.abs(tx - p.x) < (dy > 145 ? 7 : 135);
            var f = s.falls.find(function (f) {return f.x > Math.min(p.x + 10, tx + 10) && f.x < Math.max(p.x + 10, tx + 10) && next.y < f.y1 && on.y > f.y0;});
            if (f && (s.time + f.ph) % f.period < f.on + 0.15) { ready = false; tx = Math.max(on.x + 8, Math.min(on.x + on.w - 28, p.x)); }
            if (dy <= 145 && Math.abs(tx - p.x) > 40 && p.vx * Math.sign(tx - p.x) < 200) ready = false;
            a = ready && !held && !on.vent;
        } else if (p.wall && !kicked && s.ledges[idx].hint && p.vy > -220) {
            a = !held;
            if (a) kicked = true;
        }
        if (!p.ground && s.ledges[idx].hint && !kicked) tx = s.ledges[idx].hint < 0 ? 180 : 760;
        if (s.ledges[idx].vent && feet > next.y - 35) tx = s.ledges[idx].vent.x - 10;
        var dx = tx - p.x - p.vx * .11;
        held = a;
        var dead = s.ledges[idx].hint && !kicked ? 1 : 6;
        return {left: dx < -dead, right: dx > dead, a: a};
    }
    while (ticks < 36000 && ['play', 'dead', 'intro'].includes(G.debug.state().screen)) { G.debug.step(1, G.debug.state().screen === 'play' ? input : {a: G.debug.state().screen === 'intro' && ticks % 2 === 0}); ticks++; }
    return {ticks: ticks, state: G.debug.state(), top: G.debug.s().top, ledges: G.debug.s().ledges.length};
})()
