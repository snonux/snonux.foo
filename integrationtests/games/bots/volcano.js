// Magma Rising campaign bot: climbs the chain of ledges with ← → and JUMP.
// Ordinary jumps go to the next ledge; under a wall-kick gap (a ledge with
// arrows) it jumps beside the wall and presses JUMP again against it; on a
// vent it waits for the steam and steers off at the top; before a jump
// that passes a lava-fall it waits for the column to switch off. It also
// holds a jump while a falling bomb is over its path or the next ledge is
// shaking loose after a quake, but never waits for bats. Ordinary input only.
(function () {
    var PW = 20, PH = 30, WL = 180, WR = 780, TALL = 145, MARGIN = 24;

    // The x the climber should stand at (or steer to in the air): well
    // inside the next ledge, so a jump still lands if steering stops short.
    function aim(s, p, on, cur, next, mem) {
        var tx = Math.max(next.x + MARGIN, Math.min(next.x + next.w - PW - MARGIN, p.x));
        if (on && on.vent && on.y - next.y > TALL) tx = on.vent.x - 10;
        if (p.ground && on.y - next.y > TALL && !on.vent) tx = on.hint < 0 ? WL : WR - PW;
        if (!p.ground && cur.hint && !mem.kicked) tx = cur.hint < 0 ? WL : WR - PW;
        if (cur.vent && p.y + PH > next.y - 35) tx = cur.vent.x - 10;
        return tx;
    }

    // A lava-fall between here and the target that is on, or would come on
    // before a jump across it (about 0.8 s) is over, makes the climber wait.
    function fallBlocks(s, p, on, next, tx) {
        for (var i = 0; i < s.falls.length; i++) {
            var f = s.falls[i], lo = Math.min(p.x + 10, tx + 10), hi = Math.max(p.x + 10, tx + 10);
            var c = (s.time + f.ph) % f.period;
            if (f.x > lo && f.x < hi && next.y < f.y1 && on.y > f.y0 && (c < f.on + 0.15 || c > f.period - 0.8)) return true;
        }
        return false;
    }

    // A falling bomb just over the jump's path: a knock mid-jump can drop
    // the climber past crumbled ledges, so a careful player lets it land
    // first, unless the lava is too close to wait. Bombs still blinking at
    // the top of the view and the ever-patrolling bats are not waited for:
    // waiting on those would let the lava catch up.
    function hazardAhead(s, p, tx) {
        var lo = Math.min(p.x, tx) - 30, hi = Math.max(p.x, tx) + PW + 30;
        if (s.lavaY - p.y - PH < 150) return false;
        for (var i = 0; i < s.bombs.length; i++) {
            var b = s.bombs[i];
            if (b.warn <= 0 && b.x > lo && b.x < hi && b.y < p.y + PH && b.y > p.y - 260) return true;
        }
        return false;
    }

    // Whether to press JUMP on a ledge: lined up under a tall gap, or close
    // enough (and running fast enough) for an ordinary jump. A shaking
    // ledge is left at once, hazards or not.
    function groundJump(s, p, on, next, tx, mem) {
        var dy = on.y - next.y, ready = Math.abs(tx - p.x) < (dy > TALL ? 7 : 135);
        // A quake can leave the next ledge shaking loose or gone: wait for
        // it to re-form rather than land on it as it drops.
        var risky = on.state !== 'shake' && (next.state !== 'idle' || hazardAhead(s, p, tx));
        var wait = fallBlocks(s, p, on, next, tx) || risky;
        if (wait) return { a: false, tx: Math.max(on.x + 8, Math.min(on.x + on.w - 28, p.x)) };
        if (dy <= TALL && Math.abs(tx - p.x) > 40 && p.vx * Math.sign(tx - p.x) < 200) ready = false;
        return { a: ready && !mem.held && !on.vent, tx: tx };
    }

    function play(s, G, mem) {
        // A lost life starts the shaft again with a fresh clock.
        if (s.time < (mem.lastTime || 0)) { mem.held = false; mem.kicked = false; mem.lastOn = -1; mem.from = -1; }
        // Ticks the bot did not play (the page's own loop between campaign
        // chunks) ran with the pad released, so JUMP is no longer held.
        if (s.time - (mem.lastTime || 0) > 1.5 / 60) mem.held = false;
        mem.lastTime = s.time;
        // In the air the jump is still from the ledge last stood on: after a
        // fall below the highest ledge reached, the target is the one above
        // where the climber is, not above the highest.
        var p = s.p, on = p.on, idx = on ? on.i : (mem.from >= 0 ? mem.from : s.top), cur = s.ledges[idx];
        if (on) mem.from = on.i;
        var next = s.ledges[Math.min(idx + 1, s.ledges.length - 1)], a = !p.ground && mem.held;
        if (on && on.i !== mem.lastOn) { mem.lastOn = on.i; mem.kicked = false; }
        var tx = aim(s, p, on, cur, next, mem);
        if (p.ground) {
            mem.kicked = false;
            var j = groundJump(s, p, on, next, tx, mem);
            a = j.a; tx = j.tx;
        } else if (p.wall && !mem.kicked && cur.hint && p.vy > -220) {
            a = !mem.held;
            if (a) { mem.kicked = true; mem.kicks = (mem.kicks || 0) + 1; }
        }
        var dx = tx - p.x - p.vx * 0.11, dead = cur.hint && !mem.kicked ? 1 : 6;
        mem.held = a;
        return { left: dx < -dead, right: dx > dead, a: a };
    }

    return { play: play, budget: 240 };
})()
