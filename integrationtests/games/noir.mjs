#!/usr/bin/env node
// Phone legibility, input safety and ordinary-input wins for Midnight Alley.
// Run: node integrationtests/games/noir.mjs
import assert from 'node:assert/strict';
import { startSession } from './lib.mjs';
import { PHONES } from './touch.mjs';

const { page, base, close } = await startSession();
try {
    await page.goto(`${base}/index.html`);
    await page.eval(`var register=SnoGame.register;
        SnoGame.register=function(theme,def){
            if(theme==='noir'){window.__noirDef=def;SnoGame.register=register;}
            return register.call(SnoGame,theme,def);
        };SnoGame.launch('noir');`);
    await page.waitFor('window.__noirDef', 'noir definition');
    const visual = await page.eval(`(function(){
        var G=SnoGame,def=__noirDef,touch=G.isTouch,text=G.text,labels=[];
        var pic=document.createElement('canvas');pic.width=960;pic.height=540;
        var ctx=pic.getContext('2d'),sameRules=true,lessRain=true,lines=[],visibleRing=false;
        try{
            for(var level=1;level<=10;level++){
                G.isTouch=function(){return false;};var desktop=def.init(level);
                G.isTouch=function(){return true;};var phone=def.init(level);
                sameRules=sameRules&&desktop.cfg===phone.cfg&&desktop.wind===phone.wind;
                lessRain=lessRain&&phone.rain.length<desktop.rain.length;
                // Worst combined ammo warnings must fit separate columns,
                // below moving targets; the streak may reach three digits.
                phone.reload=.5;phone.ammo=0;phone.streak=123;phone.dim=1;
                phone.targets=[{kind:'thug',def:{hostile:true},phase:'aim',sc:1,
                    x:490,y:62,hx:490,hy:86,bottom:154,hp:1,t:2.5,draw:3,age:1,
                    slot:{type:'w'},clip:null}];
                G.text=function(str,x,y,o){labels.push({text:str,x:x,y:y,size:o.size,align:o.align});};
                def.draw(phone,ctx);
                // Deadline rings are painted after darkness, not dimmed with
                // the facade, even during reload and streak warnings.
                var pixel=ctx.getImageData(515,86,1,1).data;
                visibleRing=visibleRing||pixel[0]>=160;
            }
            for(var label of labels){
                if(!/^(RELOADING|STREAK)/.test(label.text))continue;
                ctx.font=G.font(label.size,true);
                var width=ctx.measureText(label.text).width;
                lines.push({text:label.text,left:label.align==='right'?label.x-width:label.x,
                    right:label.align==='right'?label.x:label.x+width,y:label.y,size:label.size});
            }
            return {sameRules:sameRules,lessRain:lessRain,lines:lines,visibleRing:visibleRing};
        }finally{G.isTouch=touch;G.text=text;}
    })()`);
    assert.equal(visual.sameRules, true, 'phone play must keep the same level and weather rules');
    assert.equal(visual.lessRain, true, 'phone rain must leave more space to read silhouettes');
    assert.equal(visual.visibleRing, true, 'threat deadlines must remain visible during darkness and reload');
    for (let i = 0; i < visual.lines.length; i += 2) {
        const [load, streak] = visual.lines.slice(i, i + 2);
        assert.ok(load.right < streak.left, 'reload and long streak warnings must not overlap');
        assert.ok(load.y > 510 && streak.y > 510, 'ammo labels must stay below the street targets');
        assert.ok(load.size >= 28 && streak.size >= 28, 'phone ammo warnings must be legible');
    }
    for (const mode of [null, ...PHONES]) {
        if (mode) await page.emulatePhone(mode.width, mode.height);
        const result = await page.eval(`(function(){
            var G=SnoGame,results=[];
            for(var level of [1,5,10]){
                G.debug.start(level);var ticks=0,nextShot=24;
                while(ticks<24000&&G.debug.state().screen==='play'){
                    var s=G.debug.s(),input={};
                    var targets=s.targets.filter(function(tg){return tg.def.hostile&&tg.phase==='aim'&&tg.age>.35&&tg.hx>6&&tg.hx<954;});
                    targets.sort(function(a,b){return b.t/b.draw-a.t/a.draw;});
                    if(s.ammo===0&&s.reload<=0)input.b=true;
                    else if(targets.length&&ticks>=nextShot&&s.reload<=0&&s.cool<=0){
                        input.mouse={x:targets[0].hx,y:targets[0].hy,down:true};nextShot=ticks+24;
                    }
                    G.debug.step(1,input);ticks++;
                }
                results.push({level:level,screen:G.debug.state().screen,ticks:ticks});
            }
            G.debug.start(1);G.debug.step(24000,{});
            return {wins:results,idle:G.debug.state().screen,errors:G.debug.errors.slice()};
        })()`);
        for (const win of result.wins) assert.equal(win.screen, win.level === 10 ? 'victory' : 'clear', `${mode?.name || 'desktop'} level ${win.level} must clear through aim/fire/reload input`);
        assert.equal(result.idle, 'over', 'idle play must lose');
        assert.deepEqual(result.errors, [], 'no game exceptions');
        console.log(`ok   noir ${mode?.name || 'desktop'}: ordinary-input wins at 1/5/10 and idle loss`);
    }
    const safety = await page.eval(`(function(){
        var G=SnoGame;
        function target(level,kind){
            G.debug.start(level);
            for(var i=0;i<12000;i++){
                var s=G.debug.s(),tg=s.targets.find(function(t){return t.kind==='thug'&&t.phase==='aim';});
                if(tg){
                    // Isolate the hit geometry from spawning: an innocent
                    // occupies the same opening, and a hostage shares it.
                    tg.kind=kind;tg.def={hostile:kind!=='civ',score:100};
                    if(kind==='civ')tg.phase='stay';
                    if(kind==='hostage')tg.hx=tg.x+24;
                    s.targets=[tg];return {s:s,tg:tg};
                }
                G.debug.step(1,{});
                if(G.debug.state().screen!=='play')G.debug.start(level);
            }
            throw new Error('missing target '+kind);
        }
        var shot=target(1,'thug');shot.s.hovered=true;
        G.debug.step(1,{mouse:{x:shot.tg.hx+30,y:shot.tg.hy,down:true}});
        var assisted=shot.s.busts===1;
        shot=target(1,'civ');var lives=G.lives;
        G.debug.step(1,{mouse:{x:shot.tg.hx,y:shot.tg.hy,down:true}});
        var innocent=G.lives===lives-1;
        shot=target(5,'hostage');lives=G.lives;
        G.debug.step(1,{mouse:{x:shot.tg.x-8,y:shot.tg.y+42,down:true}});
        return {assisted:assisted,innocent:innocent,hostage:G.lives===lives-1};
    })()`);
    assert.equal(safety.assisted, true, 'phone tap tolerance must survive previous mouse hover');
    assert.equal(safety.innocent, true, 'a direct civilian tap must still cost a life');
    assert.equal(safety.hostage, true, 'a direct hostage tap must still cost a life');
    assert.deepEqual(page.problems, [], 'no browser errors');
    console.log('ok   noir phone labels, overlapping warnings and unchanged rules');
} finally { await close(); }
