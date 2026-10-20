// Midnight Alley campaign bot: a steady marksman with human-ish timing.
// It waits a reaction time after a gangster shows, clicks (taps) his head,
// leaves a gap between shots, holds fire when an innocent is near the
// shot, and reloads with X/LOAD when the cylinder runs low between targets.
// It exercises aim, reload, the draw timer, hostages and the Kingpin.
({
    play: function (s, G, mem) {
        mem.tick = (mem.tick || 0) + 1;
        var REACT = 0.6, GAP = 36;   // seconds after a gangster shows; ticks between shots
        function aimable(tg) {
            if (!tg.def.hostile || tg.phase !== 'aim' || tg.age < REACT) return false;
            return tg.hx > 10 && tg.hx < 950 && tg.hy > 60;
        }
        // An innocent standing (or running) close to the shot is not worth it.
        function blocked(x, y) {
            return s.targets.some(function (o) {
                if (o.def.hostile || o.phase === 'dead' || o.phase === 'out') return false;
                return Math.abs(o.hx - x) < 45 && y > o.hy - 30 && y < o.bottom;
            });
        }
        var live = s.targets.filter(aimable).filter(function (tg) { return !blocked(tg.hx, tg.hy); });
        live.sort(function (a, b) { return b.t / b.draw - a.t / a.draw; });
        // A held button stays held between ticks, so the mouse is let go
        // explicitly: every shot is its own click.
        var up = { mouse: { down: false } }, reload = { b: true, mouse: up.mouse };
        var ready = s.reload <= 0 && s.cool <= 0 && mem.tick >= (mem.next || 0);
        if (ready && s.ammo === 0) return reload;
        if (!live.length) return s.ammo < 4 && s.reload <= 0 ? reload : up;
        if (!ready) return up;
        mem.next = mem.tick + GAP;
        return { mouse: { x: live[0].hx, y: live[0].hy, down: true } };
    },
    budget: 300
})
