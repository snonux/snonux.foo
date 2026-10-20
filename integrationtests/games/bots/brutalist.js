// Wrecking Ball campaign bot: drive, reel and brake only.
// It works like a patient operator: the chain hangs low enough to reach the
// ground floor, the crane drives back and forth in a steady rhythm that
// pumps the pendulum, and it brakes hard at the end of every run towards the
// site so the ball whips into the wall it has reached. Before every move it
// checks where that move puts the cab when each piece of debris lands (the
// red marks) and picks another one if it would be under a piece, and it
// backs away from slabs that are coming down over the cab.
(function () {
    var GROUND = 470, GRAV = 900, REACH = 34 + 30 + 14;   // half mark + half cab + margin

    // Seconds until a chunk at (y, vy) reaches the ground.
    function landsIn(k) {
        return (-k.vy + Math.sqrt(k.vy * k.vy + 2 * GRAV * Math.max(0, GROUND - k.y))) / GRAV;
    }

    // A column the tracks cannot pass: two standing blocks at its foot.
    function walled(s, c) { return !!s.grid[0][c] && !!s.grid[1][c]; }

    // How far the cab can drive either way before a wall or the fence.
    function room(s) {
        var c0 = Math.floor(s.cab.x / 40), lo = 40, hi = 920, c;
        for (c = c0 - 1; c >= 0; c--) if (walled(s, c)) { lo = Math.max(lo, (c + 1) * 40 + 30); break; }
        for (c = c0 + 1; c < 24; c++) if (walled(s, c)) { hi = Math.min(hi, c * 40 - 30); break; }
        return { lo: lo, hi: hi };
    }

    // Where the cab is after t seconds of holding `dir` (-1, 0 = brake, 1).
    function cabAt(cab, lim, dir, t) {
        var v = cab.vx, x = cab.x, h = 1 / 30;
        for (var u = 0; u < t; u += h) {
            v = dir ? Math.max(-250, Math.min(250, v + dir * 620 * h)) : (v > 0 ? Math.max(0, v - 1800 * h) : Math.min(0, v + 1800 * h));
            x = Math.max(lim.lo, Math.min(lim.hi, x + v * h));
        }
        return x;
    }

    function safe(s, lim, dir) {
        return s.chunks.every(function (k) { return Math.abs(cabAt(s.cab, lim, dir, landsIn(k)) - k.tx) > REACH; });
    }

    // The move to make: the rhythm's own if it is safe, else the first safe one.
    function dodge(s, want) {
        var lim = room(s), options = [want, 0, -want || -1, want || 1];
        for (var i = 0; i < options.length; i++) if (safe(s, lim, options[i])) return options[i];
        return want;
    }

    function play(s, G, mem) {
        var t = mem.t = (mem.t || 0) + 1, finale = !!s.cfg.tremor;
        var period = finale ? 130 : 150, length = finale ? 350 : 390;
        if (t % period === 0) mem.dir = -(mem.dir || -1);
        var cab = s.cab.x, want = mem.dir;
        // A slab that has let go, or is about to, within reach of the cab:
        // back off to the left, away from the site.
        var overhead = s.falling.concat(s.loose).some(function (b) { return !b.dead && Math.abs(b.c * 40 + 20 - cab) < 70; });
        if (overhead) want = -1;
        var move = dodge(s, want), brake = move === 0 || (move === mem.dir && !overhead && t % period > period - 20);
        return { right: move > 0, left: move < 0, down: s.L < length, up: s.L > length + 10, a: brake };
    }

    return { play: play, budget: 320 };
})()
