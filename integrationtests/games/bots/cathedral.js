// Gargoyle campaign bot: steer and flap only.
// It plays the joust the way the rules reward: it backs off from a demon
// that is not below it, goes for souls first (an orb left alone hatches
// into a stronger demon), then dives on the nearest demon from above so the
// gargoyle is the higher one at contact. It steps off the spot a geyser is
// about to burn and climbs past a ledge's end instead of bumping its
// underside. Before each move it replays the next 0.6 s and, if that move
// gets it killed by a demon, the censer, a geyser or the fire, picks one
// that does not.
(function () {
    var W = 960, FIRE_Y = 506, GEYSER_WARN = 1.2, GEYSER_BURN = 0.9, PIVOT_Y = 26;

    function wrap(dx) { return (dx + W * 1.5) % W - W / 2; }
    function wrapX(x) { return (x % W + W) % W; }

    function distance(p, e) { return Math.abs(wrap(e.x - p.x)) + Math.abs(e.y - p.y); }

    function nearest(p, list) {
        return list.slice().sort(function (a, b) { return distance(p, a) - distance(p, b); })[0];
    }

    function live(s) { return s.demons.filter(function (e) { return e.spawn <= 0 && e.grace <= 0; }); }

    // Demons close by that are not clearly below the gargoyle: one that
    // drops onto it wins the joust. One still fresh from its portal counts
    // too, since its grace runs out in a moment.
    function threats(s) {
        var p = s.p;
        return s.demons.filter(function (d) {
            // A demon flapping up from below is a threat before it gets
            // level, one diving from above all the more.
            var y = Math.min(d.y, d.y + d.vy * 0.25);
            if (d.spawn > 0) return false;
            return Math.abs(wrap(d.x - p.x)) < (d.boss ? 120 : 90) && y < p.y + 4 && p.y - y < 120;
        });
    }

    // Dive onto a demon only from above. Below or level with it, hold off
    // to the side it is on and climb past it first.
    function attack(s, d) {
        var p = s.p, lift = d.boss ? 26 : 17;
        if (p.y < d.y - lift + 6) return { x: d.x, y: d.y - lift };
        var side = wrap(p.x - d.x) < 0 ? -1 : 1, dx = Math.abs(wrap(p.x - d.x));
        // Right under it, climbing would meet it on the way down: sink a
        // little until there is room beside it to climb.
        var y = dx < (d.boss ? 110 : 80) ? p.y + 30 : d.y - 60;
        return { x: wrapX(d.x + side * (d.boss ? 170 : 130)), y: y };
    }

    // Where to fly: away from a threat, else to an orb that can be caught
    // (left alone it hatches into a stronger demon), else at the nearest
    // demon. One up by the vault is left until it comes down; the bot waits
    // to one side of it, mid-height.
    function goal(s) {
        var p = s.p, d = nearest(p, threats(s));
        if (d) return attack(s, d);
        var orb = nearest(p, s.orbs.filter(function (o) { return o.arm < 0.25; }));
        if (orb) return { x: orb.x, y: orb.y };
        d = nearest(p, live(s));
        if (!d) return { x: 200, y: 120 };
        if (d.y < 100) return { x: wrapX(d.x + 200), y: 190 };
        return attack(s, d);
    }

    // A geyser burns a column under where the gargoyle was: get out of it,
    // allowing for the gargoyle's own drift, and do not aim into it.
    function avoidGeysers(s, t) {
        var p = s.p;
        s.geysers.forEach(function (g) {
            if (g.t > GEYSER_WARN + GEYSER_BURN) return;
            var dx = wrap(p.x - g.x), ahead = wrap(p.x + p.vx * 0.35 - g.x);
            if (Math.abs(dx) < 75 || Math.abs(ahead) < 75) t.x = wrapX(g.x + (dx < 0 ? -120 : 120));
            else if (Math.abs(wrap(t.x - g.x)) < 60) t.x = wrapX(g.x + (dx < 0 ? -90 : 90));
        });
    }

    // ------------------------------------------------------------------
    // The safety check: the next 0.6 s are replayed for a move, with the
    // gargoyle's own flight rules, demons flapping towards the heights they
    // were last aiming for, and the censer on its pendulum.
    // ------------------------------------------------------------------

    var LIFT = [200, 215, 230, 240], FLAP = [0.34, 0.3, 0.26, 0.23], BOSS_LIFT = [215, 225, 235], BOSS_FLAP = [0.3, 0.26, 0.23];
    var DT = 1 / 60, LOOK = 36;

    function ghosts(s) {
        return s.demons.filter(function (d) { return d.spawn < LOOK * DT; }).map(function (d) {
            var k = d.boss ? 3 - d.hp : d.tier;
            return { x: d.x, y: d.y, vx: d.vx, vy: d.vy, cd: d.flapCd, aim: d.targetY, hw: d.hw, hh: d.hh, boss: d.boss,
                lift: d.boss ? BOSS_LIFT[k] : LIFT[k], flap: d.boss ? BOSS_FLAP[k] : FLAP[k],
                spawn: d.spawn, safe: Math.max(d.spawn, 0) + d.grace };
        });
    }

    // A demon still in its portal stays put until it comes out.
    function stepGhost(e) {
        if ((e.spawn -= DT) > 0) return;
        e.cd -= DT;
        if ((e.y > e.aim || e.y > FIRE_Y - 50) && e.cd <= 0) { e.vy = Math.max(Math.min(e.vy, 80) - e.lift, -300); e.cd = e.flap; }
        e.vy += 520 * DT; e.x += e.vx * DT; e.y += e.vy * DT;
    }

    function stepBowl(b) {
        b.av -= 900 / b.c.len * Math.sin(b.ang) * DT;
        b.ang += b.av * DT;
        b.x = b.c.px + Math.sin(b.ang) * b.c.len; b.y = PIVOT_Y + Math.cos(b.ang) * b.c.len;
    }

    // Is the gargoyle at (x, y) dead at time t: under a demon that is
    // clearly higher, in the bowl, in a burning geyser or in the fire?
    // Its invulnerability after a respawn covers all of them but the fire.
    function deadly(s, x, y, t, gs, bowls) {
        if (y + 14 > FIRE_Y) return true;
        if (s.p.inv > t) return false;
        var demon = gs.some(function (e) {
            return e.safe <= t && Math.abs(wrap(x - e.x)) < 13 + e.hw + 4 && Math.abs(y - e.y) < 14 + e.hh + 4 && e.y < y - (e.boss ? 16 : 9);
        });
        var bowl = bowls.some(function (b) { return Math.hypot(wrap(x - b.x), y - b.y) < 36; });
        return demon || bowl || s.geysers.some(function (g) {
            var at = g.t + t;
            return at > GEYSER_WARN - 0.1 && at < GEYSER_WARN + GEYSER_BURN && Math.abs(wrap(x - g.x)) < 34 && y + 14 > FIRE_Y - 300;
        });
    }

    // The ledge a falling gargoyle at (x, y) has just come down on.
    function landing(s, x, y, vy) {
        if (vy <= 0) return null;
        return s.ledges.filter(function (l) {
            return !(l.gone > 0) && y + 14 > l.y && y + 14 - vy * DT <= l.y + 1 && Math.abs(wrap(x - l.x - l.w / 2)) < l.w / 2 + 13;
        })[0];
    }

    // How many ticks the move (h: -1, 0, 1; tapping FLAP or not) survives,
    // LOOK + 1 if it lasts them all, and where the gargoyle ends up.
    function replay(s, tick, h, flap) {
        var p = s.p, x = p.x, y = p.y, vx = p.vx, vy = p.vy, cd = p.flapCd, gs = ghosts(s);
        var bowls = s.censers.map(function (c) { return { c: c, ang: c.ang, av: c.av }; });
        for (var k = 1; k <= LOOK; k++) {
            if (h) vx = Math.max(-280, Math.min(280, vx + h * 700 * DT));
            cd -= DT;
            if (flap && (tick + k - 1) % 7 === 0 && cd <= 0) { vy = Math.max(Math.min(vy, 60) - 250, -360); cd = 0.09; }
            vy += 720 * DT; x = wrapX(x + vx * DT); y += vy * DT;
            if (y < 68) { y = 68; vy = Math.abs(vy) * 0.4 + 30; }
            var l = landing(s, x, y, vy);
            if (l) { y = l.y - 14; vy = 0; }
            gs.forEach(stepGhost);
            bowls.forEach(stepBowl);
            if (deadly(s, x, y, k * DT, gs, bowls)) return { k: k, x: x, y: y };
        }
        return { k: LOOK + 1, x: x, y: y };
    }

    // Keep the wanted move if it survives; else the surviving move that ends
    // nearest the target; else the one that lasts longest.
    function safest(s, tick, want, t) {
        var h = want.right ? 1 : want.left ? -1 : 0;
        if (replay(s, tick, h, want.flap).k > LOOK) return want;
        var best = null, bestScore = -Infinity;
        [-1, 0, 1].forEach(function (h) {
            [false, true].forEach(function (flap) {
                var r = replay(s, tick, h, flap);
                var score = r.k * 1000 - Math.abs(wrap(t.x - r.x)) - Math.abs(t.y - r.y);
                if (score > bestScore) { bestScore = score; best = { left: h < 0, right: h > 0, flap: flap }; }
            });
        });
        return best;
    }

    function play(s, G, mem) {
        var p = s.p, tick = mem.t = (mem.t || 0) + 1, t = goal(s);
        avoidGeysers(s, t);
        t.y = Math.min(t.y, FIRE_Y - 61);
        // Climb beside a ledge instead of flapping into its underside.
        if (p.ceil && t.y < p.ceil.y) {
            var l = p.ceil, side = wrap(p.x - (l.x + l.w / 2)) < 0 ? -1 : 1;
            t.x = wrapX(l.x + (side < 0 ? -30 : l.w + 30));
        }
        var dx = wrap(t.x - p.x) - p.vx * 0.2, predicted = p.y + p.vy * 0.18;
        var move = safest(s, tick, { left: dx < -8, right: dx > 8, flap: predicted > t.y && p.vy > -190 }, t);
        return { left: move.left, right: move.right, a: move.flap && tick % 7 === 0 };
    }

    return { play: play, budget: 300 };
})()
