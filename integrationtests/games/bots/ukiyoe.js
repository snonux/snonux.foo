// Tokaido Crossing campaign bot: input only. The lanes move by fixed rules
// (each lane's speed follows its surging current, the swell is a sine of
// the game clock), so the bot works out where every cart and boat will be
// over the next few seconds, from the state it can read, and searches that
// timeline for the earliest safe series of hops into an empty inn. When no
// inn is in reach it heads for the highest spot that stays safe, lined up
// under an inn. On level 3 it only lands while the ronin rests or is too
// far to reach the door in time. It taps a direction for one tick and lets
// go, as a player taps the pad, and plans again after every hop.
(function () {
    var W = 960, M = 200, LOOP = 960 + M, HOP_X = 40, HOP_T = 0.16, BODY = 11, REACH = 62, TOP = 12;
    var DT = 1 / 60, H = 132, HOP_TICKS = 10, WAIT = 3, BEAM = 40;

    function wrap(x) { return ((x + M) % LOOP + LOOP) % LOOP - M; }

    // The lanes' future, tick by tick, as the game's updateLanes moves them.
    // F[j] is the world after j + 1 more ticks.
    function future(s) {
        var lanes = s.lanes, t = s.time, frames = [];
        var v = lanes.map(function (l) { return l ? l.v : 0; });
        var xs = lanes.map(function (l) { return l ? l.objs.map(function (o) { return o.x; }) : null; });
        for (var j = 1; j <= H; j++) {
            t += DT;
            var f = { t: t, v: [], x: [] };
            for (var r = 0; r < lanes.length; r++) {
                var l = lanes[r];
                if (!l) continue;
                var target = l.base * (1 + l.surge * Math.sin(t * 0.7 + l.row)), vr;
                vr = v[r] += (target - v[r]) * Math.min(1, DT * 1.2);
                xs[r] = xs[r].map(function (x) { return wrap(x + vr * DT); });
                f.v[r] = vr; f.x[r] = xs[r];
            }
            frames.push(f);
        }
        return frames;
    }

    function sunkAt(s, lane, t, cx) {
        return s.swell.on && Math.sin(t * s.swell.w + lane.ph - s.swell.k * cx) < -s.swell.deep + 0.06;
    }

    function roadHit(lane, xs, x) {
        for (var i = 0; i < xs.length; i++) {
            if (x + BODY + 3 > xs[i] + 5 && x - BODY - 3 < xs[i] + lane.objs[i].w - 5) return true;
        }
        return false;
    }

    // Standing at x on `row` in frame f: alive or not, with a few px spare.
    function standOk(s, f, row, x) {
        var lane = s.lanes[row];
        if (!lane) return true;
        var xs = f.x[row];
        if (!lane.river) return !roadHit(lane, xs, x);
        if (x < 14 || x > W - 14) return false;
        for (var i = 0; i < xs.length; i++) {
            var w = lane.objs[i].w;
            if (x > xs[i] + 10 && x < xs[i] + w - 10) return !sunkAt(s, lane, f.t, xs[i] + w / 2);
        }
        return false;
    }

    function innAt(s, x) {
        for (var i = 0; i < s.inns.length; i++) if (!s.inns[i].filled && Math.abs(s.inns[i].x - x) < 26) return s.inns[i];
        return null;
    }

    // The ronin cannot be simulated exactly (he follows the traveller), so
    // a landing counts only while he rests through it or is out of reach
    // even at his top speed.
    function roninOk(s, inn, ticks) {
        var r = s.ronin, secs = ticks * DT;
        if (!r) return true;
        if (r.resting && r.rest > secs + 0.1) return true;
        return Math.abs(r.x - inn.x) > REACH + 8 + r.speed * secs;
    }

    // One hop pressed at node n: the landing node, a goal, or null if the
    // traveller would not survive it.
    function hop(s, F, n, dir) {
        var dx = dir === 'left' ? -HOP_X : dir === 'right' ? HOP_X : 0;
        var r1 = n.row + (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
        if (r1 < 0 || n.x + dx < 16 || n.x + dx > 944 || n.k + HOP_TICKS > H) return null;
        var inn = null;
        if (r1 === TOP) {
            inn = innAt(s, n.x);
            if (!inn || !roninOk(s, inn, n.k + HOP_TICKS)) return null;
            dx = inn.x - n.x;
        }
        var cur = s.lanes[n.row], carry = cur && cur.river ? F[n.k].v[n.row] : 0, vx = dx / HOP_T + carry, x = n.x;
        for (var i = 1; i <= HOP_TICKS; i++) {
            var f = F[n.k + i - 1], th = i * DT, row = th > HOP_T / 2 ? r1 : n.row;
            x = n.x + vx * Math.min(th, HOP_T);
            if (i === HOP_TICKS) break;
            var lane = s.lanes[row];
            if (lane && !lane.river && roadHit(lane, f.x[row], x)) return null;
        }
        if (inn) return { goal: true, k: n.k + HOP_TICKS, row: TOP, x: x, parent: n, act: dir };
        if (!standOk(s, F[n.k + HOP_TICKS - 1], r1, x)) return null;
        return { k: n.k + HOP_TICKS, row: r1, x: x, parent: n, act: dir };
    }

    // Standing still for WAIT ticks (riding the craft on the river).
    function wait(s, F, n) {
        if (n.k + WAIT > H) return null;
        var lane = s.lanes[n.row], x = n.x;
        for (var i = 0; i < WAIT; i++) {
            var f = F[n.k + i];
            if (lane && lane.river) x += f.v[n.row] * DT;
            if (!standOk(s, f, n.row, x)) return null;
        }
        return { k: n.k + WAIT, row: n.row, x: x, parent: n, act: 'wait' };
    }

    // How good a place is to be when the search runs out of time: high up,
    // under an empty inn, away from the edges the river drifts towards.
    function value(s, n) {
        var best = 1e9, v = n.row * 100 + n.k * 0.5;
        for (var i = 0; i < s.inns.length; i++) if (!s.inns[i].filled) best = Math.min(best, Math.abs(s.inns[i].x - n.x));
        if (n.row >= 7) v -= best * 0.6;
        if (s.lanes[n.row] && s.lanes[n.row].river) v -= Math.max(0, 140 - Math.min(n.x, W - n.x)) * 0.5;
        return v;
    }

    function add(s, layers, c) {
        var key = c.row * 1000 + Math.round(c.x / 6), layer = layers[c.k];
        if (layer.has(key)) return;
        c.v = value(s, c);
        layer.set(key, c);
    }

    // Breadth-first over ticks, one node per (tick, row, 6 px), keeping the
    // BEAM most promising nodes of each tick so the search stays small; the
    // first goal found is the earliest arrival.
    function search(s) {
        var F = future(s), layers = [], root = { k: 0, row: s.p.row, x: s.p.x, parent: null, v: 0 }, deepest = root, k, found = null;
        for (k = 0; k <= H; k++) layers.push(new Map());
        layers[0].set(0, root);
        for (k = 0; k < H && !found; k++) {
            var nodes = Array.from(layers[k].values()).sort(function (a, b) { return b.v - a.v; }).slice(0, BEAM);
            for (var i = 0; i < nodes.length && !found; i++) {
                var n = nodes[i];
                if (n.k > deepest.k || (n.k === deepest.k && n.v > deepest.v)) deepest = n;
                var kids = [wait(s, F, n), hop(s, F, n, 'up'), hop(s, F, n, 'left'), hop(s, F, n, 'right'), hop(s, F, n, 'down')];
                for (var j = 0; j < kids.length; j++) {
                    if (!kids[j]) continue;
                    if (kids[j].goal) { found = kids[j]; break; }
                    add(s, layers, kids[j]);
                }
            }
        }
        if (found) return found;
        layers[H].forEach(function (n) { if (deepest.k < H || n.v > deepest.v) deepest = n; });
        return deepest;
    }

    // The plan as (tick offset, direction) presses, earliest first.
    function presses(end) {
        var out = [];
        for (var n = end; n && n.parent; n = n.parent) {
            if (n.act !== 'wait') out.unshift({ k: n.parent.k, dir: n.act });
        }
        return out;
    }

    return {
        play: function (s, G, mem) {
            if (s.dead > 0 || s.p.hop) { mem.plan = null; return {}; }
            if (!mem.plan || s.time > mem.made + 0.5) { mem.plan = presses(search(s)); mem.made = s.time; }
            var next = mem.plan[0];
            if (!next || s.time + DT / 2 < mem.made + next.k * DT) return {};
            mem.plan = null;
            var out = {};
            out[next.dir] = true;
            return out;
        },
        // Negative control: charge straight up without looking.
        fail: function (s, G, mem) {
            mem.n = (mem.n || 0) + 1;
            return { up: mem.n % 12 === 0 };
        },
        budget: 400
    };
})()
