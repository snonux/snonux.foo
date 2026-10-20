// Brick Breaker campaign bot: the ← → keys and the serve button only.
// It predicts where the most urgent ball comes down, and stands so that the
// ball leaves the paddle towards the lowest brick it can see without steel in
// the way (the fortress core is aimed at through its gates). Aiming is what
// keeps it out of a straight up-and-down loop under a steel brick.
(function () {
    var PADDLE_Y = 500, R = 7, STEEL = 9, MAX_OFF = 0.85;

    // Where a ball meets the paddle line, folding the side walls in; ignores
    // bricks, so it is recomputed every tick.
    function landing(b, W) {
        var t = (PADDLE_Y - R - b.y) / b.vy, x = b.x + b.vx * t, lo = R, span = W - 2 * R;
        var m = ((x - lo) % (2 * span) + 2 * span) % (2 * span);
        return { x: lo + (m < span ? m : 2 * span - m), t: t };
    }

    // The ball that reaches the paddle soonest; a rising ball counts as late.
    function urgent(s, W) {
        var best = null;
        s.balls.forEach(function (b) {
            if (b.stuck) return;
            var l = b.vy > 0 ? landing(b, W) : { x: b.x, t: 99 + (PADDLE_Y - b.y) };
            if (!best || l.t < best.t) best = l;
        });
        return best;
    }

    // Does the line from the paddle to (tx, ty) pass through steel?
    function blocked(s, x0, tx, ty) {
        for (var i = 0; i < s.bricks.length; i++) {
            var br = s.bricks[i];
            if (br.hp !== STEEL) continue;
            for (var k = 1; k < 20; k++) {
                var x = x0 + (tx - x0) * k / 20, y = PADDLE_Y + (ty - PADDLE_Y) * k / 20;
                if (x > br.x - R && x < br.x + br.w + R && y > br.y - R && y < br.y + br.h + R) return true;
            }
        }
        return false;
    }

    // The paddle offset (-1..1) that sends a ball landing at x towards the
    // lowest brick in plain sight; a gentle alternating angle when none is.
    function aim(s, x, mem) {
        var best = null, bestOff = 0;
        s.bricks.forEach(function (br) {
            if (br.hp <= 0 || br.hp === STEEL) return;
            var tx = br.x + br.w / 2, ty = br.y + br.h / 2;
            var off = Math.atan2(tx - x, PADDLE_Y - ty) / 1.05;
            if (Math.abs(off) > MAX_OFF || (best && br.y < best.y) || blocked(s, x, tx, ty)) return;
            if (best && br.y === best.y && Math.abs(off) > Math.abs(bestOff)) return;
            best = br; bestOff = off;
        });
        if (best) return bestOff;
        mem.flip = !mem.flip;
        return mem.flip ? 0.45 : -0.45;
    }

    // A falling capsule worth fetching: one the paddle reaches in time and
    // still gets back from before the urgent ball comes down.
    function capsule(s, l) {
        var p = s.paddle, best = null;
        s.caps.forEach(function (c) {
            var tc = (PADDLE_Y - c.y) / 170, go = Math.abs(c.x - p.x) / 620;
            if (tc < 0 || go > tc) return;
            if (l && l.t < tc + Math.abs(l.x - c.x) / 620 + 0.15) return;
            if (!best || c.y > best.y) best = c;
        });
        return best;
    }

    function play(s, G, mem) {
        var p = s.paddle, input = {}, target = G.W / 2;
        mem.t = (mem.t || 0) + 1;
        if (s.balls.some(function (b) { return b.stuck; })) input.a = mem.t % 20 < 2;
        if (s.timers.laser > 0) input.a = true;
        var l = urgent(s, G.W);
        if (l) {
            // Re-aim only while the ball is still far off, so the paddle is
            // not chasing a target that keeps moving under it.
            if (mem.forT === undefined || l.t > mem.forT || Math.abs(l.x - mem.forX) > 24) mem.off = aim(s, l.x, mem);
            mem.forT = l.t; mem.forX = l.x;
            target = l.x - mem.off * p.w / 2 * 0.9;
        }
        var cap = capsule(s, l);
        if (cap) target = cap.x;
        if (target < p.x - 6) input.left = true;
        else if (target > p.x + 6) input.right = true;
        return input;
    }

    // Serves, then runs to the side away from the ball: every ball is lost.
    function fail(s, G, mem) {
        mem.t = (mem.t || 0) + 1;
        var b = s.balls[0], away = b && !b.stuck ? (b.x > G.W / 2 ? 'left' : 'right') : '', input = { a: mem.t % 20 < 2 };
        if (away) input[away] = true;
        return input;
    }

    return { play: play, fail: fail, budget: 420 };
})()
