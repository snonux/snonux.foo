// Carrier Lost campaign bot: one FLIP button. When the next hazard on the
// packet's own wire comes within a short lead of its deadly stretch, it
// taps FLIP; inside a jammed zone no flip works, so a hazard there is
// answered before the zone begins. A tap is a fresh press: the bot lets go
// for a tick after each one, so holding never counts twice.
({
    play: function (s, G, mem) {
        if (mem.held) { mem.held = false; return {}; }
        if (!s.ground || s.redial > 0) return {};
        var h = s.haz.find(function (h) { return h.lane === s.g && h.d1 > s.x; });
        if (!h) return {};
        var at = h.d0;
        s.zones.forEach(function (z) {
            if (z.type === 'jam' && h.d0 >= z.x0 && h.d0 < z.x1) at = Math.min(at, z.x0);
        });
        mem.held = s.x >= at - s.v * 0.12;
        return { a: mem.held };
    },
    budget: 300
})
