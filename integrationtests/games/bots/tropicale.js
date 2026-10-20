// Island Hopper campaign bot. A planner: every few ticks it tries a handful
// of short plans (wait, run, run and jump high or low, jump back, …) on its
// own copy of the game's physics — the player's run, jump, coyote time and
// one-way platforms, the rafts, planks, lifts and crumbling slabs, the
// crabs, stalactites, coconuts, diving gulls and the tide — and follows the
// plan that ends alive and furthest right. Waiting is always a plan, so it
// rides lifts and waits for planks and low water. It reads the state to
// imagine the next second and a half; it only presses ← → and JUMP.
(function () {
    var T = 32, GRAV = 1900, JUMP = 640, CUT = 240, RUN = 230, SPRING = 880, NUT_G = 1000;
    var COYOTE = 0.13, BUFFER = 0.15, STEP_UP = 14, SLAB_HOLD = 0.6, WATER = 488, DT = 1 / 60;
    var TIDE = { period: 12, rise: 6, high: 8, fall: 10.5, lift: 96 };
    var HORIZON = 90, REPLAN = 3, NEAR = 760;
    var STOMPABLE = { crab: true, gull: true, monkey: true };
    // A plan: dir (-1/0/1) held for `run` ticks, then let go; JUMP held for
    // the first `jump` ticks; with `hop`, JUMP is pressed again on every
    // landing after that (and held while rising) to chain jumps across
    // slabs and islets.
    var GROUND_PLANS = [
        { dir: 0, jump: 0, run: 0 }, { dir: 1, jump: 0, run: 999 }, { dir: 1, jump: 0, run: 10 },
        { dir: 1, jump: 40, run: 999 }, { dir: 1, jump: 9, run: 999 }, { dir: 1, jump: 40, run: 24 },
        { dir: 0, jump: 40, run: 0 }, { dir: -1, jump: 0, run: 14 }, { dir: -1, jump: 40, run: 30 },
        { dir: 1, jump: 40, run: 10 }, { dir: 1, jump: 40, run: 999, hop: true }, { dir: 1, jump: 0, run: 999, hop: true }
    ];
    var AIR_PLANS = [
        { dir: 1, jump: 40, run: 999 }, { dir: 1, jump: 0, run: 999 }, { dir: 0, jump: 40, run: 0 },
        { dir: 0, jump: 0, run: 0 }, { dir: -1, jump: 40, run: 999 }, { dir: -1, jump: 0, run: 999 },
        { dir: 1, jump: 40, run: 999, hop: true }, { dir: 0, jump: 40, run: 0, hop: true }
    ];

    // What a plan presses on its k-th tick, given the player's state.
    function act(plan, p, k, held) {
        var a = k < plan.jump;
        if (plan.hop && k >= 6) a = p.ground || p.on ? !held : p.vy < 0;
        return { dir: k < plan.run ? plan.dir : 0, a: a };
    }

    function surgeAt(t) {
        if (t < TIDE.rise) return 0;
        if (t < TIDE.high) return (t - TIDE.rise) / (TIDE.high - TIDE.rise);
        if (t < TIDE.fall) return 1;
        return 1 - (t - TIDE.fall) / (TIDE.period - TIDE.fall);
    }

    function copy(o) { var c = {}, k; for (k in o) c[k] = o[k]; return c; }

    // A plain copy of what the plans need, nearby only.
    function snapshot(s) {
        var px = s.p.x, w = { plats: [], foes: [], shots: [], springs: [] }, i, o, on = -1;
        for (i = 0; i < s.plats.length; i++) {
            o = s.plats[i];
            if (Math.abs(o.x - px) > NEAR && o !== s.p.on) continue;
            if (o === s.p.on) on = w.plats.length;
            w.plats.push(copy(o));
        }
        for (i = 0; i < s.foes.length; i++) { o = s.foes[i]; if (!o.dead && Math.abs(o.x - px) < NEAR) w.foes.push(copy(o)); }
        for (i = 0; i < s.shots.length; i++) w.shots.push(copy(s.shots[i]));
        for (i = 0; i < s.springs.length; i++) { o = s.springs[i]; if (Math.abs(o.x - px) < NEAR) w.springs.push(copy(o)); }
        w.p = copy(s.p); w.p.on = on >= 0 ? w.plats[on] : null;
        return w;
    }

    function moveShuttle(pl, water, t) {
        pl.vx = 0;
        if (pl.kind === 'raft') pl.y = water - 10;
        if (pl.wait > 0) { pl.wait -= DT; return; }
        pl[pl.axis] += pl.v * DT;
        if (pl[pl.axis] <= pl.a || pl[pl.axis] >= pl.b) {
            pl[pl.axis] = Math.max(pl.a, Math.min(pl.b, pl[pl.axis]));
            pl.v = -pl.v; pl.wait = 0.9;
        } else if (pl.axis === 'x') pl.vx = pl.v;
    }

    function moveFall(pl, p) {
        if (pl.state === 0 && p.on === pl) { pl.state = 1; pl.t = SLAB_HOLD; }
        if (pl.state === 1 && (pl.t -= DT) <= 0) { pl.state = 2; pl.vy = 0; }
        if (pl.state === 2) { pl.vy += 1400 * DT; pl.y += pl.vy * DT; }
    }

    function control(p, dir, held, hit) {
        if (dir) {
            var acc = (p.ground ? 1500 : 950) * (dir * p.vx < 0 ? 2 : 1);
            p.vx = Math.max(-RUN, Math.min(RUN, p.vx + dir * acc * DT));
        } else if (p.ground) p.vx -= Math.max(-1700 * DT, Math.min(1700 * DT, p.vx));
        p.coyote = p.ground ? COYOTE : p.coyote - DT;
        p.buffer = hit ? BUFFER : p.buffer - DT;
        if (p.buffer > 0 && p.coyote > 0) {
            p.vy = -JUMP; p.buffer = 0; p.coyote = 0;
            if (p.on) { p.vx = Math.max(-RUN, Math.min(RUN, p.vx + p.on.vx)); p.on = null; }
        }
        if (!held && !p.sprung && p.vy < -CUT) p.vy = -CUT;
        p.vy = Math.min(p.vy + GRAV * DT, 900);
        if (p.vy >= 0) p.sprung = false;
    }

    function landing(w, p, feet) {
        if (p.vy < 0) return null;
        for (var i = 0; i < w.plats.length; i++) {
            var pl = w.plats[i];
            if (p.x + p.w > pl.x && p.x < pl.x + pl.w && feet <= pl.py + STEP_UP && p.y + p.h >= pl.y) return pl;
        }
        return null;
    }

    function movePlayer(w, p, G, solid) {
        var feet = p.y + p.h, carry = p.on ? p.on.vx : 0;
        if (p.on) p.y = p.on.y - p.h;
        p.vx += carry;
        G.tileMove(p, DT, T, solid);
        p.vx = p.wall ? 0 : p.vx - carry;
        p.on = p.ground ? null : landing(w, p, feet);
        if (p.on) { p.y = p.on.y - p.h; p.vy = 0; p.ground = true; }
        if (p.inv > 0) p.inv -= DT;
    }

    function overlap(a, x, y, w, h) { return a.x < x + w && a.x + a.w > x && a.y < y + h && a.y + a.h > y; }

    // What the foes do in a tick; returns true when the player is hit.
    function foesHit(w, p, held, solid, water) {
        for (var i = 0; i < w.foes.length; i++) {
            var f = w.foes[i];
            if (f.dead) continue;
            if (f.kind === 'crab') {
                f.x += f.vx * DT;
                if (f.x < f.lo) { f.x = f.lo; f.vx = Math.abs(f.vx); }
                if (f.x > f.hi) { f.x = f.hi; f.vx = -Math.abs(f.vx); }
            } else if (f.kind === 'drip') {
                if (f.state === 0 && Math.abs(p.x + 10 - f.x - 8) < 56 && p.y > f.y) { f.state = 1; f.t = 0.45; }
                if (f.state === 1 && (f.t -= DT) <= 0) f.state = 2;
                if (f.state === 2) {
                    f.vy += 1400 * DT; f.y += f.vy * DT;
                    if (solid(Math.floor((f.x + 8) / T), Math.floor((f.y + f.h) / T)) || f.y > water) f.dead = true;
                }
            }
            if (f.dead || p.inv > 0) continue;
            // A gull that has marked a spot will plunge on it: that column is deadly.
            if (f.kind === 'gull' && f.state > 0 && overlap(p, f.tx - 6, f.alt, f.w + 12, f.ty - f.alt + f.h)) return true;
            if (!overlap(p, f.x, f.y, f.w, f.h)) continue;
            if (STOMPABLE[f.kind] && p.vy > 0 && p.y + p.h - f.y < 18) { f.dead = true; p.vy = held ? -560 : -CUT; continue; }
            return true;
        }
        return false;
    }

    function shotsHit(w, p, solid, water) {
        for (var i = 0; i < w.shots.length; i++) {
            var c = w.shots[i];
            if (c.gone) continue;
            c.vy += NUT_G * DT; c.x += c.vx * DT; c.y += c.vy * DT;
            if (p.inv <= 0) {
                var nx = Math.max(p.x, Math.min(p.x + p.w, c.x)), ny = Math.max(p.y, Math.min(p.y + p.h, c.y));
                if ((c.x - nx) * (c.x - nx) + (c.y - ny) * (c.y - ny) < 64) return true;
            }
            if (solid(Math.floor(c.x / T), Math.floor(c.y / T)) || c.y >= water) c.gone = true;
        }
        return false;
    }

    function useSprings(w, p) {
        for (var i = 0; i < w.springs.length; i++) {
            var sp = w.springs[i];
            if (p.vy >= 0 && overlap(p, sp.x, sp.y, sp.w, sp.h)) { p.vy = -SPRING; p.sprung = true; p.on = null; p.coyote = 0; }
        }
    }

    // Plays a plan on a copy of the world: the score is how far right it
    // ends, minus a fortune for dying (later deaths are less bad) and for
    // ending on a beach the coming surge will flood.
    function score(s, G, plan, held0, k0) {
        var w = snapshot(s), p = w.p, solid = s.solid, tide = s.cfg.tide, tt = s.tideT, held = held0, k, i, water, hit, pl;
        for (k = k0; k < k0 + HORIZON; k++) {
            tt = (tt + DT) % TIDE.period;
            water = WATER - (tide ? surgeAt(tt) * TIDE.lift : 0) - s.flood;
            for (i = 0; i < w.plats.length; i++) {
                pl = w.plats[i]; pl.py = pl.y;
                if (pl.kind === 'fall') moveFall(pl, p); else moveShuttle(pl, water);
            }
            var go = act(plan, p, k, held);
            hit = go.a && !held; held = go.a;
            control(p, go.dir, held, hit);
            movePlayer(w, p, G, solid);
            useSprings(w, p);
            if (p.y + p.h > water + 8 || shotsHit(w, p, solid, water) || foesHit(w, p, held, solid, water)) return -1e6 + (k - k0) * 100 + p.x * 0.01;
            if (overlap(p, s.totem.x, s.totem.y, s.totem.w, s.totem.h)) return 1e6 - (k - k0);
        }
        var surgeSoon = tide && ((s.tideT + 2.6) % TIDE.period) >= TIDE.rise - 0.5 && ((s.tideT + 2.6) % TIDE.period) < TIDE.fall;
        return p.x + (p.ground ? 0 : -8) - (surgeSoon && p.y + p.h > WATER - TIDE.lift + 8 ? 5000 : 0);
    }

    // The plan being followed is scored from where it has got to (and goes
    // on from there if it stays best); the others start afresh.
    function choose(s, G, mem) {
        var plans = s.p.ground || s.p.on ? GROUND_PLANS : AIR_PLANS, best = plans[0], bestScore = -Infinity, i, sc, own;
        for (i = 0; i < plans.length; i++) {
            own = plans[i] === mem.plan;
            sc = score(s, G, plans[i], mem.held, own ? mem.t : 0) + (own ? 4 : 0);
            if (sc > bestScore) { bestScore = sc; best = plans[i]; }
        }
        if (best !== mem.plan) mem.t = 0;
        return best;
    }

    return {
        play: function (s, G, mem) {
            // Replan every few ticks, and at once after a respawn.
            if (!mem.plan || mem.k >= REPLAN || Math.abs(s.p.x - (mem.x || 0)) > 64) { mem.plan = choose(s, G, mem); mem.k = 0; }
            // The plans were scored knowing whether JUMP is still held from
            // the last one (then pressing on is no new jump).
            var go = act(mem.plan, s.p, mem.t, mem.held);
            mem.k++; mem.t++; mem.x = s.p.x; mem.held = go.a;
            return { left: go.dir < 0, right: go.dir > 0, a: go.a };
        },
        // Idle (the default) loses: the tide floods the islands when the clock runs out.
        budget: 400
    };
})()
