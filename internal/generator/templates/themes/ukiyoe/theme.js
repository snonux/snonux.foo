    // Ukiyo-e splash: a flat-shaded Mount Fuji behind three paper-cut wave
    // flats whose crests roll, with sakura petals drifting across.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,t0=performance.now(),waves=[],petals,pp,N=90,i;
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(50,1,0.1,80);ca.position.set(0,0.6,10);
        var fuji=new THREE.Shape();fuji.moveTo(-6,-2);fuji.lineTo(-0.7,3.2);fuji.lineTo(0.7,3.2);fuji.lineTo(6,-2);
        var m=new THREE.Mesh(new THREE.ShapeGeometry(fuji),new THREE.MeshBasicMaterial({color:0x4a6f96}));m.position.set(1.5,-0.6,-6);sc.add(m);
        var cap=new THREE.Shape();cap.moveTo(-1.6,2.1);cap.lineTo(-0.7,3.2);cap.lineTo(0.7,3.2);cap.lineTo(1.7,2.0);cap.lineTo(1.1,2.3);cap.lineTo(0.6,1.8);cap.lineTo(0.1,2.35);cap.lineTo(-0.5,1.85);cap.lineTo(-1,2.3);
        m=new THREE.Mesh(new THREE.ShapeGeometry(cap),new THREE.MeshBasicMaterial({color:0xf7f1e1}));m.position.set(1.5,-0.6,-5.99);sc.add(m);
        m=new THREE.Mesh(new THREE.CircleGeometry(0.9,32),new THREE.MeshBasicMaterial({color:0xc8402a}));m.position.set(-3.6,2.4,-7);sc.add(m);
        [0x6f8fae,0x2f5d86,0x1f3a5f].forEach(function(c,k){
            var g=new THREE.PlaneGeometry(26,1,60,1),w=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:c}));
            w.position.set(0,-1.6-k*0.7,-2+k*1.6);w.userData.k=k;sc.add(w);waves.push(w);
        });
        pp=new Float32Array(N*3);for(i=0;i<N;i++){pp[i*3]=(Math.random()-0.5)*14;pp[i*3+1]=(Math.random()-0.5)*8;pp[i*3+2]=Math.random()*3;}
        var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3));
        petals=new THREE.Points(pg,new THREE.PointsMaterial({color:0xf0b3bd,size:0.12,transparent:true,opacity:0.9}));sc.add(petals);
        sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001,j;
            waves.forEach(function(w){var p=w.geometry.attributes.position,k=w.userData.k;
                for(j=0;j<p.count;j++){var x=p.getX(j);if(j<=60){var th=x*0.7-t*(1.1+k*0.3)+k*2;p.setY(j,0.5+Math.sin(th)*0.45+Math.pow(Math.max(0,Math.sin(th)),6)*0.5);}else p.setY(j,-6);}
                p.needsUpdate=true;});
            for(j=0;j<N;j++){pp[j*3]+=0.012+Math.sin(t+j)*0.004;pp[j*3+1]-=0.006;if(pp[j*3]>7){pp[j*3]=-7;}if(pp[j*3+1]<-4)pp[j*3+1]=4;}
            pg.attributes.position.needsUpdate=true;ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Ukiyoe WebGL: a woodblock print in depth. A bokashi sky graded from
    // Prussian blue to washi cream, a vermilion sun, Mount Fuji as a flat cut
    // with a carved snowcap, gold kasumi mist bands, and five layered wave
    // flats whose crests roll and throw white foam claws, under drifting
    // sakura and foam flecks. Wild mode raises a towering Great Wave on the
    // left that curls and crashes over the page while the sea heaves.
    (function() {
        var _wild = false, wildK = 0;
        var scene, camera, renderer, clock;
        var waveLayers = [], claws, clawDummy, flecks, fleckPos, fleckVel, great, greatClaws;
        var N_FLECK = 360, N_CLAW = 70, SEG = 90;
        var INK = 0x2b2420, CREAM = 0xf3e9d2, FOAM = 0xf7f1e1, PRUSSIAN = 0x1f3a5f;

        function flat(geo, color, z, opts) {
            var mat = new THREE.MeshBasicMaterial(Object.assign({ color: color }, opts || {}));
            var m = new THREE.Mesh(geo, mat);
            m.position.z = z;
            scene.add(m);
            return m;
        }

        // The bokashi: a vertical blend from Prussian blue to paper.
        function buildSky() {
            var g = new THREE.PlaneGeometry(900, 500, 1, 12), col = [], p = g.attributes.position;
            var top = new THREE.Color(PRUSSIAN), low = new THREE.Color(CREAM), c = new THREE.Color();
            for (var i = 0; i < p.count; i++) {
                var k = THREE.MathUtils.clamp((p.getY(i) + 20) / 150, 0, 1);
                c.copy(low).lerp(top, Math.pow(k, 1.4));
                col.push(c.r, c.g, c.b);
            }
            g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            flat(g, 0xffffff, -260, { vertexColors: true, fog: false }).position.y = 80;
            flat(new THREE.CircleGeometry(16, 48), 0xc8402a, -240, { fog: false }).position.set(-70, 62, -240);
        }

        function outline(points, z, color) {
            var g = new THREE.BufferGeometry().setFromPoints(points);
            var l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || INK }));
            l.position.z = z;
            scene.add(l);
            return l;
        }

        function buildFuji() {
            var s = new THREE.Shape(), V = THREE.Vector2;
            s.moveTo(-130, -10); s.lineTo(-14, 62); s.lineTo(14, 62); s.lineTo(130, -10);
            var m = flat(new THREE.ShapeGeometry(s), 0x4a6f96, -200);
            m.position.x = 40;
            var cap = new THREE.Shape([new V(-34, 41), new V(-14, 62), new V(14, 62), new V(36, 40), new V(24, 46),
                new V(14, 34), new V(4, 47), new V(-8, 35), new V(-20, 46)]);
            flat(new THREE.ShapeGeometry(cap), FOAM, -199.5).position.x = 40;
            outline([new THREE.Vector3(-90, -10, 0), new THREE.Vector3(26, 62, 0), new THREE.Vector3(54, 62, 0), new THREE.Vector3(170, -10, 0)], -199);
        }

        // Kasumi: the stadium-shaped gold mist bands that cross every print.
        function buildMist() {
            [[-80, 30, 90, -150], [60, 18, 120, -140], [130, 44, 70, -170], [-140, 8, 80, -130]].forEach(function(b, i) {
                var s = new THREE.Shape(), w = b[2], h = 4.5;
                s.absarc(-w / 2, 0, h, Math.PI / 2, Math.PI * 1.5, false);
                s.absarc(w / 2, 0, h, -Math.PI / 2, Math.PI / 2, false);
                var m = flat(new THREE.ShapeGeometry(s, 12), 0xd9a441, b[3], { transparent: true, opacity: 0.55 });
                m.position.x = b[0]; m.position.y = b[1]; m.userData.drift = 0.6 + i * 0.25;
                waveLayers.push({ mist: m });
            });
        }

        // Five wave flats, back to front, from mist blue to deep Prussian.
        function buildWaves() {
            [0x9fb7c9, 0x6f8fae, 0x3d6a8f, 0x2f5d86, 0x1f3a5f].forEach(function(c, k) {
                var g = new THREE.PlaneGeometry(320, 1, SEG, 1);
                var m = flat(g, c, -90 + k * 22);
                var crest = outline(new Array(SEG + 1).fill(0).map(function() { return new THREE.Vector3(); }), m.position.z + 0.05);
                var foam = outline(new Array(SEG + 1).fill(0).map(function() { return new THREE.Vector3(); }), m.position.z + 0.06, FOAM);
                waveLayers.push({ mesh: m, k: k, crest: crest, foam: foam, base: -26 + k * 3.2, amp: 2.6 + k * 0.9, len: 0.05 - k * 0.006 });
            });
        }

        function buildClaws() {
            var g = new THREE.TorusGeometry(1.4, 0.32, 3, 7, Math.PI * 1.25);
            claws = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: FOAM }), N_CLAW);
            claws.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            clawDummy = new THREE.Object3D();
            scene.add(claws);
        }

        // Sakura petals and foam flecks drifting on the sea wind.
        function buildFlecks() {
            fleckPos = new Float32Array(N_FLECK * 3); fleckVel = new Float32Array(N_FLECK * 2);
            var col = new Float32Array(N_FLECK * 3), pink = new THREE.Color(0xf0b3bd), white = new THREE.Color(FOAM);
            for (var i = 0; i < N_FLECK; i++) {
                fleckPos[i * 3] = (Math.random() - 0.5) * 240; fleckPos[i * 3 + 1] = Math.random() * 110 - 30;
                fleckPos[i * 3 + 2] = -80 + Math.random() * 110;
                fleckVel[i * 2] = 3 + Math.random() * 5; fleckVel[i * 2 + 1] = -(1 + Math.random() * 3);
                var c = i % 3 ? pink : white;
                col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(fleckPos, 3));
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            flecks = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
            scene.add(flecks);
        }

        // The Great Wave for wild mode: a cut-out curl with a claw-fringed lip.
        function buildGreatWave() {
            var s = new THREE.Shape();
            s.moveTo(-60, -40);
            s.bezierCurveTo(-56, 0, -36, 40, 0, 46);
            s.bezierCurveTo(24, 50, 40, 34, 32, 20);
            s.bezierCurveTo(26, 10, 14, 16, 17, 25);
            s.bezierCurveTo(8, 19, 4, 4, 12, -6);
            s.bezierCurveTo(18, -16, 30, -28, 42, -40);
            s.lineTo(-60, -40);
            great = new THREE.Group();
            great.add(new THREE.Mesh(new THREE.ShapeGeometry(s, 24), new THREE.MeshBasicMaterial({ color: PRUSSIAN, transparent: true, opacity: 0.96 })));
            var inner = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), new THREE.MeshBasicMaterial({ color: 0x3d6a8f }));
            inner.scale.set(0.72, 0.72, 1); inner.position.set(-6, -10, 0.1);
            great.add(inner);
            var lip = s.getSpacedPoints(80).slice(18, 52).map(function(p) { return new THREE.Vector3(p.x, p.y, 0.3); });
            great.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lip), new THREE.LineBasicMaterial({ color: FOAM })));
            greatClaws = lip.filter(function(p, i) { return i % 3 === 0; });
            great.position.set(-55, -120, -30);
            great.visible = false;
            scene.add(great);
        }

        function initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(CREAM);
            scene.fog = new THREE.Fog(CREAM, 230, 560);
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
            camera.position.set(0, 6, 60);
            camera.lookAt(0, 8, 0);
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            clock = new THREE.Clock();
            buildSky(); buildFuji(); buildMist(); buildWaves(); buildClaws(); buildFlecks(); buildGreatWave();
            window.addEventListener('resize', onResize);
            animate();
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // A wave profile with sharpened crests, as a woodblock carver cuts them.
        function profile(L, x, t) {
            var th = x * L.len - t * (0.9 + L.k * 0.22) * (1 + wildK) + L.k * 1.7;
            var s = Math.sin(th);
            return L.base + L.amp * (1 + wildK * 1.6) * (0.55 * s + 0.45 * Math.pow(Math.max(0, s), 5) + 0.18 * Math.sin(th * 2.3 + 1));
        }

        function animateWaves(t) {
            var ci = 0;
            waveLayers.forEach(function(L) {
                if (L.mist) { L.mist.position.x += 0.01 * L.mist.userData.drift * (1 + wildK * 6); if (L.mist.position.x > 200) L.mist.position.x = -200; return; }
                var p = L.mesh.geometry.attributes.position, cp = L.crest.geometry.attributes.position, fp = L.foam.geometry.attributes.position;
                for (var i = 0; i <= SEG; i++) {
                    var x = p.getX(i), y = profile(L, x, t);
                    p.setY(i, y); p.setY(i + SEG + 1, -90);
                    cp.setXYZ(i, x, y, 0); fp.setXYZ(i, x, y - 1.3, 0);
                    // A claw curls off every crest that peaks high enough.
                    if (i > 0 && i < SEG && ci < N_CLAW && y - L.base > L.amp * (1 + wildK * 1.6) * 0.82 && i % 2 === 0) {
                        clawDummy.position.set(x, y + 0.6, L.mesh.position.z + 0.2);
                        clawDummy.rotation.set(0, 0, -0.4 + Math.sin(t * 3 + i) * 0.2);
                        clawDummy.scale.setScalar(0.7 + L.k * 0.18);
                        clawDummy.updateMatrix(); claws.setMatrixAt(ci++, clawDummy.matrix);
                    }
                }
                p.needsUpdate = true; cp.needsUpdate = true; fp.needsUpdate = true;
            });
            claws.count = ci;
            claws.instanceMatrix.needsUpdate = true;
        }

        function animateFlecks(dt, t) {
            var gust = 1 + wildK * 4;
            for (var i = 0; i < N_FLECK; i++) {
                var j = i * 3;
                fleckPos[j] += fleckVel[i * 2] * dt * gust;
                fleckPos[j + 1] += (fleckVel[i * 2 + 1] + Math.sin(t * 2 + i) * 1.5 + wildK * 6) * dt;
                if (fleckPos[j] > 130) fleckPos[j] = -130;
                if (fleckPos[j + 1] < -30) fleckPos[j + 1] = 80;
                if (fleckPos[j + 1] > 90) fleckPos[j + 1] = -20;
            }
            flecks.geometry.attributes.position.needsUpdate = true;
        }

        // The Great Wave rises, curls forward over the page, crashes and
        // rises again for as long as wild mode lasts.
        function animateGreat(t) {
            great.visible = wildK > 0.01;
            if (!great.visible) return;
            var c = (t % 7) / 7, rise = Math.min(1, c / 0.45), crash = Math.max(0, (c - 0.6) / 0.4);
            great.position.set(-55 + crash * 60, -120 + wildK * (rise * 124 - crash * 60), -30);
            great.rotation.z = -crash * 0.7;
            great.scale.setScalar(1.1 + rise * 0.4);
            camera.position.x = Math.sin(t * 9) * wildK * 0.8;
            camera.position.y = 6 + Math.cos(t * 7) * wildK * 0.6;
        }

        function animate() {
            requestAnimationFrame(animate);
            var dt = Math.min(clock.getDelta(), 0.05), t = clock.getElapsedTime();
            wildK += ((_wild ? 1 : 0) - wildK) * Math.min(1, dt * 1.5);
            animateWaves(t);
            animateFlecks(dt, t);
            animateGreat(t);
            camera.position.y += Math.sin(t * 0.3) * 0.01;
            renderer.render(scene, camera);
        }

        initThree();

        // --- Sound: plucked koto, taiko and a breathy shakuhachi -------------

        var IN = [220, 233.08, 293.66, 329.63, 349.23, 440, 466.16, 587.33, 659.25, 698.46, 880];
        function ac() {
            try {
                if (!window._snoUkiyoeCtx) window._snoUkiyoeCtx = new (window.AudioContext || window.webkitAudioContext)();
                var c = window._snoUkiyoeCtx;
                if (c.state === 'suspended') c.resume();
                return c;
            } catch (_) { return null; }
        }

        // A koto-like pluck: a bright triangle with a fast decay and a touch
        // of pitch bend at the attack.
        function pluck(ctx, f, at, vol) {
            var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
            o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.015, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.05);
            lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, at); lp.frequency.exponentialRampToValueAtTime(f * 1.5, at + 0.6);
            g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol || 0.1, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, at + 0.9);
            o.connect(lp); lp.connect(g); g.connect(ctx.destination);
            o.start(at); o.stop(at + 0.95);
        }

        function taiko(ctx, at, vol) {
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(120, at); o.frequency.exponentialRampToValueAtTime(48, at + 0.3);
            g.gain.setValueAtTime(vol || 0.3, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
            o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.5);
        }

        function breath(ctx, f, at, dur, vol) {
            var o = ctx.createOscillator(), g = ctx.createGain(), n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
            var buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
            for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            n.buffer = buf; nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 3;
            o.type = 'sine'; o.frequency.setValueAtTime(f * 0.97, at); o.frequency.linearRampToValueAtTime(f, at + 0.18);
            g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.12); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
            ng.gain.setValueAtTime(vol * 0.5, at); ng.gain.exponentialRampToValueAtTime(0.0008, at + dur * 0.8);
            o.connect(g); g.connect(ctx.destination); n.connect(nf); nf.connect(ng); ng.connect(ctx.destination);
            o.start(at); o.stop(at + dur + 0.05); n.start(at); n.stop(at + dur);
        }

        // Splash: a koto glissando up the in scale, closed by a taiko stroke.
        window.snonuxSplashSound = function(ctx) {
            var now = ctx.currentTime;
            [0, 1, 2, 3, 4, 5, 6, 7].forEach(function(n, i) { pluck(ctx, IN[n], now + i * 0.07, 0.08); });
            taiko(ctx, now + 0.62, 0.32);
            return true;
        };

        // --- Page effects -------------------------------------------------

        function el(css, cls) {
            var d = document.createElement('div');
            d.style.cssText = 'position:fixed;pointer-events:none;' + css;
            if (cls) d.className = cls;
            document.body.appendChild(d);
            return d;
        }

        // The hanko thud: a red seal slams down on the opened print.
        window.snonuxOpenEffect = function(post) {
            var modal = document.getElementById('post-modal');
            if (modal) { modal.classList.add('sno-modal-fly'); setTimeout(function() { modal.classList.remove('sno-modal-fly'); }, 400); }
            var inner = modal && modal.querySelector('.modal-inner'), r = inner ? inner.getBoundingClientRect() : null;
            var top = r && r.height ? r.top + 18 : 80, right = r && r.width ? window.innerWidth - r.right + 18 : 40;
            var seal = el('top:' + top + 'px;right:' + right + 'px;z-index:1000;', 'uk-seal');
            setTimeout(function() { seal.classList.add('uk-seal-out'); }, 900);
            setTimeout(function() { seal.remove(); }, 1300);
            var ov = document.querySelector('.overlay');
            if (ov) { ov.classList.add('uk-thud'); setTimeout(function() { ov.classList.remove('uk-thud'); }, 260); }
            var c = ac();
            if (c) { taiko(c, c.currentTime + 0.12, 0.26); pluck(c, IN[5], c.currentTime, 0.08); }
        };

        // Close: the print folds away like a sheet of washi.
        window.snonuxCloseEffect = function() {
            var d = el('inset:12vh 18vw;z-index:999;background:#f3e9d2;border:2px solid #2b2420;transform-origin:50% 0;', 'uk-fold');
            setTimeout(function() { d.remove(); }, 460);
            var c = ac();
            if (c) { pluck(c, IN[4], c.currentTime, 0.07); pluck(c, IN[2], c.currentTime + 0.08, 0.06); }
        };

        // Scroll: a sumi brush wipe drags across the page.
        window.snonuxScrollEffect = function(dir) {
            var down = dir === 'down', h = _wild ? 46 : 22;
            var d = el('left:-10vw;width:120vw;height:' + h + 'px;z-index:9000;' + (down ? 'top:18vh;' : 'bottom:18vh;'), 'uk-brush');
            setTimeout(function() { d.style.transform = 'translateX(0) scaleX(1)'; d.style.opacity = '0'; }, 20);
            setTimeout(function() { d.remove(); }, 520);
            var c = ac();
            if (c) breath(c, down ? IN[3] : IN[5], c.currentTime, 0.32, 0.035);
        };

        window.snonuxWildToggle = function() {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
            var c = ac();
            if (c && _wild) { taiko(c, c.currentTime, 0.4); taiko(c, c.currentTime + 0.22, 0.32); taiko(c, c.currentTime + 0.4, 0.42); }
        };

        // Nav (j/k): the block shifts out of register for a beat, a shamisen pluck.
        window.snonuxNavEffect = function() {
            var ov = document.querySelector('.overlay');
            if (ov) { ov.classList.add('uk-register'); setTimeout(function() { ov.classList.remove('uk-register'); }, 220); }
            var c = ac();
            if (c) pluck(c, IN[Math.floor(Math.random() * 5) + 3], c.currentTime, 0.06);
        };

        // Page turn: the page folds over like a printed sheet while a wide
        // brush wipe crosses it.
        window.snonuxPageEffect = function() {
            var ov = document.querySelector('.overlay');
            if (ov) { ov.classList.add('uk-pagefold'); setTimeout(function() { ov.classList.remove('uk-pagefold'); }, 420); }
            var d = el('inset:0;z-index:998;', 'uk-wipe');
            setTimeout(function() { d.remove(); }, 480);
            var c = ac();
            if (c) { [7, 5, 4, 2].forEach(function(n, i) { pluck(c, IN[n], c.currentTime + i * 0.05, 0.06); }); }
        };
    })();
