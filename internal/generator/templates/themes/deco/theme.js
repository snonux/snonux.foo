    // Deco splash: a gold fan of rays unfolds and turns slowly while
    // champagne bubbles rise through it.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,t0=performance.now(),fanMesh,bub,bpos,N=160,i;
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(50,1,0.1,60);ca.position.set(0,0,12);
        var rays=[],R=14,n=36;
        for(i=0;i<n;i+=2){var a=Math.PI*2*i/n,b=Math.PI*2*(i+1)/n;rays.push(0,0,0,Math.cos(a)*R,Math.sin(a)*R,0,Math.cos(b)*R,Math.sin(b)*R,0);}
        var fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rays),3));
        fanMesh=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:0xd4af37,transparent:true,opacity:0.16,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
        fanMesh.position.y=-5;sc.add(fanMesh);
        var ring=new THREE.Mesh(new THREE.RingGeometry(2.6,2.75,64),new THREE.MeshBasicMaterial({color:0xf1d78a,transparent:true,opacity:0.5}));ring.position.y=-5;sc.add(ring);
        var arr=new Float32Array(N*3);for(i=0;i<N;i++){arr[i*3]=(Math.random()-0.5)*16;arr[i*3+1]=Math.random()*14-7;arr[i*3+2]=(Math.random()-0.5)*4;}
        var bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.BufferAttribute(arr,3));
        bub=new THREE.Points(bg,new THREE.PointsMaterial({color:0xf7e3a1,size:0.09,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));
        sc.add(bub);bpos=bg.attributes.position;sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001,j,p;
            var open=Math.min(1,t/1.4);fanMesh.scale.set(open,open*(2-open),1);fanMesh.rotation.z=t*0.08;
            ring.scale.setScalar(1+Math.sin(t*1.6)*0.04);
            for(j=0;j<bpos.count;j++){p=j*3;bpos.array[p+1]+=0.018+(j%7)*0.003;bpos.array[p]+=Math.sin(t*2+j)*0.003;if(bpos.array[p+1]>7){bpos.array[p+1]=-7;bpos.array[p]=(Math.random()-0.5)*16;}}
            bpos.needsUpdate=true;ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Deco backdrop: a gilded skyline of stepped towers with sunburst
    // crowns, a giant fan of gold rays turning behind it, searchlights
    // sweeping the sky and champagne bubbles rising. Wild mode is the
    // roaring-twenties gala: the rays spin, the searchlights strobe and
    // confetti and pearls rain down.
    (function() {
        var _wild = false, _spin = 0, _last = 0;
        var N_BUB = 520, N_CONF = 900;
        var scene, camera, renderer, clock, rays, halo, lights = [], windows, bubbles, confetti, cVel;

        function gold(op) { return new THREE.LineBasicMaterial({ color:0xd4af37, transparent:true, opacity:op }); }

        // A fan of n alternate rays (triangles) around the origin.
        function fanGeometry(r, n) {
            var v = [];
            for (var i = 0; i < n; i += 2) {
                var a = Math.PI * 2 * i / n, b = Math.PI * 2 * (i + 1) / n;
                v.push(0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(b) * r, Math.sin(b) * r, 0);
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
            return g;
        }

        // One tower: stacked set-backs, gold edges, and on the tall ones a
        // Chrysler crown of nested arches and a spire.
        function tower(x, z, w, h, crown, winPts) {
            var y = 0, k = 1, steps = crown ? 4 : 2 + Math.floor(Math.random() * 2);
            for (var s = 0; s < steps; s++) {
                var hh = h * (s === 0 ? 0.62 : 0.38 / (steps - 1)), ww = w * k;
                var geo = new THREE.BoxGeometry(ww, hh, ww * 0.8);
                var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:0x0d0b08 }));
                m.position.set(x, y + hh / 2, z); scene.add(m);
                var e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), gold(crown ? 0.75 : 0.35));
                e.position.copy(m.position); scene.add(e);
                for (var r = 1; r < hh / 2.2 && s === 0; r++) for (var c = -1; c <= 1; c++) {
                    if (Math.random() < 0.55) winPts.push(x + c * ww * 0.28, y + r * 2.2, z + ww * 0.41);
                }
                y += hh; k *= 0.72;
            }
            if (!crown) return;
            for (var a = 0; a < 4; a++) {
                var arc = new THREE.Mesh(new THREE.TorusGeometry(w * k * (1.3 - a * 0.25), 0.12, 4, 24, Math.PI),
                    new THREE.MeshBasicMaterial({ color:0xd4af37, transparent:true, opacity:0.85 }));
                arc.position.set(x, y + a * 1.1, z + w * 0.3); scene.add(arc);
            }
            var spire = new THREE.Mesh(new THREE.ConeGeometry(0.35, h * 0.3, 4), new THREE.MeshBasicMaterial({ color:0xf1d78a }));
            spire.position.set(x, y + 4 + h * 0.15, z + w * 0.3); scene.add(spire);
        }

        function buildSkyline() {
            var pts = [];
            tower(0, -40, 9, 46, true, pts);
            tower(-26, -48, 8, 38, true, pts);
            tower(27, -46, 8, 34, true, pts);
            for (var i = 0; i < 14; i++) {
                var side = i % 2 ? 1 : -1, x = side * (10 + (i >> 1) * 9 + Math.random() * 4);
                tower(x, -30 - Math.random() * 30, 5 + Math.random() * 4, 14 + Math.random() * 20, false, pts);
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
            windows = new THREE.Points(g, new THREE.PointsMaterial({ color:0xf1d78a, size:0.55, transparent:true, opacity:0.7 }));
            scene.add(windows);
        }

        function buildSky() {
            rays = new THREE.Mesh(fanGeometry(140, 48), new THREE.MeshBasicMaterial({ color:0xd4af37, transparent:true, opacity:0.09,
                side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false }));
            rays.position.set(0, 18, -90); scene.add(rays);
            halo = new THREE.Mesh(new THREE.RingGeometry(16, 17, 96), new THREE.MeshBasicMaterial({ color:0xf1d78a, transparent:true, opacity:0.35, side:THREE.DoubleSide }));
            halo.position.set(0, 18, -89); scene.add(halo);
            var ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 140), new THREE.MeshBasicMaterial({ color:0x050403 }));
            ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -30); scene.add(ground);
            var grid = new THREE.GridHelper(200, 40, 0x1f7a5a, 0x1f7a5a);
            grid.material.transparent = true; grid.material.opacity = 0.12; grid.position.set(0, 0.05, -20); scene.add(grid);
            var cols = [0xf1d78a, 0x3fb488, 0xf4ecd8, 0xd4af37];
            for (var i = 0; i < 4; i++) {
                var cone = new THREE.Mesh(new THREE.ConeGeometry(5, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color:cols[i], transparent:true,
                    opacity:0.06, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false }));
                cone.geometry.translate(0, -45, 0);
                var pivot = new THREE.Group(); pivot.position.set(-45 + i * 30, 0, -50); pivot.add(cone);
                cone.rotation.x = Math.PI; scene.add(pivot); lights.push(pivot);
            }
        }

        function points(n, spread) {
            var a = new Float32Array(n * 3);
            for (var i = 0; i < n; i++) { a[i * 3] = (Math.random() - 0.5) * spread; a[i * 3 + 1] = Math.random() * 60; a[i * 3 + 2] = -60 + Math.random() * 70; }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(a, 3));
            return g;
        }

        function buildParticles() {
            bubbles = new THREE.Points(points(N_BUB, 120), new THREE.PointsMaterial({ color:0xf7e3a1, size:0.35, transparent:true, opacity:0.55,
                blending:THREE.AdditiveBlending, depthWrite:false }));
            scene.add(bubbles);
            var g = points(N_CONF, 120), col = new Float32Array(N_CONF * 3), pal = [[0.83,0.69,0.22],[0.12,0.48,0.35],[0.96,0.93,0.85],[0.95,0.84,0.54]];
            cVel = new Float32Array(N_CONF);
            for (var i = 0; i < N_CONF; i++) { var p = pal[i % 4]; col[i * 3] = p[0]; col[i * 3 + 1] = p[1]; col[i * 3 + 2] = p[2]; cVel[i] = 0.15 + Math.random() * 0.25; }
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            confetti = new THREE.Points(g, new THREE.PointsMaterial({ size:0.6, vertexColors:true, transparent:true, opacity:0, depthWrite:false }));
            scene.add(confetti);
        }

        function initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0b0a08);
            scene.fog = new THREE.Fog(0x0b0a08, 40, 170);
            camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 300);
            camera.position.set(0, 12, 46);
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            clock = new THREE.Clock();
            buildSky(); buildSkyline(); buildParticles();
            window.addEventListener('resize', onResize);
            animate();
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function stepBubbles(t) {
            var p = bubbles.geometry.attributes.position, a = p.array, rise = _wild ? 0.22 : 0.05;
            for (var i = 0; i < N_BUB; i++) {
                var k = i * 3;
                a[k + 1] += rise + (i % 5) * 0.008; a[k] += Math.sin(t * 1.3 + i) * 0.01;
                if (a[k + 1] > 60) a[k + 1] = 0;
            }
            p.needsUpdate = true;
        }

        // Confetti and pearls only fall while the gala is on; they fade out
        // when it ends rather than vanishing.
        function stepConfetti(t) {
            var m = confetti.material;
            m.opacity += ((_wild ? 0.95 : 0) - m.opacity) * 0.05;
            confetti.visible = m.opacity > 0.01;
            if (!confetti.visible) return;
            var p = confetti.geometry.attributes.position, a = p.array;
            for (var i = 0; i < N_CONF; i++) {
                var k = i * 3;
                a[k + 1] -= cVel[i]; a[k] += Math.sin(t * 3 + i) * 0.06;
                if (a[k + 1] < 0) a[k + 1] = 60;
            }
            p.needsUpdate = true;
        }

        function stepLights(t) {
            for (var i = 0; i < lights.length; i++) {
                var l = lights[i], sp = _wild ? 2.6 : 0.35;
                l.rotation.z = Math.sin(t * sp + i * 1.7) * 0.55;
                l.rotation.x = Math.cos(t * sp * 0.7 + i) * 0.2;
                var strobe = _wild ? (Math.sin(t * 22 + i * 2) > 0.2 ? 0.22 : 0.02) : 0.05 + Math.sin(t * 0.8 + i) * 0.015;
                l.children[0].material.opacity = strobe;
            }
        }

        function animate() {
            requestAnimationFrame(animate);
            var t = clock.getElapsedTime(), dt = Math.min(0.1, t - _last);
            _last = t;
            _spin += dt * (_wild ? 1.6 : 0.05);
            rays.rotation.z = _spin;
            rays.material.opacity = _wild ? 0.16 + Math.sin(t * 8) * 0.05 : 0.09;
            halo.scale.setScalar(1 + Math.sin(t * (_wild ? 6 : 1.2)) * (_wild ? 0.12 : 0.03));
            windows.material.opacity = 0.55 + Math.sin(t * (_wild ? 9 : 0.9)) * 0.15;
            stepBubbles(t); stepConfetti(t); stepLights(t);
            camera.position.x = Math.sin(t * (_wild ? 0.9 : 0.12)) * (_wild ? 6 : 3);
            camera.position.y = 12 + Math.sin(t * 0.2) * (_wild ? 2 : 0.8);
            camera.lookAt(0, 16, -40);
            renderer.render(scene, camera);
        }

        initThree();

        // A short-lived fixed layer for one effect.
        function layer(css, life) {
            var d = document.createElement('div');
            d.style.cssText = 'position:fixed;pointer-events:none;z-index:997;' + css;
            document.body.appendChild(d);
            setTimeout(function() { d.remove(); }, life);
            return d;
        }

        // Open: a gold fan unfolds from the post into the modal.
        window.snonuxOpenEffect = function(post) {
            var modal = document.getElementById('post-modal');
            if (modal) { modal.classList.add('sno-modal-fly'); setTimeout(function() { modal.classList.remove('sno-modal-fly'); }, 380); }
            var r = post ? post.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
            var f = layer('left:' + (r.left + r.width / 2 - 90) + 'px;top:' + (r.top + r.height / 2 - 90) + 'px;width:180px;height:90px;transform-origin:50% 100%;' +
                'background:repeating-conic-gradient(from 270deg at 50% 100%,rgba(212,175,55,0.9) 0deg 6deg,transparent 6deg 14deg);' +
                '-webkit-mask:radial-gradient(circle at 50% 100%,#000 69%,transparent 70%);mask:radial-gradient(circle at 50% 100%,#000 69%,transparent 70%);' +
                'transform:scale(0.05,0.3);opacity:1;transition:transform 0.45s cubic-bezier(0.22,1,0.36,1),opacity 0.45s ease 0.15s;', 520);
            setTimeout(function() { f.style.transform = 'scale(3.2,3.2)'; f.style.opacity = '0'; }, 16);
        };

        // Close: a gold iris closes on the centre of the screen.
        window.snonuxCloseEffect = function() {
            var d = layer('inset:0;background:radial-gradient(circle at 50% 50%,transparent 0 46%,rgba(212,175,55,0.5) 46.5% 47.5%,rgba(11,10,8,0.82) 48%);' +
                'transform:scale(2.2);transition:transform 0.3s ease-in,opacity 0.2s ease 0.22s;', 520);
            setTimeout(function() { d.style.transform = 'scale(1)'; d.style.opacity = '0'; }, 16);
        };

        // Navigate: champagne fizz rising from the bottom of the screen.
        window.snonuxNavEffect = function() {
            for (var i = 0; i < (_wild ? 22 : 12); i++) {
                var sz = 4 + Math.random() * 8;
                var b = layer('left:' + (Math.random() * 100) + 'vw;bottom:-12px;width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;' +
                    'border:1px solid rgba(247,227,161,0.9);background:radial-gradient(circle at 35% 35%,rgba(255,255,255,0.8),rgba(241,215,138,0.15) 60%);' +
                    'transition:transform ' + (0.5 + Math.random() * 0.4) + 's ease-out,opacity 0.6s ease-in;', 1000);
                (function(b) { setTimeout(function() { b.style.transform = 'translate(' + (Math.random() * 40 - 20) + 'px,-' + (30 + Math.random() * 50) + 'vh)'; b.style.opacity = '0'; }, 16); })(b);
            }
        };

        // New page: gold curtains with a chevron hem sweep in and part.
        window.snonuxPageEffect = function() {
            ['left', 'right'].forEach(function(side) {
                var c = layer(side + ':0;top:0;bottom:0;width:51vw;z-index:998;background:' +
                    'linear-gradient(' + (side === 'left' ? '90deg' : '270deg') + ',rgba(11,10,8,0.95) 0 92%,#d4af37 92% 93%,rgba(11,10,8,0.95) 93% 96%,#d4af37 96% 97%,transparent 97%),' +
                    'repeating-linear-gradient(90deg,rgba(212,175,55,0.12) 0 2px,transparent 2px 22px);' +
                    'transform:translateX(' + (side === 'left' ? '-100%' : '100%') + ');transition:transform 0.2s ease-in;', 700);
                setTimeout(function() { c.style.transform = 'translateX(0)'; }, 16);
                setTimeout(function() { c.style.transition = 'transform 0.32s ease-out'; c.style.transform = 'translateX(' + (side === 'left' ? '-100%' : '100%') + ')'; }, 260);
            });
        };

        // Scroll: a thin gold double rule sweeps across in the scroll direction.
        window.snonuxScrollEffect = function(dir) {
            var down = dir === 'down';
            var d = layer((down ? 'top:0;' : 'bottom:0;') + 'left:0;right:0;height:' + (_wild ? '16px' : '6px') + ';z-index:9000;' +
                'background:linear-gradient(180deg,#d4af37 0 2px,transparent 2px calc(100% - 2px),#d4af37 calc(100% - 2px));' +
                'transition:transform 0.3s ease,opacity 0.3s ease;', 360);
            setTimeout(function() { d.style.transform = down ? 'translateY(100vh)' : 'translateY(-100vh)'; d.style.opacity = '0'; }, 16);
        };

        window.snonuxWildToggle = function() {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
        };
    })();
