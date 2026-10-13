#!/usr/bin/env node
// Ordinary-input wins and cache scaling for Neon Maze. No state or rule edits.
// Run: node integrationtests/games/pacmaze-play.mjs [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startSession } from './lib.mjs';
const shots = process.argv[2] ? resolve(process.argv[2]) : '';
if (shots) mkdirSync(shots, { recursive: true });
// The route planner reads the grid and ghost positions, and sends only the
// same four directions as the keyboard/pad. Finish a tile before reversing.
const BOT = `(function () {
    var G = SnoGame, dirs = [[0,-1,'up'],[-1,0,'left'],[0,1,'down'],[1,0,'right']];
    function wrap(x,n){return (x+n)%n;}
    function bot(i,s) {
        if (!s || s.dying>0 || s.ready>0 || s.hold>0) return {};
        var p=s.pl, x=p.cx, y=p.cy;
        if(p.p>0.13){ x=wrap(x+p.dx,32); y=wrap(y+p.dy,17); }
        var start=y*32+x, ds=Array(544).fill(Infinity), first=[], seen=Array(544).fill(false);
        ds[start]=0;
        var goal=-1, best=Infinity;
        function open(x,y){var ch=s.grid[y][x]; return !['#','H','='].includes(ch) && (!['g','j'].includes(ch)||s.gateAt[y*32+x].open);}
        function danger(x,y){var cost=0;s.ghosts.forEach(function(g){
            if(g.state!=='roam'||g.scared&&s.fright>1.2)return;
            var dx=Math.abs(x-g.x),dy=Math.abs(y-g.y),d=Math.hypot(Math.min(dx,32-dx),Math.min(dy,17-dy));
            if(d<4)cost+=Math.pow(4-d,2)*6;
        });return cost;}
        for(var n=0;n<544;n++){
            var at=-1,dd=Infinity;
            for(var k=0;k<544;k++)if(!seen[k]&&ds[k]<dd){at=k;dd=ds[k];}
            if(at<0)break;seen[at]=true;var cx=at%32,cy=Math.floor(at/32),ch=s.grid[cy][cx];
            if(at!==start&&(ch==='.'||ch==='o')){
                var score=dd+(ch==='o'&&s.fright<1.2?-6:0);
                if(score<best){goal=at;best=score;}
            }
            if(dd>best+8)break;
            dirs.forEach(function(d,dir){var nx=wrap(cx+d[0],32),ny=wrap(cy+d[1],17),to=ny*32+nx;
                if(!open(nx,ny))return;
                var cost=dd+1+danger(nx,ny);
                if(cost<ds[to]){ds[to]=cost;first[to]=at===start?dir:first[at];}
            });
        }
        if(goal<0)return {};
        var dir=dirs[first[goal]],input={};
        if(p.p>0.13&&dir[0]===-p.dx&&dir[1]===-p.dy) { input[dirs.find(function(d){return d[0]===p.dx&&d[1]===p.dy;})[2]]=true; return input; }
        input[dir[2]]=true;return input;
    }
    var result;for(var ticks=0;ticks<60*360;ticks+=30){ result=G.debug.step(30,bot);if(result.screen!=='play')break; }var state=G.debug.s();
    return {screen:result.screen, level:result.level,lives:result.lives, left:state.left,eaten:state.eaten};
})()`;
const { page, base, close } = await startSession();
try {
    await page.goto(`${base}/index.html`);
    await page.eval(`window.__pacmazeDef=null;var register=SnoGame.register;
        SnoGame.register=function(t,d){if(t==='pacmaze')window.__pacmazeDef=d;return register.call(SnoGame,t,d);};
        SnoGame.launch('pacmaze')`);
    await page.waitFor('__pacmazeDef', 'pacmaze definition');
    const scaled = await page.eval(`(function(){
        var def=__pacmazeDef,pic=document.createElement('canvas'),ctx=pic.getContext('2d');
        function pixels(s,scale){
            pic.width=Math.round(960*scale);pic.height=Math.round(540*scale);
            ctx.setTransform(scale,0,0,scale,0,0);def.draw(s,ctx);
            return ctx.getImageData(0,0,pic.width,pic.height).data;
        }
        for(var level of [1,5,10]){
            var s=def.init(level);
            for(var scale of [1,.40625,1.37,2,1]){
                var cached=pixels(s,scale),fresh=pixels(def.init(level),scale);
                if(!cached.every(function(v,i){return v===fresh[i];}))return false;
            }
        }
        return true;
    })()`);
    assert.equal(scaled, true, 'resized wall caches match a fresh render at phone and desktop scales');
    async function win(level, orientation) {
        await page.eval(`SnoGame.debug.start(${level})`);
        const result = await page.eval(BOT);
        assert.equal(result.screen, level === 10 ? 'victory' : 'clear', `${orientation} level ${level} is winnable`);
        assert.equal(result.level, level);
        assert.equal(result.left, 0);
        console.log('ok  ', orientation, level, result.lives, 'lives left');
    }
    for (const level of [1,5,10]) await win(level, 'desktop');
    await page.eval('SnoGame.debug.start(1)');
    const idle = await page.eval('SnoGame.debug.step(60*150,{})');
    assert.equal(idle.screen, 'over', 'idle player loses');
    for (const [name,width,height] of [['landscape',844,390],['portrait',390,844]]) {
        await page.emulatePhone(width,height);
        await page.goto(`${base}/index.html`);
        await page.eval("SnoGame.launch('pacmaze')");
        await page.waitFor('SnoGame.debug.state().registered', 'phone registration');
        for (const level of [1,5,10]) {
            if (shots) {
                await page.eval(`SnoGame.debug.start(${level});SnoGame.debug.step(180,{left:true})`);
                await page.screenshot(join(shots, `${name}-${level}.jpg`));
            }
            await win(level, name);
        }
        assert.deepEqual(await page.eval('SnoGame.debug.errors'), []);
    }
    assert.deepEqual(page.problems, []);
    console.log('ok   pacmaze cache scaling and idle loss');
} finally {
    await close();
}
