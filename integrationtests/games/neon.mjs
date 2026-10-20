#!/usr/bin/env node
// Pixel regressions for Light Cycles' cached arena layers, in real Chrome.
// Run: node integrationtests/games/neon.mjs
import assert from 'node:assert/strict';
import { startSession } from './lib.mjs';

const { page, base, close } = await startSession();
try {
    await page.goto(`${base}/index.html`);
    await page.eval(`window.__neonDef=null;
        var register=SnoGame.register;
        SnoGame.register=function(theme,def){
            if(theme==='neon'){window.__neonDef=def;SnoGame.register=register;}
            return register.call(SnoGame,theme,def);
        };
        SnoGame.launch('neon');`);
    await page.waitFor('window.__neonDef', 'neon definition');
    const result = await page.eval(`(function(){
        var pic=document.createElement('canvas');pic.width=960;pic.height=540;
        var ctx=pic.getContext('2d'),def=window.__neonDef;
        function resize(scale){
            pic.width=Math.round(960*scale);pic.height=Math.round(540*scale);
            ctx.setTransform(scale,0,0,scale,0,0);
        }
        function scene(level,ring){
            var s=def.init(level);s.phase='run';s.time=2;s.ring=ring;s.cycles=[];
            return s;
        }
        function pixels(s){
            ctx.clearRect(0,0,961,541);
            ctx.save();def.draw(s,ctx);ctx.restore();
            return ctx.getImageData(0,0,pic.width,pic.height).data;
        }
        function same(a,b){return a.every(function(v,i){return v===b[i];});}
        var stable=true,animated=true;
        for(var level=1;level<=3;level++){
            var state=scene(level,0),first=pixels(state);
            stable=stable&&same(first,pixels(state));
            state.time+=0.5;animated=animated&&!same(first,pixels(state));
        }
        var s=scene(3,0),before=pixels(s);
        s.ring=3;var collapsed=pixels(s),fresh=pixels(scene(3,3));
        s.ring=0;var reset=pixels(s);
        s.ring=3;s.time=2;
        var warningBefore=pixels(s);s.time+=0.2;var warningAfter=pixels(s);
        // The warning crosses this pixel far from the scan line and border
        // glow. Its alpha must animate independently of the moving scan.
        var warningPixel=(120*960+42)*4;
        var warningAnimated=!same(warningBefore.slice(warningPixel,warningPixel+4),
            warningAfter.slice(warningPixel,warningPixel+4));
        var resized=true,native=true;
        for(var scale of [4/3,1.37,2,3,1]){
            resize(scale);s.ring=3;s.time=2;
            var cached=pixels(s),uncached=pixels(scene(3,3));
            resized=resized&&same(cached,uncached);
            // Each major vertical grid line is drawn directly as a reference:
            // averaging across neighbouring pixels would miss a soft cache.
            var reference=document.createElement('canvas');
            reference.width=pic.width;reference.height=pic.height;
            var rc=reference.getContext('2d');rc.scale(scale,scale);
            rc.fillStyle='#0b001a';rc.fillRect(0,0,960,540);
            rc.strokeStyle='rgba(0,245,255,0.13)';rc.lineWidth=1;
            rc.beginPath();rc.moveTo(96.5,33);rc.lineTo(96.5,537);rc.stroke();
            var expected=rc.getImageData(0,0,pic.width,pic.height).data;
            var y=Math.round(150*scale);
            for(var x=Math.floor(94*scale);x<=Math.ceil(99*scale);x++){
                var offset=(y*pic.width+x)*4;
                for(var channel=0;channel<4;channel++)
                    native=native&&Math.abs(cached[offset+channel]-expected[offset+channel])<=1;
            }
        }
        resize(1);
        return {
            stable:stable,animated:animated,
            collapseVisible:!same(before,collapsed),
            collapseCorrect:same(collapsed,fresh),resetCorrect:same(reset,before),
            resizeCorrect:resized,nativeResolution:native,warningAnimated:warningAnimated,
            layoutChanges:!same(pixels(scene(1,0)),pixels(scene(3,0)))
        };
    })()`);
    assert.equal(result.stable, true, 'cached frames must match the initial render on all three levels');
    assert.equal(result.animated, true, 'caching must not freeze the scan line or warnings');
    assert.equal(result.warningAnimated, true, 'the collapse warning must animate independently of the scan line');
    assert.equal(result.collapseVisible, true, 'a collapsed ring must change the arena pixels');
    assert.equal(result.collapseCorrect, true, 'a collapsed ring must match an uncached render');
    assert.equal(result.resetCorrect, true, 'resetting the ring must remove the old collapsed border');
    assert.equal(result.resizeCorrect, true, 'resizing must refresh both layers at the new scale');
    assert.equal(result.nativeResolution, true, 'cached grid lines must retain native device resolution');
    assert.equal(result.layoutChanges, true, 'a new level must render its own obstacles');
    const mobile = await page.eval(`(function(){
        var G=SnoGame,def=window.__neonDef,isTouch=G.isTouch,text=G.text;
        var pic=document.createElement('canvas');pic.width=960;pic.height=540;
        var ctx=pic.getContext('2d'),labels=[],sameRules=true,minHudSize=21;
        try{
            for(var level=1;level<=3;level++){
                G.isTouch=function(){return false;};var desktop=def.init(level);
                G.isTouch=function(){return true;};var phone=def.init(level);
                sameRules=sameRules&&desktop.cfg===phone.cfg&&
                    desktop.base.every(function(v,i){return v===phone.base[i];})&&
                    JSON.stringify(desktop.cycles)===JSON.stringify(phone.cycles);
                ctx.font=G.font(21);
                var width=ctx.measureText(def.hud(phone)+'   ♥♥♥♥').width;
                minHudSize=Math.min(minHudSize,21*Math.min(1,412/width));
            }
            G.text=function(str,x,y,opts){labels.push({text:str,y:y,size:opts.size});};
            phone=def.init(2);phone.note={text:'TRAILS LOCKED',t:2};
            def.draw(phone,ctx);
            return {sameRules:sameRules,minHudSize:minHudSize,labels:labels,
                fourWay:def.touch.dirs===4,unusedHidden:def.touch.hide.includes('b')};
        }finally{G.isTouch=isTouch;G.text=text;}
    })()`);
    assert.equal(mobile.sameRules, true, 'mobile must retain every level layout, rider and rule');
    assert.ok(mobile.minHudSize >= 18, 'the mobile HUD must fit without shrinking below 18 canvas pixels');
    for (const name of ['YOU', 'TRAILS LOCKED', 'ROUND 1 · FIRST TO 2']) {
        const label = mobile.labels.find((label) => label.text === name);
        assert.ok(label && label.size >= 24 && label.y > 30, `${name} must be readable below the HUD`);
    }
    assert.equal(mobile.fourWay, true, 'grid steering must select one direction per thumb gesture');
    assert.equal(mobile.unusedHidden, true, 'the unused B button must stay hidden');
    // The campaign's mechanics, each on its own: riders and round quotas per
    // level, the boost draining and refilling, fading trails that lock, and
    // the finale's collapse taking a rider on the outer ring with it.
    const rules = await page.eval(`(function(){
        var G=SnoGame,def=window.__neonDef,saved={win:G.win,loseLife:G.loseLife,addScore:G.addScore,a:G.key.a},won=0;
        function run(level){var s=def.init(level);s.phase='run';return s;}
        try{
            G.win=function(){won++;};G.loseLife=function(){return 1;};G.addScore=function(){};
            var cfg=[1,2,3].map(function(l){var c=def.init(l).cfg;
                return [c.riders.join('+'),c.need,c.decay||0,c.shrink?c.shrink.every:0,c.layout||''].join(' ');});
            var s=run(1);G.key.a=true;
            for(var i=0;i<30;i++)def.update(s,1/60);
            var drained=s.me.boosting&&s.me.charge<0.8;
            G.key.a=false;var low=s.me.charge;
            for(i=0;i<30;i++)def.update(s,1/60);
            var refilled=!s.me.boosting&&s.me.charge>low;
            s=run(2);s.roundT=11.99;def.update(s,1/60);
            var locked=s.locked&&s.note.text==='TRAILS LOCKED';
            s=run(3);var expert=s.cycles[1];expert.y=0;expert.dir=0;s.shrinkT=0.001;
            def.update(s,1/60);
            return {cfg:cfg,drained:drained,refilled:refilled,locked:locked,
                collapse:s.ring===1&&!expert.alive&&s.wins===1&&won===0&&s.phase==='end'};
        }finally{G.win=saved.win;G.loseLife=saved.loseLife;G.addScore=saved.addScore;G.key.a=saved.a;}
    })()`);
    assert.deepEqual(rules.cfg, ['rookie+scout 2 0 0 ', 'hunter+scout+rookie 2 80 0 bars', 'expert 3 0 6 pillars']);
    assert.equal(rules.drained, true, 'holding BOOST must boost and drain the charge');
    assert.equal(rules.refilled, true, 'the charge must come back after the boost');
    assert.equal(rules.locked, true, 'fading trails must lock after a while');
    assert.equal(rules.collapse, true, 'a collapsing ring must derez the expert riding on it and win the round');
    console.log('ok   neon riders, round quotas, boost, trail lock and the collapsing duel');
    assert.deepEqual(page.problems, [], 'no browser errors');
    console.log('ok   neon arena: caching, scaling, animation, mobile labels/HUD and unchanged level rules');
} finally {
    await close();
}
