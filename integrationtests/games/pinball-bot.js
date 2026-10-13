// Ordinary plunger, flipper and nudge input only; never change game state.
(function () {
    var charge = 0, left = 0, right = 0;
    return function (i, s) {
        var input = {}, lane = s.balls.some(function (b) { return b.inLane && b.y > 510 && Math.abs(b.vy) < 40; });
        if (lane) { charge++; input.a = charge % 75 < 55; }
        else charge = 0;
        if (left > 0) left--;
        if (right > 0) right--;
        s.balls.forEach(function (b) {
            if (b.inLane || b.held) return;
            if (b.y > 460 && b.y < 507 && b.vy > 20) {
                if (b.x < 480 && left === 0) left = 12;
                if (b.x >= 452 && right === 0) right = 12;
            }
            if (b.y > 485 && Math.abs(b.x - 466) < 25 && s.tilt < 0.55 && s.nudgeT <= 0) {
                input[s.touch ? 'b' : 'down'] = true;
            }
        });
        input.left = left > 1;
        if (s.touch) input.a = input.a || right > 1;
        else input.right = right > 1;
        return input;
    };
})()
