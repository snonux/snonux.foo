    // Greenhouse splash: a wrought-iron arch, a fern fiddlehead that unfurls
    // and curls up again, a blossom opening beside it and drifting pollen.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,t0=performance.now(),N=90,i;
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(50,1,0.1,60);ca.position.set(0,0.4,8);
        // Two iron arches, the far one fainter.
        var ironMat=new THREE.MeshBasicMaterial({color:0x3b5247,transparent:true,opacity:0.85});
        [0,-2.5].forEach(function(z,k){
            var g=new THREE.Group(),r=3.4-k*0.4;
            g.add(new THREE.Mesh(new THREE.TorusGeometry(r,0.05,6,56,Math.PI),ironMat));
            [-r,r].forEach(function(x){var c=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2.6,6),ironMat);c.position.set(x,-1.3,0);g.add(c);});
            g.position.set(0,-0.4,z);if(k)g.scale.setScalar(1.15);sc.add(g);
        });
        // The fiddlehead: a ribbon whose curl eases in and out.
        var fpos=new Float32Array(N*2*3),fidx=[];
        for(i=0;i<N-1;i++){var a=i*2;fidx.push(a,a+1,a+2,a+1,a+3,a+2);}
        var fgeo=new THREE.BufferGeometry();fgeo.setAttribute('position',new THREE.BufferAttribute(fpos,3));fgeo.setIndex(fidx);
        var frond=new THREE.Mesh(fgeo,new THREE.MeshBasicMaterial({color:0x7cbf6a,side:THREE.DoubleSide}));
        frond.position.set(-4.3,-3.3,0.5);frond.scale.setScalar(1.35);sc.add(frond);
        var frond2=new THREE.Mesh(fgeo,new THREE.MeshBasicMaterial({color:0x3f8a4f,side:THREE.DoubleSide}));
        frond2.position.set(-4.9,-3.3,0.2);frond2.scale.set(-0.95,1,1);sc.add(frond2);
        function curl(c){
            var x=0,y=0,h=Math.PI/2,ds=3.4/N,j,k,w;
            for(j=0;j<N;j++){
                var s=j/N;k=c*Math.pow(s,3)*16;h+=k*ds;x+=Math.cos(h)*ds;y+=Math.sin(h)*ds;
                w=0.07*(1-s)+0.015;
                fpos[j*6]=x-Math.sin(h)*w;fpos[j*6+1]=y+Math.cos(h)*w;fpos[j*6+3]=x+Math.sin(h)*w;fpos[j*6+4]=y-Math.cos(h)*w;
            }
            fgeo.attributes.position.needsUpdate=true;
        }
        // A five-petalled blossom of pink ellipses round a gold heart.
        var bloom=new THREE.Group(),petals=[];
        for(i=0;i<5;i++){
            var p=new THREE.Mesh(new THREE.CircleGeometry(0.42,20),new THREE.MeshBasicMaterial({color:0xf29bb5,side:THREE.DoubleSide,transparent:true,opacity:0.95}));
            p.geometry.translate(0.42,0,0);p.scale.set(1,0.55,1);
            var holder=new THREE.Group();holder.rotation.z=i*Math.PI*2/5;holder.add(p);bloom.add(holder);petals.push(p);
        }
        var heart=new THREE.Mesh(new THREE.CircleGeometry(0.16,16),new THREE.MeshBasicMaterial({color:0xf2c14e}));heart.position.z=0.02;bloom.add(heart);
        bloom.position.set(4.4,1.2,0.6);sc.add(bloom);
        // Pollen motes.
        var M=160,pp=new Float32Array(M*3);for(i=0;i<M;i++){pp[i*3]=(Math.random()-0.5)*9;pp[i*3+1]=(Math.random()-0.5)*6;pp[i*3+2]=(Math.random()-0.5)*3;}
        var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3));
        var pts=new THREE.Points(pg,new THREE.PointsMaterial({color:0xf2c14e,size:0.07,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));sc.add(pts);
        sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001,j;
            curl(0.25+0.75*(0.5+0.5*Math.cos(t*0.6)));
            var open=0.5-0.5*Math.cos(t*0.6);
            petals.forEach(function(p,k){p.rotation.y=(1-open)*0.8;p.parent.rotation.z=k*Math.PI*2/5+t*0.15;});
            bloom.scale.setScalar(0.9+open*0.7);
            for(j=0;j<M;j++){pp[j*3+1]+=0.004+Math.sin(t+j)*0.002;pp[j*3]+=Math.sin(t*0.7+j*1.3)*0.003;if(pp[j*3+1]>3)pp[j*3+1]=-3;}
            pg.attributes.position.needsUpdate=true;
            ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Greenhouse WebGL: the nave of a Victorian conservatory. Wrought-iron
    // ribs recede in perspective over a tiled floor; ferns and palms in
    // terracotta pots sway (instanced, swayed in the vertex shader); pollen
    // drifts through shafts of light and raindrops run down the glass. The
    // camera glides down the nave forever: everything repeats every two
    // bays, so the loop is seamless.
    // Wild mode: jungle overgrowth. Vines climb the ribs, giant blossoms
    // open, butterflies swarm and a warm thunderstorm breaks overhead.
    (function() {
        if (typeof THREE === 'undefined') return;
        if (typeof window._snonuxGreenhouseStop === 'function') window._snonuxGreenhouseStop();
        var BAY = 6, PERIOD = 12, BAYS = 16, HALF = 8, SPRING = 6, FOG = 0x0c1f17, WARM_FOG = 0x2b2a18;
        var _wild = false, wildAmt = 0, raf = 0, flash = 0, nextBolt = 2;
        var scene, camera, renderer, clock, hemi, sun, swayUniforms, shaftMat, floorMat, glassMat, vines = [], bloomMesh, flies, rain, motes;
        var dummy = new THREE.Object3D();

        function rnd(a, b) { return a + Math.random() * (b - a); }

        // The nave: iron arches and columns every bay, slender glazing bars
        // between them, and purlins running its length.
        function buildIron() {
            var iron = new THREE.MeshLambertMaterial({ color: 0x1d2b25 });
            var arch = new THREE.InstancedMesh(new THREE.TorusGeometry(HALF, 0.16, 5, 40, Math.PI), iron, BAYS * 2);
            var cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, SPRING, 6), iron, BAYS * 2);
            for (var k = 0; k < BAYS; k++) {
                var z = 6 - k * BAY;
                dummy.position.set(0, SPRING, z); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); arch.setMatrixAt(k * 2, dummy.matrix);
                dummy.position.set(0, SPRING, z - BAY / 2); dummy.scale.set(1, 1, 0.35); dummy.updateMatrix(); arch.setMatrixAt(k * 2 + 1, dummy.matrix);
                dummy.scale.setScalar(1);
                [-HALF, HALF].forEach(function (x, j) { dummy.position.set(x, SPRING / 2, z); dummy.updateMatrix(); cols.setMatrixAt(k * 2 + j, dummy.matrix); });
            }
            scene.add(arch); scene.add(cols);
            var purlin = new THREE.BoxGeometry(0.1, 0.1, BAYS * BAY);
            for (var a = 1; a < 6; a++) {
                var ang = a * Math.PI / 6, m = new THREE.Mesh(purlin, iron);
                m.position.set(Math.cos(ang) * HALF, SPRING + Math.sin(ang) * HALF, 6 - BAYS * BAY / 2);
                scene.add(m);
            }
        }

        // The glass: a barrel vault and side walls of faint panes, brighter
        // towards the roof where the daylight comes in.
        function buildGlass() {
            var mat = new THREE.ShaderMaterial({
                uniforms: { uFlash: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.BackSide,
                vertexShader: 'varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
                fragmentShader: 'uniform float uFlash; varying vec3 vW; varying float vD;' +
                    'void main(){ float a = atan(vW.y - 6.0, vW.x); float h = clamp(vW.y / 14.0, 0.0, 1.0);' +
                    'float gz = abs(fract(vW.z / 2.0) - 0.5); float ga = abs(fract((vW.y < 6.0 ? vW.y / 2.0 : a * 3.8)) - 0.5);' +
                    'float bar = 1.0 - smoothstep(0.46, 0.49, max(gz, ga));' +
                    'vec3 sky = mix(vec3(0.16,0.32,0.26), vec3(0.55,0.72,0.6), h) * (1.0 + uFlash * 3.0);' +
                    'float al = (0.05 + 0.12 * h) * (1.0 - bar * 0.7) + uFlash * 0.25; al *= 1.0 - smoothstep(20.0, 70.0, vD);' +
                    'gl_FragColor = vec4(mix(sky, vec3(0.08,0.12,0.1), bar), al); }'
            });
            var len = BAYS * BAY, z = 6 - len / 2;
            var vault = new THREE.Mesh(new THREE.CylinderGeometry(HALF - 0.1, HALF - 0.1, len, 24, 1, true, -Math.PI / 2, Math.PI), mat);
            vault.rotation.x = -Math.PI / 2; vault.position.set(0, SPRING, z);
            scene.add(vault);
            [-1, 1].forEach(function (side) {
                var wall = new THREE.Mesh(new THREE.PlaneGeometry(len, SPRING), mat);
                wall.rotation.y = side * Math.PI / 2; wall.position.set(side * (HALF - 0.1), SPRING / 2, z);
                scene.add(wall);
            });
            glassMat = mat;
        }

        // Encaustic tiles in faded terracotta and cream, fogged by hand.
        function buildFloor() {
            floorMat = new THREE.ShaderMaterial({
                uniforms: { uFog: { value: new THREE.Color(FOG) }, uFlash: { value: 0 } },
                vertexShader: 'varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
                fragmentShader: 'uniform vec3 uFog; uniform float uFlash; varying vec3 vW; varying float vD;' +
                    'void main(){ vec2 c = floor(vW.xz * 1.1); float ck = mod(c.x + c.y, 2.0);' +
                    'vec3 col = mix(vec3(0.36,0.18,0.11), vec3(0.5,0.45,0.34), ck);' +
                    'float path = step(abs(vW.x), 2.2); col = mix(col * 0.55, col, path);' +
                    'col *= 0.5 + uFlash * 0.8; float f = smoothstep(4.0, 60.0, vD);' +
                    'gl_FragColor = vec4(mix(col, uFog, f), 1.0); }'
            });
            var floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, BAYS * BAY + 20), floorMat);
            floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 6 - BAYS * BAY / 2);
            scene.add(floor);
        }

        // One fern frond: a spine with paired leaflets in the XY plane,
        // `t` running 0 at the base to 1 at the tip.
        function frondGeometry() {
            var pos = [], ts = [], n = 12;
            function v(x, y, t) { pos.push(x, y, 0); ts.push(t); }
            for (var i = 0; i < n; i++) {
                var t0 = i / n, t1 = (i + 1) / n, w = 0.3 * Math.sin(Math.PI * (t0 * 0.85 + 0.12));
                var x0 = 0.35 * t0 * t0, x1 = 0.35 * t1 * t1, y0 = t0, y1 = t1;
                var ym = y0 + (y1 - y0) * 0.55, xm = x0 + (x1 - x0) * 0.55;
                v(x0 - 0.02, y0, t0); v(x0 + 0.02, y0, t0); v(x1, y1, t1);
                // A leaflet each side: narrow at the spine, swept towards the tip.
                v(x0, y0, t0); v(x0 + w, y0 + w * 0.75, (t0 + t1) / 2); v(xm, ym, t0);
                v(x0, y0, t0); v(x0 - w, y0 + w * 0.75, (t0 + t1) / 2); v(xm, ym, t0);
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setAttribute('t', new THREE.Float32BufferAttribute(ts, 1));
            return g;
        }

        function frondMaterial() {
            swayUniforms = { uTime: { value: 0 }, uWild: { value: 0 }, uFog: { value: new THREE.Color(FOG) }, uFlash: { value: 0 } };
            return new THREE.ShaderMaterial({
                uniforms: swayUniforms, side: THREE.DoubleSide,
                vertexShader: 'attribute float t; uniform float uTime; uniform float uWild; varying float vT; varying float vD;' +
                    'void main(){ vec3 p = position; vec4 base = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);' +
                    'float ph = base.x * 0.7 + base.z * 0.45; float amp = (0.07 + uWild * 0.22) * t * t;' +
                    'p.x += sin(uTime * (1.2 + uWild * 2.5) + ph) * amp; p.z += cos(uTime * 0.9 + ph * 1.3) * amp * 0.8;' +
                    'vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(p,1.0); vT = t; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
                fragmentShader: 'uniform vec3 uFog; uniform float uFlash; varying float vT; varying float vD;' +
                    'void main(){ vec3 col = mix(vec3(0.12,0.33,0.17), vec3(0.49,0.75,0.42), vT); col *= 1.0 + uFlash;' +
                    'gl_FragColor = vec4(mix(col, uFog, smoothstep(5.0, 60.0, vD)), 1.0); }'
            });
        }

        // Clumps of ferns in pots and a palm per side every two bays; one
        // period of planting is laid out and repeated down the nave.
        function plantLayout() {
            var clumps = [], palms = [];
            for (var k = 0; k < 5; k++) {
                [-1, 1].forEach(function (side) { clumps.push({ x: side * rnd(3.4, 6.6), z: -k * PERIOD / 5 - rnd(0, 1.5), s: rnd(0.9, 1.5), n: 6 + (k % 3) }); });
            }
            [-1, 1].forEach(function (side) { palms.push({ x: side * rnd(5.2, 6.4), z: -rnd(1, PERIOD - 1), h: rnd(4.6, 6.4) }); });
            return { clumps: clumps, palms: palms };
        }

        function buildPlants() {
            var lay = plantLayout(), reps = BAYS * BAY / PERIOD, fronds = 0, i, r;
            lay.clumps.forEach(function (c) { fronds += c.n; });
            fronds = (fronds + lay.palms.length * 9) * reps;
            var mesh = new THREE.InstancedMesh(frondGeometry(), frondMaterial(), fronds);
            var pots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.34, 0.7, 10), new THREE.MeshLambertMaterial({ color: 0xc8643b }), lay.clumps.length * reps);
            var trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 7), new THREE.MeshLambertMaterial({ color: 0x5a4632 }), lay.palms.length * reps);
            var fi = 0, pi = 0, ti = 0;
            function frond(x, y, z, yaw, tilt, s) {
                dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, -tilt); dummy.scale.setScalar(s); dummy.updateMatrix();
                mesh.setMatrixAt(fi++, dummy.matrix);
            }
            for (r = 0; r < reps; r++) {
                var oz = 6 - r * PERIOD;
                lay.clumps.forEach(function (c) {
                    dummy.position.set(c.x, 0.35, c.z + oz); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pots.setMatrixAt(pi++, dummy.matrix);
                    for (i = 0; i < c.n; i++) frond(c.x, 0.65, c.z + oz, i * 2.4 + c.x, 0.35 + (i % 3) * 0.25, c.s * (1.1 + (i % 2) * 0.4));
                });
                lay.palms.forEach(function (p) {
                    dummy.position.set(p.x, p.h / 2, p.z + oz); dummy.rotation.set(0, 0, p.x * 0.01); dummy.scale.set(1, p.h, 1); dummy.updateMatrix(); trunks.setMatrixAt(ti++, dummy.matrix);
                    for (i = 0; i < 9; i++) frond(p.x, p.h, p.z + oz, i * 0.7, 1.0 + (i % 3) * 0.3, 2.6);
                });
            }
            scene.add(mesh); scene.add(pots); scene.add(trunks);
        }

        // Shafts of daylight through the roof, one per bay, breathing.
        function buildShafts() {
            shaftMat = new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uDim: { value: 1 } }, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
                vertexShader: 'varying vec2 vUv; varying float vPh; void main(){ vUv = uv; vec4 b = instanceMatrix * vec4(0.0,0.0,0.0,1.0); vPh = b.z * 0.5;' +
                    'gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position,1.0); }',
                fragmentShader: 'uniform float uTime; uniform float uDim; varying vec2 vUv; varying float vPh;' +
                    'void main(){ float e = sin(vUv.x * 3.14159); float a = e * e * vUv.y * (0.07 + 0.04 * sin(uTime * 0.5 + vPh)) * uDim;' +
                    'gl_FragColor = vec4(vec3(1.0,0.95,0.78) * a, a); }'
            });
            var shafts = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 13), shaftMat, BAYS);
            for (var k = 0; k < BAYS; k++) {
                dummy.position.set(-1.5 + (k % 2) * 3, 6.5, 3 - k * BAY); dummy.rotation.set(0, 0.3, 0.32); dummy.scale.setScalar(1); dummy.updateMatrix();
                shafts.setMatrixAt(k, dummy.matrix);
            }
            scene.add(shafts);
        }

        // Pollen motes around the camera, drifting and twinkling in the shader.
        function buildMotes() {
            var n = 420, seeds = new Float32Array(n * 3);
            for (var i = 0; i < n * 3; i++) seeds[i] = Math.random();
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
            motes = new THREE.Points(g, new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uWild: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
                vertexShader: 'uniform float uTime; uniform float uWild; varying float vA;' +
                    'void main(){ vec3 s = position; float sp = 1.0 + uWild * 3.0;' +
                    'vec3 p = vec3(s.x * 16.0 - 8.0 + sin(uTime * 0.3 * sp + s.z * 20.0) * 0.8, mod(s.y * 9.0 + uTime * 0.12 * sp * (0.4 + s.z), 9.0) - 3.0, -1.5 - s.z * 18.0);' +
                    'vec4 mv = modelViewMatrix * vec4(p,1.0); vA = (0.5 + 0.5 * sin(uTime * 2.0 + s.x * 40.0)) * (1.0 - s.z * 0.6);' +
                    'gl_PointSize = (2.0 + 3.0 * s.y) * 18.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
                fragmentShader: 'varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = 1.0 - smoothstep(0.2, 0.5, length(d));' +
                    'gl_FragColor = vec4(vec3(0.95,0.78,0.32) * r * vA, r * vA); }'
            }));
            camera.add(motes);
        }

        // Raindrops running down the glass in front of the camera: each
        // drop clings, then slides, leaving a short trail.
        function buildRain() {
            var n = 110, pos = new Float32Array(n * 6);
            rain = { n: n, pos: pos, drops: [], geo: new THREE.BufferGeometry() };
            for (var i = 0; i < n; i++) rain.drops.push({ x: rnd(-1, 1), y: rnd(-1, 1), v: 0, hold: rnd(0, 3), len: rnd(0.03, 0.09) });
            rain.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            var lines = new THREE.LineSegments(rain.geo, new THREE.LineBasicMaterial({ color: 0xd4ece2, transparent: true, opacity: 0.38, depthTest: false }));
            lines.renderOrder = 10; lines.frustumCulled = false;
            camera.add(lines);
        }

        function updateRain(dt) {
            var hh = Math.tan(Math.PI / 6) * 3, hw = hh * camera.aspect, active = Math.round(rain.n * (0.4 + wildAmt * 0.6));
            for (var i = 0; i < rain.n; i++) {
                var d = rain.drops[i], o = i * 6;
                if ((d.hold -= dt) <= 0) d.v = Math.min(d.v + dt * (1.2 + wildAmt * 3), 0.9 + wildAmt * 1.6);
                else d.v *= 0.9;
                if (Math.random() < dt * 0.4) d.hold = rnd(0.2, 1.5);
                d.y -= d.v * dt;
                if (d.y < -1.1) { d.y = 1.1; d.x = rnd(-1, 1); d.v = 0; d.hold = rnd(0, 2); }
                var x = d.x * hw, y = d.y * hh, on = i < active ? 1 : 0;
                rain.pos[o] = x; rain.pos[o + 1] = y; rain.pos[o + 2] = -3;
                rain.pos[o + 3] = x + 0.004; rain.pos[o + 4] = y + (d.len + d.v * 0.12) * on; rain.pos[o + 5] = -3;
            }
            rain.geo.attributes.position.needsUpdate = true;
        }

        // Wild: vines along the columns and over each rib, grown by drawRange.
        function buildVines() {
            var mat = new THREE.MeshLambertMaterial({ color: 0x2f6a35 });
            for (var k = 0; k < BAYS; k++) {
                [-1, 1].forEach(function (side) {
                    var pts = [], z = 6 - k * BAY;
                    for (var i = 0; i <= 24; i++) {
                        var s = i / 24, a = s < 0.4 ? 0 : (s - 0.4) / 0.6 * Math.PI / 2;
                        var y = s < 0.4 ? s / 0.4 * SPRING : SPRING + Math.sin(a) * HALF, x = s < 0.4 ? HALF : Math.cos(a) * HALF;
                        pts.push(new THREE.Vector3(side * (x - 0.15) + Math.sin(i * 1.7) * 0.18, y, z + Math.cos(i * 1.3) * 0.25));
                    }
                    var g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.09, 5, false);
                    g.setDrawRange(0, 0);
                    var m = new THREE.Mesh(g, mat); m.visible = false; scene.add(m); vines.push(m);
                });
            }
        }

        // Wild: giant blossoms along the beds and up the ribs.
        function buildBlossoms() {
            var shape = new THREE.Shape(), petals = 6;
            for (var i = 0; i <= petals * 8; i++) {
                var a = i / (petals * 8) * Math.PI * 2, r = 0.25 + 0.75 * Math.abs(Math.sin(a * petals / 2));
                if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            var cols = [0xf29bb5, 0xf2c14e, 0xe3895f, 0xb493e6, 0xfff1e0], n = 70;
            bloomMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
            bloomMesh.userData.spots = [];
            for (var k = 0; k < n; k++) {
                var side = k % 2 ? 1 : -1, high = k % 3 === 0, z = 6 - (k / n) * BAYS * BAY;
                var spot = high ? { x: side * HALF * 0.75, y: SPRING + HALF * 0.6, z: z } : { x: side * rnd(2.6, 7), y: rnd(0.8, 3.2), z: z };
                spot.s = rnd(0.6, 1.4); spot.rot = rnd(0, 6); bloomMesh.userData.spots.push(spot);
                bloomMesh.setColorAt(k, new THREE.Color(cols[k % cols.length]));
            }
            bloomMesh.visible = false; scene.add(bloomMesh);
        }

        // Wild: butterflies, two wings flapping in the vertex shader.
        function buildButterflies() {
            var n = 90, g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.5, 0.35, 0, 0.45, -0.3, 0, 0, 0, 0, -0.5, 0.35, 0, -0.45, -0.3, 0], 3));
            var col = new Float32Array(n * 3), pal = [[0.95, 0.6, 0.71], [0.95, 0.76, 0.31], [0.47, 0.77, 0.91], [0.98, 0.95, 0.88]];
            for (var i = 0; i < n; i++) { var c = pal[i % 4]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
            g.setAttribute('wing', new THREE.InstancedBufferAttribute(col, 3));
            flies = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 } }, side: THREE.DoubleSide,
                vertexShader: 'attribute vec3 wing; uniform float uTime; varying vec3 vC;' +
                    'void main(){ vec3 p = position; vec4 b = instanceMatrix * vec4(0.0,0.0,0.0,1.0); float f = sin(uTime * 22.0 + b.x * 3.0 + b.z);' +
                    'float s = sign(p.x); p.z = abs(p.x) * f * 0.9; p.x *= 0.45 + 0.55 * abs(cos(uTime * 22.0 + b.x * 3.0 + b.z)); vC = wing;' +
                    'gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p,1.0); }',
                fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }'
            }), n);
            flies.userData.n = n; flies.visible = false; flies.frustumCulled = false;
            scene.add(flies);
        }

        function updateWild(t, dt) {
            var target = _wild ? 1 : 0;
            wildAmt += (target - wildAmt) * Math.min(1, dt * 0.9);
            var grow = Math.max(0, Math.min(1, wildAmt * 1.25));
            vines.forEach(function (m) { m.visible = grow > 0.01; m.geometry.setDrawRange(0, Math.floor(m.geometry.index.count * grow / 3) * 3); });
            bloomMesh.visible = flies.visible = wildAmt > 0.02;
            if (bloomMesh.visible) {
                bloomMesh.userData.spots.forEach(function (s, k) {
                    var open = Math.max(0, Math.min(1, wildAmt * 1.6 - (k % 10) * 0.05));
                    dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, s.x > 0 ? -1.1 : 1.1, s.rot + t * 0.2); dummy.scale.setScalar(s.s * open * (1 + 0.06 * Math.sin(t * 2 + k)));
                    dummy.updateMatrix(); bloomMesh.setMatrixAt(k, dummy.matrix);
                });
                bloomMesh.instanceMatrix.needsUpdate = true;
                moveButterflies(t);
            }
            swayUniforms.uWild.value = wildAmt; motes.material.uniforms.uWild.value = wildAmt;
            scene.fog.color.setHex(FOG).lerp(new THREE.Color(WARM_FOG), wildAmt);
            swayUniforms.uFog.value.copy(scene.fog.color); floorMat.uniforms.uFog.value.copy(scene.fog.color);
            storm(dt);
        }

        // Butterflies loop in swarms around the camera's stretch of the nave.
        function moveButterflies(t) {
            var cz = camera.position.z, n = flies.userData.n;
            for (var i = 0; i < n; i++) {
                var a = t * (0.4 + (i % 7) * 0.06) + i * 1.9, r = 2 + (i % 5) * 0.9;
                dummy.position.set(Math.sin(a) * r, 2.5 + Math.sin(a * 1.7 + i) * 1.6 + (i % 4), cz - 6 - (i % 9) * 2.2 + Math.cos(a) * r);
                dummy.rotation.set(0.3, a + Math.PI / 2, 0); dummy.scale.setScalar(0.35 * Math.min(1, wildAmt * 2)); dummy.updateMatrix();
                flies.setMatrixAt(i, dummy.matrix);
            }
            flies.instanceMatrix.needsUpdate = true;
        }

        // Warm thunderstorm: lightning lights the whole house for a moment.
        function storm(dt) {
            if (wildAmt > 0.5 && (nextBolt -= dt) <= 0) { flash = 1; nextBolt = rnd(1.5, 4.5); }
            flash = Math.max(0, flash - dt * 3.2);
            var f = flash > 0.6 || (flash > 0.2 && flash < 0.35) ? flash : flash * 0.3;
            hemi.intensity = 0.85 + f * 2.5;
            swayUniforms.uFlash.value = f; floorMat.uniforms.uFlash.value = f; glassMat.uniforms.uFlash.value = f;
            shaftMat.uniforms.uDim.value = 1 - wildAmt * 0.7;
            scene.background.setHex(FOG).lerp(new THREE.Color(WARM_FOG), wildAmt).lerp(new THREE.Color(0xfff2c8), f * 0.5);
        }

        function initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(FOG);
            scene.fog = new THREE.Fog(FOG, 6, 62);
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
            camera.position.set(0, 3.2, 10);
            scene.add(camera);
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            clock = new THREE.Clock();
            hemi = new THREE.HemisphereLight(0xdcf2df, 0x1a2a1c, 0.85); scene.add(hemi);
            sun = new THREE.DirectionalLight(0xffe7b8, 0.6); sun.position.set(-3, 10, 4); scene.add(sun);
            buildGlass(); buildIron(); buildFloor(); buildPlants(); buildShafts(); buildMotes(); buildRain();
            buildVines(); buildBlossoms(); buildButterflies();
            window.addEventListener('resize', onResize);
            raf = requestAnimationFrame(animate);
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Another theme took the canvas over: stop drawing into it.
        function stop() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0; window.removeEventListener('resize', onResize);
            window._snonuxGreenhouseStop = null;
        }
        window._snonuxGreenhouseStop = stop;

        function animate() {
            if (window.SNONUX_CURRENT_THEME && window.SNONUX_CURRENT_THEME !== 'greenhouse') { stop(); return; }
            raf = requestAnimationFrame(animate);
            var dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
            // Glide down the nave; the planting repeats every PERIOD.
            camera.position.z = 10 - ((t * (0.55 + wildAmt * 0.35)) % PERIOD);
            camera.position.x = Math.sin(t * 0.13) * 0.8;
            camera.lookAt(Math.sin(t * 0.09) * 1.5, 4.4 + Math.sin(t * 0.07) * 0.6, camera.position.z - 20);
            swayUniforms.uTime.value = t; shaftMat.uniforms.uTime.value = t;
            motes.material.uniforms.uTime.value = t; flies.material.uniforms.uTime.value = t;
            updateRain(dt);
            updateWild(t, dt);
            renderer.render(scene, camera);
        }

        initThree();

        // ------------------------------------------------------------------
        // Page effects: leaves unfurl, petals scatter, raindrops ripple and
        // a bee flies across.
        // ------------------------------------------------------------------
        var PETALS = ['#f29bb5', '#f7c3d3', '#f2c14e', '#ffffff', '#e3895f'], LEAVES = ['#7cbf6a', '#3f8a4f', '#a9c9b1'];

        function scatter(x, y, n, colors, spread, fall) {
            for (var i = 0; i < n; i++) {
                var p = document.createElement('div'), a = Math.random() * Math.PI * 2, d = spread * (0.4 + Math.random() * 0.6);
                p.className = 'gh-petal';
                p.style.left = x + 'px'; p.style.top = y + 'px';
                p.style.background = colors[i % colors.length];
                document.body.appendChild(p);
                var anim = p.animate([
                    { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
                    { transform: 'translate(' + (Math.cos(a) * d) + 'px,' + (Math.sin(a) * d * 0.6 + fall) + 'px) rotate(' + rnd(-540, 540) + 'deg) scale(0.7)', opacity: 0 }
                ], { duration: rnd(800, 1400), easing: 'cubic-bezier(0.2,0.7,0.4,1)' });
                anim.onfinish = (function (el) { return function () { el.remove(); }; })(p);
            }
        }

        function center(el) {
            var r = el ? el.getBoundingClientRect() : null;
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }

        function flyBee() {
            var b = document.createElement('div'), h = window.innerHeight, w = window.innerWidth, y0 = rnd(0.25, 0.6) * h, frames = [];
            b.className = 'gh-bee';
            for (var i = 0; i <= 10; i++) {
                var s = i / 10;
                frames.push({ transform: 'translate(' + (-40 + s * (w + 80)) + 'px,' + (y0 + Math.sin(s * 9) * 40 - s * 60) + 'px) rotate(' + Math.cos(s * 9) * 18 + 'deg)' });
            }
            document.body.appendChild(b);
            b.style.left = '0px'; b.style.top = '0px';
            b.animate(frames, { duration: 1500, easing: 'linear' }).onfinish = function () { b.remove(); };
        }

        window.snonuxOpenEffect = function(post) {
            // The sheet unfurls from its corner like a fern frond; leaves
            // spiral out from the post that was opened.
            var inner = document.querySelector('#post-modal .modal-inner');
            if (inner) { inner.classList.remove('gh-unfurl'); void inner.offsetWidth; inner.classList.add('gh-unfurl'); setTimeout(function() { inner.classList.remove('gh-unfurl'); }, 650); }
            var c = center(post);
            scatter(c.x, c.y, 10, LEAVES, 140, -30);
        };
        window.snonuxCloseEffect = function() {
            var c = center(null);
            scatter(c.x, c.y - 80, 12, PETALS, 260, 160);
        };
        window.snonuxScrollEffect = function(dir) {
            // Raindrops landing on a pond: two or three ripples over the feed.
            var n = _wild ? 5 : 2;
            for (var i = 0; i < n; i++) {
                (function (i) {
                    setTimeout(function () {
                        var r = document.createElement('div'), size = rnd(60, 140) * (_wild ? 1.6 : 1);
                        r.className = 'gh-ripple';
                        r.style.left = rnd(10, 90) + 'vw'; r.style.top = (dir === 'down' ? rnd(55, 90) : rnd(15, 45)) + 'vh';
                        r.style.width = r.style.height = size + 'px';
                        document.body.appendChild(r);
                        setTimeout(function () { r.remove(); }, 950);
                    }, i * 110);
                })(i);
            }
        };
        window.snonuxWildToggle = function() {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
            if (_wild) { flash = 1; nextBolt = 0.8; }
        };
        window.snonuxNavEffect = function() {
            var active = document.querySelector('.post.post-active');
            var c = center(active);
            if (active) { var r = active.getBoundingClientRect(); c.x = r.left + 24; c.y = r.top + 18; }
            scatter(c.x, c.y, _wild ? 14 : 7, PETALS, 120, 60);
        };
        window.snonuxPageEffect = function() {
            flyBee();
            scatter(window.innerWidth / 2, window.innerHeight * 0.35, 16, PETALS, 360, 200);
        };
        // A bee also flies in on a page reached from another page of the feed.
        try {
            if (document.referrer && new URL(document.referrer).origin === location.origin && document.documentElement.classList.contains('sno-splash-skip')) setTimeout(flyBee, 450);
        } catch (_) {}
    })();
