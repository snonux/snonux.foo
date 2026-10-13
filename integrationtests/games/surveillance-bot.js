// Read-only steering: walls, visible threat locations, drive icons and EMP.
(function () {
    function steer(s, memory) {
        const p = s.player, tile = (x, y) => s.map[y - 1]?.[x] || '#';
        const blocked = (x, y) => '#r<>^v'.includes(tile(x, y));
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
        const live = l => l.off <= 0 && (l.move || (s.clock + l.phase) % (3.3 - s.level * .02) < 1.5);
        const risk = (x, y) => {
            let cost = 0;
            for (const g of s.guards) if (dist(g, x, y) < 38 || sees(g, x, y, 160, 1.5)) cost += 50;
            for (const c of s.cams) if (c.off <= .7 && sees(c, x, y, 195, 1.1)) cost += 12;
            for (const d of s.drones) if (d.off <= .7 && dist(d, x, y) < 74 && clear(d, x, y)) cost += 18;
            for (const l of s.lights) if (l.off <= .7 && dist(l, x, y) < 60) cost += 12;
            for (const l of s.lasers) if (live(l) && beamDistance(l, x, y) < 18) cost += s.emp ? 4 : 20;
            if (s.plates.some(pl => pl.off <= .7 && dist(pl, x, y) < 16)) cost += s.emp ? 4 : 80;
            return cost;
        };
        if (!memory.next || Math.hypot(memory.next.x - p.cx, memory.next.y - p.cy) < 3 || memory.age++ > 10) {
            const start = Math.floor(p.cy / 30) * 32 + Math.floor(p.cx / 30), costs = { [start]: 0 }, prev = {}, queue = [start];
            let goals = s.open ? [s.exit] : s.drives.filter(d => !d.got);
            if (s.det > .4) {
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
                memory.next = { x: end % 32 * 30 + 15, y: Math.floor(end / 32) * 30 + 15 };
            }
            memory.age = 0;
        }
        const n = memory.next || p, dx = n.x - p.cx, dy = n.y - p.cy;
        const near = s.plates.some(o => o.off <= .8 && dist(o, p.cx, p.cy) < 42) || s.lasers.some(l => live(l) && beamDistance(l, p.cx, p.cy) < 28 && beamDistance(l, n.x, n.y) < 16);
        const emp = s.emp > 0 && (near || s.det > .7 && s.seen);
        const press = emp && !memory.empHeld;
        memory.empHeld = emp;
        return { right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2, a: press };
    }
    return steer;
})()
