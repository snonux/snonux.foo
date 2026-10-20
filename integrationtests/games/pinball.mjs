// Pinball phone feedback and ordinary-input wins. Run: node integrationtests/games/pinball.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

// The campaign bot (bots/pinball.js) plays every level by plunger, flipper
// and nudge input; each run records the nudges, tilts and multiball time.
const bot = readFileSync(new URL('./bots/pinball.js', import.meta.url), 'utf8');
const { page, base, close } = await startSession();
try {
    for (const mode of [null, ...PHONES]) {
        if (mode) await page.emulatePhone(mode.width, mode.height);
        await page.goto(`${base}/index.html`);
        await page.eval(`var register=SnoGame.register;
            SnoGame.register=function(theme,def){
                if(theme==='pinball'){window.__pinballDef=def;SnoGame.register=register;}
                return register.call(SnoGame,theme,def);
            };SnoGame.launch('pinball');`);
        await page.waitFor('SnoGame.debug.state().registered', 'pinball registration');
        const results = await page.eval(`(function(){
            var G=SnoGame,results=[],originalRandom=Math.random;
            try {
                for(var level of [1,2,3]){
                    var rng=G.rng(12345);Math.random=rng;
                    G.debug.start(level);var b=(0,eval)(${JSON.stringify(bot)}),mem={},ticks=0,nudges=0,tilts=0,multiball=0;
                    while(G.debug.state().screen==='play'&&ticks<108000){
                        var before=G.debug.s(),nudge=before.nudgeT,tilted=before.tilted;
                        G.debug.step(1,function(i,s){return b.play(s,G,mem);});ticks++;
                        var s=G.debug.s();
                        if(s.nudgeT>nudge)nudges++;
                        if(s.tilted&&!tilted)tilts++;
                        if(s.multiball)multiball++;
                    }
                    results.push({level:level,screen:G.debug.state().screen,ticks:ticks,done:G.debug.s().done,points:G.debug.s().pts,nudges:nudges,tilts:tilts,multiball:multiball});
                }
                Math.random=G.rng(12345);G.debug.start(1);G.debug.step(108000,{});
                return {wins:results,idle:G.debug.state().screen,errors:G.debug.errors.slice()};
            }finally{Math.random=originalRandom;}
        })()`);
        for (const win of results.wins) {
            assert.equal(win.screen, win.level === 3 ? 'victory' : 'clear', `${mode?.name || 'desktop'} level ${win.level}: ${JSON.stringify(win)}`);
            assert.equal(win.tilts, 0, 'nudging with an eye on the tilt meter never tilts');
        }
        assert.ok(results.wins[2].multiball > 0, 'level 3 is finished in multiball');
        assert.ok(results.wins.some((w) => w.nudges > 0), 'the bot nudges');
        assert.equal(results.idle, 'over', 'doing nothing must lose');
        assert.deepEqual(results.errors, []);
        if (mode) {
            const labels = await page.eval(`(function(){
                var G=SnoGame,def=window.__pinballDef,text=G.text,labels=[];
                var canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
                var ctx=canvas.getContext('2d');
                try {
                    G.text=function(str,x,y,o){
                        ctx.font=G.font(o.size,o.bold);var width=ctx.measureText(str).width;
                        if(o.max)width=Math.min(width,o.max);
                        labels.push({text:str,x:x,y:y,size:o.size,width:width});
                    };
                    for(var level=1;level<=3;level++){
                        var s=def.init(level);
                        s.hot=true;s.heat=8;s.tilt=2;s.msg='COILS WARM: FLIP AT THE BALL';s.msgT=2;
                        s.pts=s.cfg.target;
                        def.draw(s,ctx);
                        s.tilted=true;s.msg='LOCKS LIT + EXTRA BALL';def.draw(s,ctx);
                    }
                    return labels;
                }finally{G.text=text;}
            })()`);
            assert.ok(labels.some((l) => l.text === 'COILS HOT' && l.size >= 24), 'persistent coil warning must survive another call-out');
            assert.ok(labels.some((l) => l.text === 'NUDGE DANGER' && l.size >= 24), 'simultaneous tilt warning must remain visible');
            assert.ok(labels.some((l) => l.text === 'TILT: REST' && l.size >= 24), 'tilted and overheated states must remain distinct');
            for (const label of labels) {
                if (label.x === 16) {
                    assert.ok(label.size >= 24 && label.x + label.width < 294, `${JSON.stringify(label)} must fit left of the table`);
                }
                if (label.x < 692) continue;
                if (label.y < 260) continue;
                assert.ok(label.x + label.width <= 937, `${JSON.stringify(label)} must fit its phone column`);
                assert.ok(label.y < 510, `${label.text} must stay in the picture`);
            }
        }
        console.log(`ok pinball ${mode?.name || 'desktop'}: ${JSON.stringify(results)}`);
        await page.eval('SnoGame.quit()');
    }
} finally {
    await close();
}
