// Gold Express campaign bot: runs the roofs toward the front with ordinary
// input. It ducks (and stops) while a spout or tunnel passes over it or a
// shot comes its way, shoots every outlaw and rider in range while ducked,
// waits at the car's end until no gust, spout, tunnel or aiming gun could
// catch it in mid-air, then jumps with a full run. Against Black Bart it
// stays ducked on the last car, pacing so his coal lands behind it, and
// fires until he falls; then it runs to the lever and pulls it.
(function () {
    var PW = 22, V_SHOT = 330;

    function carUnder(s, p) {
        for (var i = 0; i < s.cars.length; i++) {
            var c = s.cars[i];
            if (p.x + PW > c.x && p.x < c.x + c.w) return c;
        }
        return null;
    }

    // Seconds until a spout or tunnel reaches the player (0 while one is
    // over them, Infinity when none is coming).
    function passerEta(s, p) {
        var best = Infinity;
        s.passers.forEach(function (h) {
            if (h.x + h.w < p.x - 4) return;
            if (h.x < p.x + PW + 4) { best = 0; return; }
            best = Math.min(best, (h.x - p.x - PW) / (s.V + Math.max(0, p.vx)));
        });
        return best;
    }

    // Seconds until an enemy shot could reach the player: shots in flight
    // and guns being drawn.
    function shotEta(s, p) {
        var px = p.x + PW / 2, best = Infinity;
        s.foeShots.forEach(function (b) {
            var d = b.vx < 0 ? b.x - p.x + 10 : p.x + PW + 10 - b.x;
            if (d > 0) best = Math.min(best, Math.max(0, d - 20) / Math.abs(b.vx));
        });
        s.outlaws.concat(s.riders).forEach(function (o) {
            if (o.state === 'aim' && Math.abs(o.x - px) < 620) best = Math.min(best, o.t + Math.abs(o.x - px) / V_SHOT);
        });
        if (s.bart && s.bart.aim) best = Math.min(best, Math.max(0, s.bart.shootT + 0.7) + Math.abs(s.bart.x - px) / V_SHOT);
        return best;
    }

    // The nearest outlaw or rider still in the saddle within shooting range.
    function target(s, p) {
        var px = p.x + PW / 2, best = null, bd = 600;
        s.outlaws.concat(s.riders).forEach(function (o) {
            if (o.state === 'fall') return;
            var d = Math.abs(o.x - px);
            if (d < bd) { bd = d; best = o; }
        });
        return best;
    }

    function fire(mem) { mem.fire = !mem.fire; return mem.fire; }

    // Fighting Black Bart from the last car, ducked and firing (the gun
    // keeps facing him while it fires), pacing between two marks and
    // stepping away from where a lump of coal will come down.
    function bartFight(s, p, mem) {
        var B = s.bart, xa = B.lo - 330, xb = B.lo - 200, px = p.x + PW / 2;
        if (!p.on) return { right: true };
        if (!mem.pace) mem.pace = 1;
        if (p.x > xb) mem.pace = -1;
        if (p.x < xa) mem.pace = 1;
        // Where each lump will come down; step away from the middle of
        // the ones that would land close (Bart throws two at a time later).
        var near = [];
        s.coal.forEach(function (c) {
            var y = 352 - 24 - c.y, disc = c.vy * c.vy + 2 * c.g * y;
            if (disc < 0) return;
            var xl = c.x + c.vx * (-c.vy + Math.sqrt(disc)) / c.g;
            if (Math.abs(xl - px) < 80) near.push(xl);
        });
        if (near.length) {
            var mid = near.reduce(function (a, b) { return a + b; }, 0) / near.length;
            mem.pace = mid > px ? -1 : 1;
        }
        if (p.x < xa - 40) mem.pace = 1;
        if (p.x > xb + 40) mem.pace = -1;
        if (p.face < 0 && p.lock <= 0) return { right: true, down: true };
        return { down: true, right: mem.pace > 0, left: mem.pace < 0, a: fire(mem) };
    }

    function toLever(s, p, mem) {
        var lx = s.lever.x - PW / 2, dx = lx - p.x;
        if (Math.abs(dx) < 12 && p.on && Math.abs(p.vx) < 60) return { a: fire(mem) };
        return run(s, p, mem, dx > 0 ? 1 : -1, Math.abs(dx) < 70);
    }

    // Whether it is safe to leave the roof now: nothing that could catch a
    // jumper in mid-air during the next second.
    function safeToJump(s, p) {
        if (s.gust.state !== 'idle') return false;
        if (passerEta(s, p) < 1.15) return false;
        if (shotEta(s, p) < 1.0) return false;
        return true;
    }

    // Run in `dir`; at the end of a car, jump once safe, else stop short
    // (far enough back for a full run-up).
    function run(s, p, mem, dir, slow) {
        var car = p.on, out = {};
        if (!car) { out.right = dir > 0; out.up = p.vy < 0 && mem.jumping; return out; }
        mem.jumping = false;
        var next = s.cars[car.i + 1], edge = car.x + car.w - PW;
        if (dir < 0 || !next || next.x - (car.x + car.w) < 5) {
            if (slow) { out[dir > 0 ? 'right' : 'left'] = Math.abs(p.vx) < 80; return out; }
            out[dir > 0 ? 'right' : 'left'] = true; return out;
        }
        if (!safeToJump(s, p)) {
            var wait = edge - 70;
            if (p.x < wait - 6) out.right = true;
            else if (p.x > wait + 6) out.left = p.vx > -60;
            return out;
        }
        out.right = true;
        if (p.x > edge - 12 && p.vx > 240) { out.up = true; mem.jumping = true; }
        else if (p.x > edge - 4 && p.vx <= 240) { out.right = false; out.left = true; }
        return out;
    }

    function play(s, G, mem) {
        var p = s.p;
        if (p.dead > 0) { mem.jumping = false; return {}; }
        if (!p.on && mem.jumping) return { right: true, up: p.vy < 0 };
        var duckNeed = p.on && (passerEta(s, p) < 0.4 || shotEta(s, p) < 0.45);
        if (s.bart && s.bart.state === 'fight' && p.on && p.on.i === s.cars.length - 3) return bartFight(s, p, mem);
        if (duckNeed) return { down: true };
        if (s.lever && s.bart.state === 'down') return toLever(s, p, mem);
        var t = target(s, p);
        if (t && p.on) {
            var dir = t.x > p.x + PW / 2 ? 1 : -1, out = { down: true };
            if (p.face !== dir) { out[dir > 0 ? 'right' : 'left'] = true; return out; }
            out.a = fire(mem);
            return out;
        }
        return run(s, p, mem, 1, false);
    }

    // The negative control: runs straight ahead and never ducks or shoots.
    function fail(s, G, mem) { return { right: true, up: !s.p.on ? s.p.vy < 0 : Math.random() < 0.05 }; }

    return { play: play, fail: fail, budget: 300 };
})()
