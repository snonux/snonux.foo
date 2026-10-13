// Recorded pad controls for seeded levels, found against actual tile physics.
// Each digit holds one input for 12 ticks: 0 right, 1 right+jump, 2 release,
// 3 jump, 4 left, 5 left+jump. No state, score or life writes, and no win hook.
(function () {
    var G = SnoGame, actions = [{right:true}, {right:true,a:true}, {}, {a:true}, {left:true}, {left:true,a:true}];
    var plans = {"1": "00000100000000001001101011001000000010010010011010000010000001001001000000001000000100010000100010000000000000000000000100110000000010000000000", "5": "00000100001000010000100000000000000010011010000000000000000000010000000000000000000100001004040222222234022220014000055202053250042015423300504201000000000000100000100000000000000000000000000000100000000000000000000001000010001001000000000100001000000000", "10": "00000001000000010010000010001000010000000000100110100000014001000000000001010010000000010042152010000010000001520110000010000100110000100110100000000100010000000000001000100000000000000001000001000100110010100000000000000000010011010010000001001100001000000001001101001000000000"};
    return Object.keys(plans).map(function (name) {
        var level = Number(name), plan = plans[name];
        G.debug.start(level);
        for (var i = 0; i < plan.length && G.debug.state().screen === 'play'; i++) G.debug.step(12, actions[Number(plan[i])]);
        var result = { level: level, screen: G.debug.state().screen, lives: G.debug.state().lives, fruit: G.debug.s().got };
        G.debug.start(level); G.debug.step(6000, {});
        result.idle = G.debug.state().screen;
        return result;
    });
})()
