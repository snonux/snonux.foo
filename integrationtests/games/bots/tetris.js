// Block Blaster campaign bot: picks the lowest gap it can fill (or a steel
// plate to crack), walks the launcher there with ← → (on a phone it taps
// the column instead) and fires, pausing THINK seconds between shots like a
// player who has to look first (mem.think overrides it: tetris-local.mjs
// plays at a casual 0.7 s). While the wall is far away it holds ↓ for the
// rush bonus. Ordinary input only.
(function () {
    var COLS = 12, CELL = 36, TOP = 40, LINE = TOP + 12 * CELL, THINK = 0.4;

    // The column to fire up next: the lowest gap a block fills (or a steel
    // plate it cracks), nearer ones first, skipping columns with a shot in flight.
    function target(s) {
        var best = -1, cost = Infinity, c, low, armour, i;
        for (c = 0; c < COLS; c++) {
            for (i = 0; i < s.shots.length && s.shots[i].c !== c; i++);
            if (i < s.shots.length) continue;
            for (low = 0; low < s.rows.length && !s.rows[low].cells[c]; low++);
            if (low >= s.rows.length) continue;
            armour = s.rows[low].cells[c].kind === 'armour';
            if (!armour && (low === 0 || s.rows[low - 1].stub)) continue;
            var value = low * 20 + Math.abs(c - s.col) + (armour ? 3 : 0);
            if (value < cost) { best = c; cost = value; }
        }
        return best;
    }

    return {
        play: function (s, G, mem) {
            mem.wait = (mem.wait || 0) - 1 / 60;
            var c = target(s), rush = LINE - s.y > 6 * CELL;
            if (c < 0 || mem.wait > 0) return { down: rush };
            if (s.touch) {
                // A tap is one touch: down on this tick, lifted on the next.
                mem.wait = mem.think || THINK;
                return { mouse: { x: 480 + (264 + (c + 0.5) * CELL - 480) * 1.5, y: 460, down: true } };
            }
            if (c !== s.col) return { left: c < s.col, right: c > s.col, down: rush };
            mem.wait = mem.think || THINK;
            return { a: true };
        },
        // Idle (the default) loses: the wall walks down to the launcher.
        budget: 300
    };
})()
