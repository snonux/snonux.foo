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
        for(var level=1;level<=10;level++){
            var state=scene(level,0),first=pixels(state);
            stable=stable&&same(first,pixels(state));
            state.time+=0.5;animated=animated&&!same(first,pixels(state));
        }
        var s=scene(8,0),before=pixels(s);
        s.ring=3;var collapsed=pixels(s),fresh=pixels(scene(8,3));
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
            var cached=pixels(s),uncached=pixels(scene(8,3));
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
    assert.equal(result.stable, true, 'cached frames must match the initial render on all ten levels');
    assert.equal(result.animated, true, 'caching must not freeze the scan line or warnings');
    assert.equal(result.warningAnimated, true, 'the collapse warning must animate independently of the scan line');
    assert.equal(result.collapseVisible, true, 'a collapsed ring must change the arena pixels');
    assert.equal(result.collapseCorrect, true, 'a collapsed ring must match an uncached render');
    assert.equal(result.resetCorrect, true, 'resetting the ring must remove the old collapsed border');
    assert.equal(result.resizeCorrect, true, 'resizing must refresh both layers at the new scale');
    assert.equal(result.nativeResolution, true, 'cached grid lines must retain native device resolution');
    assert.equal(result.layoutChanges, true, 'a new level must render its own obstacles');
    assert.deepEqual(page.problems, [], 'no browser errors');
    console.log('ok   neon arena: all levels, animation, collapse, reset, scaling and layout changes');
} finally {
    await close();
}
