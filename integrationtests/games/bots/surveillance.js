// Blind Spot campaign bot: a burglar who reads the security console. Every
// few steps it plans a route over the floor tiles to the nearest drive (the
// exit once all are taken) with Dijkstra, where each tile costs one plus a
// risk for every cone, drone ring, searchlight, live beam and live plate
// that would see it; with the meter rising it heads for the nearest tile
// nobody watches instead. It walks, never sprints, and fires the EMP once
// when a live plate or beam stands in its way, or when it is being seen
// with the meter nearly full. The pulse is one fresh press; holding the
// button would not fire again.
//
// fail() is the same burglar in a hurry: it sprints the shortest way to
// each drive as if nothing were watching, which is what the levels are
// built to punish.
(function () {
    function steer(s, G, mem, reckless) {
        // Caught: back at the entrance with every drive returned, so the old
        // plan is void.
        if (G.lives !== mem.lives) { mem.next = null; mem.flee = 0; mem.lives = G.lives; }
        const p = s.player, tile = (x, y) => s.map[y - 1]?.[x] || '#';
        const blocked = (x, y) => '#<>^v'.includes(tile(x, y));
        const dist = (o, x, y) => Math.hypot(o.x - x, o.y - y);
        const clear = (o, x, y) => {
            const n = Math.ceil(dist(o, x, y) / 4);
            for (let i = 1; i < n; i++) if (tile(Math.floor((o.x + (x - o.x) * i / n) / 30), Math.floor((o.y + (y - o.y) * i / n) / 30)) === '#') return false;
            return true;
        };
        const sees = (o, x, y, range, fov) => dist(o, x, y) < range && Math.abs(Math.atan2(Math.sin(Math.atan2(y - o.y, x - o.x) - o.ang), Math.cos(Math.atan2(y - o.y, x - o.x) - o.ang))) < fov / 2 && clear(o, x, y);
        const beamDistance = (l, x, y) => {
            const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
            const t = Math.max(0, Math.min(1, ((x - l.x1) * dx + (y - l.y1) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - l.x1 - dx * t, y - l.y1 - dy * t);
        };
        // A tripwire is live now or within `ahead` seconds (sampled), so a
        // crossing never starts just before it comes back.
        const live = (l, ahead) => {
            for (let t = 0; t <= (ahead || 0) + 1e-9; t += .1)
                if (l.off - t <= 0 && (s.clock + t + l.phase) % s.def.blink < 1.5) return true;
            return false;
        };
        const plateTile = (x, y) => s.plates.find(pl => Math.floor(pl.x / 30) === Math.floor(x / 30) && Math.floor(pl.y / 30) === Math.floor(y / 30));
        // The last charge is kept for a plate door while drives remain.
        const spare = s.emp > (s.open ? 0 : 1);
        const guardRisk = (x, y) => {
            let cost = 0;
            for (const g of s.guards) {
                if (dist(g, x, y) < 38 || sees(g, x, y, 160, 1.5)) cost += 50;
                let from = g;
                g.path.slice(0, 4).forEach((q, k) => {
                    if (dist(q, x, y) < 45) cost += 25;
                    const ahead = { x: q.x, y: q.y, ang: Math.atan2(q.y - from.y, q.x - from.x) };
                    if (dist(from, q.x, q.y) > 1 && sees(ahead, x, y, 160, 1.5)) cost += 30 / (k + 1);
                    from = q;
                });
            }
            return cost;
        };
        const risk = (x, y) => {
            if (reckless) return 0;
            let cost = guardRisk(x, y);
            for (const c of s.cams) if (c.off <= .7 && sees(c, x, y, 195, 1.1)) cost += 12;
            for (const d of s.drones) if (d.off <= .7 && dist(d, x, y) < 74 && clear(d, x, y)) cost += 18;
            for (const l of s.lights) if (l.off <= .7 && dist(l, x, y) < 60) cost += 12;
            for (const l of s.lasers) if (live(l) && beamDistance(l, x, y) < 18) cost += 6;
            const pl = plateTile(x, y);
            if (pl && pl.off <= 1) cost += spare || s.open && s.emp ? 6 : 80;
            return cost;
        };
        if (mem.flee > 0) mem.flee--;
        if (!mem.next || Math.hypot(mem.next.x - p.cx, mem.next.y - p.cy) < 3 || mem.age++ > 10) {
            const start = Math.floor(p.cy / 30) * 32 + Math.floor(p.cx / 30), costs = { [start]: 0 }, prev = {}, queue = [start];
            let goals = s.open ? [s.exit] : s.drives.filter(d => !d.got);
            if (!reckless && (s.det > .4 || mem.flee > 0)) {
                goals = [];
                for (let y = 2; y < 17; y++) for (let x = 1; x < 31; x++)
                    if (!blocked(x, y) && risk(x * 30 + 15, y * 30 + 15) === 0) goals.push({ x: x * 30 + 15, y: y * 30 + 15 });
            }
            const goalKeys = goals.map(o => Math.floor(o.y / 30) * 32 + Math.floor(o.x / 30));
            let end;
            while (queue.length) {
                queue.sort((a, b) => costs[a] - costs[b]); const k = queue.shift();
                if (goalKeys.includes(k)) { end = k; break; }
                const x = k % 32, y = Math.floor(k / 32);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (blocked(x + dx, y + dy)) continue;
                    const nk = (y + dy) * 32 + x + dx, c = costs[k] + 1 + risk((x + dx) * 30 + 15, (y + dy) * 30 + 15);
                    if (costs[nk] === undefined || c < costs[nk]) { costs[nk] = c; prev[nk] = k; if (!queue.includes(nk)) queue.push(nk); }
                }
            }
            if (end !== undefined) {
                while (prev[end] !== undefined && prev[end] !== start) end = prev[end];
                mem.next = { x: end % 32 * 30 + 15, y: Math.floor(end / 32) * 30 + 15 };
            }
            mem.age = 0;
        }
        const n = mem.next || p, dx = n.x - p.cx, dy = n.y - p.cy;
        // Gates: a plate on the next tile needs a pulse first (or a wait for
        // the recharge); a tripwire across it is waited out until it has
        // gone dark for long enough to cross.
        const pl = plateTile(n.x, n.y), onPlate = pl && plateTile(p.cx, p.cy) === pl;
        const plateShut = pl && !onPlate && pl.off <= 1;
        // A step along a tripwire's own corridor stays in it for its whole
        // length: that is sprinted, and needs a dark spell long enough.
        const along = l => Math.abs(l.x2 - l.x1) > Math.abs(l.y2 - l.y1) === Math.abs(dx) > Math.abs(dy);
        const inBeam = s.lasers.some(l => beamDistance(l, p.cx, p.cy) < 16 && along(l));
        const beamShut = s.lasers.some(l => beamDistance(l, n.x, n.y) < 20 && beamDistance(l, p.cx, p.cy) > 16 &&
            live(l, along(l) ? Math.hypot(l.x2 - l.x1, l.y2 - l.y1) / 205 + .3 : .7));
        const devices = s.cams.concat(s.drones, s.lights).some(o => o.sees);
        const emp = s.emp > 0 && (plateShut || devices && (s.det > .85 || s.det > .6 && spare));
        const press = emp && !mem.empHeld;
        mem.empHeld = emp;
        // A step that walks into a guard's (coming) view waits instead, and
        // so does one through a shut door - unless a guard is coming to the
        // place where it waits: then it backs off to a quiet tile first.
        if (reckless) return { right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2 };
        const here = guardRisk(p.cx, p.cy);
        if (beamShut || plateShut && !emp) {
            if (here <= 0 || mem.flee > 0 || s.det >= .4) return { a: press };
            mem.flee = 45; mem.next = null;
        } else if (s.det < .25 && guardRisk(n.x, n.y) > here + 20) {
            if (here <= 0 || mem.flee > 0) return { a: press };
            mem.flee = 45; mem.next = null;
        }
        // Spotted by a guard: sprint for cover. It is loud, but the guard
        // already knows, and a walk is barely faster than its chase.
        const run = s.det > .25 && s.guards.some(g => g.sees) || inBeam;
        return { right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2, a: press, b: run };
    }
    return {
        play: function (s, G, mem) { return steer(s, G, mem, false); },
        fail: function (s, G, mem) { return steer(s, G, mem, true); },
        budget: 360
    };
})()
