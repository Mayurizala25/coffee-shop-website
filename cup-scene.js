/* <cup-scene> — scroll-driven cinematic 3D stage for the reusable coffee cup.
 *
 *   <cup-scene track="#hero-track" mode="scroll"></cup-scene>
 *
 * Attributes
 *   track — selector of the tall scroll element that drives the timeline
 *   mode  — "scroll" (default) | "loop" | "static"
 *
 * Owns: renderer, warm studio env, key/fill/rim lights, contact shadow,
 * ambient dust, steam, falling beans, and the lid-open/close choreography.
 * Pauses its loop when offscreen. Honours prefers-reduced-motion.
 */
if (!window.__cupSceneLoaded) {
window.__cupSceneLoaded = true;

const THREE_URL = 'https://unpkg.com/three@0.184.0/build/three.module.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const span = (p, a, b) => smooth((p - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;

class CupScene extends HTMLElement {
  connectedCallback() {
    if (this._booted) return;
    this._booted = true;
    this.style.display = 'block';
    this.style.position = this.style.position || 'absolute';
    this.style.inset = '0';
    this._boot();
  }

  disconnectedCallback() {
    this._alive = false;
    if (this._renderer) this._renderer.setAnimationLoop(null);
    if (this._onResize) removeEventListener('resize', this._onResize);
    if (this._onScroll) removeEventListener('scroll', this._onScroll);
  }

  async _boot() {
    const THREE = await import(THREE_URL);
    const { buildCup, buildBean } = await import('./cup-model.js');
    if (!this.isConnected) return;
    this._alive = true;
    this.THREE = THREE;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    this._renderer = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 40);
    this._scene = scene; this._camera = camera;

    /* --- warm studio environment (softbox above, warm panel, cool fill) --- */
    const envCv = document.createElement('canvas');
    envCv.width = 512; envCv.height = 256;
    const ec = envCv.getContext('2d');
    const eg = ec.createLinearGradient(0, 0, 0, 256);
    eg.addColorStop(0, '#fff7e9'); eg.addColorStop(0.44, '#ece0cb');
    eg.addColorStop(0.66, '#cbb99c'); eg.addColorStop(1, '#8b7761');
    ec.fillStyle = eg; ec.fillRect(0, 0, 512, 256);
    ec.filter = 'blur(16px)';
    ec.fillStyle = 'rgba(255,255,255,.95)'; ec.fillRect(146, 4, 214, 64);
    ec.fillStyle = 'rgba(255,224,182,.55)'; ec.fillRect(18, 94, 98, 80);
    ec.fillStyle = 'rgba(212,226,255,.3)'; ec.fillRect(398, 102, 92, 72);
    ec.filter = 'none';
    const envTex = new THREE.CanvasTexture(envCv);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this._envRT = pmrem.fromEquirectangular(envTex);
    scene.environment = this._envRT.texture;
    pmrem.dispose(); envTex.dispose();

    /* --- lights --- */
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6d5844, 0.5));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.5);
    key.position.set(0.24, 0.42, 0.26);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.05; key.shadow.camera.far = 1.4;
    key.shadow.camera.left = key.shadow.camera.bottom = -0.24;
    key.shadow.camera.right = key.shadow.camera.top = 0.24;
    key.shadow.bias = -0.0006;
    key.shadow.radius = 3;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(-0.32, 0.18, 0.18);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd6a2, 0.85);
    rim.position.set(-0.18, 0.26, -0.34);
    scene.add(rim);
    const sheen = new THREE.PointLight(0xffe9c8, 0.12, 0.45, 2);
    scene.add(sheen);
    this._sheen = sheen;

    /* --- product --- */
    const parts = buildCup(THREE);
    const cup = parts.cup, lid = parts.lid;
    this._parts = parts;

    // re-pivot the lid so it rotates about its own seat, not the cup base
    const LID_PIVOT = 0.113;
    lid.children.forEach((m) => m.geometry.translate(0, -LID_PIVOT, 0));
    lid.position.y = LID_PIVOT;

    const spin = new THREE.Group();          // product turntable
    spin.add(cup);
    const rig = new THREE.Group();           // intro lift + breathing
    rig.add(spin);
    scene.add(rig);
    this._spin = spin; this._rig = rig; this._lid = lid;

    // coffee sits low and rises as the lid comes off
    parts.coffee.position.y = 0.066;
    parts.mat.coffee.transparent = true;
    parts.mat.coffee.opacity = 0;

    /* --- shadow catcher + painted contact shadow --- */
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.ShadowMaterial({ opacity: 0.3 })
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    scene.add(catcher);

    const shCv = document.createElement('canvas');
    shCv.width = shCv.height = 128;
    const sc = shCv.getContext('2d');
    const sg = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
    sg.addColorStop(0, 'rgba(70,50,32,.46)');
    sg.addColorStop(0.5, 'rgba(70,50,32,.17)');
    sg.addColorStop(1, 'rgba(70,50,32,0)');
    sc.fillStyle = sg; sc.fillRect(0, 0, 128, 128);
    this._shTex = new THREE.CanvasTexture(shCv);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: this._shTex, transparent: true, depthWrite: false })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.0012;
    scene.add(contact);
    this._contact = contact;

    /* --- soft round sprite shared by dust + steam --- */
    const dotCv = document.createElement('canvas');
    dotCv.width = dotCv.height = 64;
    const dc = dotCv.getContext('2d');
    const dg = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, 'rgba(255,255,255,1)');
    dg.addColorStop(0.4, 'rgba(255,255,255,.5)');
    dg.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = dg; dc.fillRect(0, 0, 64, 64);
    this._dotTex = new THREE.CanvasTexture(dotCv);

    /* --- ambient dust --- */
    const DUST = 160;
    const dp = new Float32Array(DUST * 3);
    this._dustSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.09 + Math.random() * 0.4;
      dp[i * 3] = Math.cos(a) * r;
      dp[i * 3 + 1] = Math.random() * 0.4 - 0.05;
      dp[i * 3 + 2] = Math.sin(a) * r;
      this._dustSeed[i] = Math.random() * 6.28;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xa8815c, map: this._dotTex, alphaMap: this._dotTex, size: 0.0055,
      transparent: true, opacity: 0.34, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(dust);
    this._dust = dust; this._dustGeo = dustGeo;

    /* --- steam --- */
    const STEAM = 70;
    const sp = new Float32Array(STEAM * 3);
    this._steamSeed = new Float32Array(STEAM);
    this._steamLife = new Float32Array(STEAM);
    for (let i = 0; i < STEAM; i++) {
      this._steamSeed[i] = Math.random() * 6.28;
      this._steamLife[i] = Math.random();
    }
    const steamGeo = new THREE.BufferGeometry();
    steamGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({
      color: 0xfff4e4, map: this._dotTex, alphaMap: this._dotTex, size: 0.026,
      transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true
    }));
    scene.add(steam);
    this._steam = steam; this._steamGeo = steamGeo;

    /* --- falling beans: stagger, tumble, settle on the ground ring --- */
    const BEANS = 9;
    this._beans = [];
    for (let i = 0; i < BEANS; i++) {
      const b = buildBean(THREE, parts.mat.bean);
      const a = (i / BEANS) * Math.PI * 2 + 0.6;
      const r = 0.075 + (i % 3) * 0.022;
      b.userData = {
        t0: 0.26 + i * 0.035,
        from: new THREE.Vector3(Math.cos(a) * r * 0.55, 0.34 + (i % 4) * 0.05, Math.sin(a) * r * 0.55),
        to: new THREE.Vector3(Math.cos(a) * r, 0.0065, Math.sin(a) * r),
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        rate: 0.6 + Math.random() * 1.1
      };
      b.scale.setScalar(0.92 + Math.random() * 0.3);
      scene.add(b);
      this._beans.push(b);
    }

    /* --- orbiting bean ring: always turning, independent of the timeline --- */
    const orbit = new THREE.Group();
    scene.add(orbit);
    this._orbit = orbit;
    this._orbiters = [];
    this._wp = new THREE.Vector3();
    for (let i = 0; i < 7; i++) {
      const b = buildBean(THREE, parts.mat.bean);
      const a = (i / 7) * Math.PI * 2;
      const r = 0.34 + (i % 3) * 0.035;
      // keep them low: nothing crosses the headline band in the upper frame
      b.userData = { a, r, y: 0.012 + (i % 4) * 0.022, seed: Math.random() * 6.28, rate: 0.5 + Math.random() * 0.8 };
      b.scale.setScalar(0.62 + Math.random() * 0.2);
      b.traverse((m) => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; } });
      orbit.add(b);
      this._orbiters.push(b);
    }

    /* --- drive --- */
    const trackSel = this.getAttribute('track');
    this._track = trackSel ? document.querySelector(trackSel) : null;
    this._mode = this.getAttribute('mode') || 'scroll';
    this._reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._p = 0; this._pTarget = 0; this._t = 0; this._fit = 1; this._last = performance.now() / 1000;

    this._onResize = () => this._resize();
    addEventListener('resize', this._onResize, { passive: true });
    this._onScroll = () => { this._pTarget = this._progress(); };
    addEventListener('scroll', this._onScroll, { passive: true });

    /* pointer parallax, and drag-to-orbit when the timeline isn't driving */
    this._px = 0; this._py = 0; this._pxT = 0; this._pyT = 0;
    this._drag = 0; this._dragT = 0; this._dragging = false;
    this.style.touchAction = 'pan-y';
    this.addEventListener('pointermove', (e) => {
      const r = this.getBoundingClientRect();
      this._pxT = ((e.clientX - r.left) / r.width) * 2 - 1;
      this._pyT = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (this._dragging) {
        this._dragT += (e.clientX - this._lastX) * 0.008;
        this._lastX = e.clientX;
      }
    }, { passive: true });
    this.addEventListener('pointerleave', () => { this._pxT = 0; this._pyT = 0; });
    if (this._mode !== 'scroll') {
      this.style.cursor = 'grab';
      this.addEventListener('pointerdown', (e) => {
        this._dragging = true; this._lastX = e.clientX;
        this.style.cursor = 'grabbing';
        this.setPointerCapture && this.setPointerCapture(e.pointerId);
      });
      const up = () => { this._dragging = false; this.style.cursor = 'grab'; };
      this.addEventListener('pointerup', up);
      this.addEventListener('pointercancel', up);
    }
    this._resize();
    this._pTarget = this._p = this._progress();

    let visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '10%' }).observe(this);
    }

    renderer.setAnimationLoop(() => {
      const now = performance.now() / 1000;
      const dt = Math.min(now - this._last, 0.05);
      this._last = now;
      if (!visible) return;
      this._t += dt;
      this._tick(dt);
      renderer.render(scene, camera);
    });

    this.dispatchEvent(new CustomEvent('cup-ready', { bubbles: true }));
  }

  _progress() {
    if (this._mode === 'static') return 0.42;
    if (this._mode === 'loop' || !this._track) return (this._t * 0.055) % 1;
    const r = this._track.getBoundingClientRect();
    const total = r.height - innerHeight;
    return total <= 0 ? 0 : clamp01(-r.top / total);
  }

  _resize() {
    const w = this.clientWidth || 1, h = this.clientHeight || 1;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._narrow = w < 760;
    // the product is ~0.17 tall; frame it to ~62% of the pane with headroom
    const vFov = this._camera.fov * Math.PI / 180;
    const needV = 0.17 / 0.62 / (2 * Math.tan(vFov / 2));
    const needH = 0.12 / 0.58 / (2 * Math.tan(vFov / 2) * this._camera.aspect);
    this._fit = Math.max(1, Math.max(needV, needH) / 0.48);
  }

  /* The 20-second choreography, expressed against scroll progress p:
     0.00–0.20 push-in · 0.20–0.42 lid off · 0.42–0.62 beans + coffee
     0.62–0.76 aroma hold · 0.76–0.88 lid returns · 0.88–1.00 hero turn  */
  _tick(dt) {
    const THREE = this.THREE;
    if (this._mode === 'loop') this._pTarget = (this._t * 0.07) % 1;
    else if (this._mode === 'scroll') this._pTarget = this._progress();
    // ease toward the scroll target so wheel jumps read as camera moves
    this._p += (this._pTarget - this._p) * Math.min(1, dt * 6);
    const p = this._reduce ? this._pTarget : this._p;
    const t = this._t;

    const open = span(p, 0.2, 0.42) * (1 - span(p, 0.76, 0.88));
    const reveal = span(p, 0.4, 0.6) * (1 - span(p, 0.8, 0.9));
    const hero = span(p, 0.86, 1);

    /* camera: macro push-in, lift to follow the lid, orbit out to the hero */
    const az = mix(-0.34, 0.14, smooth(p)) + Math.sin(p * Math.PI) * 0.22 + hero * 0.5;
    const rad = (mix(0.46, 0.5, span(p, 0, 0.3)) + open * 0.03 + hero * 0.05) * this._fit;
    const hgt = mix(0.1, 0.132, span(p, 0.1, 0.45)) - hero * 0.02;
    // pointer parallax: a gentle lean toward the cursor, product stays centred
    this._px += (this._pxT - this._px) * Math.min(1, dt * 3);
    this._py += (this._pyT - this._py) * Math.min(1, dt * 3);
    const azP = az + this._px * 0.16;
    const hgtP = hgt - this._py * 0.018;
    this._camera.position.set(Math.sin(azP) * rad, hgtP, Math.cos(azP) * rad);
    this._camera.lookAt(0, 0.086 + open * 0.014 + this._py * 0.004, 0);

    /* product */
    this._drag += (this._dragT - this._drag) * Math.min(1, dt * 4);
    // constant idle turntable so the product is always in motion
    const idle = this._reduce ? 0 : t * 0.2;
    this._spin.rotation.y = idle + mix(-0.5, 0.42, smooth(p)) + hero * Math.PI * 1.35 + this._drag
      + (this._reduce ? 0 : Math.sin(t * 0.25) * 0.02);
    const lift = span(p, 0.03, 0.2) * 0.006;
    this._rig.position.y = lift + (this._reduce ? 0 : Math.sin(t * 1.0) * 0.0016);
    this._rig.rotation.z = this._reduce ? 0 : Math.sin(t * 0.42) * 0.005;

    /* lid: rises, tilts, drifts aside — then seats back with a soft settle */
    const l = this._lid;
    l.position.y = 0.113 + open * 0.085;
    l.position.x = open * 0.052;
    l.position.z = open * -0.012;
    l.rotation.z = open * -0.52;
    l.rotation.x = open * 0.16;
    l.rotation.y = open * 0.5;

    /* coffee surface rises into view once the cup is open */
    this._parts.mat.coffee.opacity = reveal;
    this._parts.coffee.position.y = mix(0.062, 0.072, reveal);

    /* beans fall, tumble, settle */
    for (const b of this._beans) {
      const u = b.userData;
      const k = clamp01((p - u.t0) / 0.2);
      const drop = k * k;                       // gravity-ish ease-in
      const bounce = k > 0.86 ? Math.sin((k - 0.86) / 0.14 * Math.PI) * 0.012 : 0;
      b.position.lerpVectors(u.from, u.to, drop);
      b.position.y += bounce;
      b.visible = k > 0.001;
      const spinAmt = (1 - k * 0.82) * u.rate;
      b.rotation.set(u.rot.x + t * spinAmt, u.rot.y + t * spinAmt * 0.7, u.rot.z + t * spinAmt * 0.4);
      b.position.x += Math.sin(t * 0.4 + u.rot.x) * 0.0012 * (1 - k);
    }

    /* steam: slow upward plume with sway, only while the cup is open */
    const sOp = reveal * 0.5;
    this._steam.material.opacity = sOp;
    if (sOp > 0.01) {
      const sp = this._steamGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        let life = this._steamLife[i] + dt * 0.19;
        if (life > 1) life -= 1;
        this._steamLife[i] = life;
        const seed = this._steamSeed[i];
        const r = 0.006 + life * 0.05;
        const a = seed + life * 1.6;
        sp.setXYZ(i,
          Math.cos(a) * r + Math.sin(t * 0.6 + seed) * 0.008,
          0.082 + life * 0.13,
          Math.sin(a) * r + Math.cos(t * 0.5 + seed) * 0.008);
      }
      sp.needsUpdate = true;
      this._steam.material.size = 0.02 + reveal * 0.014;
    }

    /* dust + travelling sheen + contact shadow tracking the lift */
    if (!this._reduce) {
      const dp = this._dustGeo.attributes.position;
      for (let i = 0; i < dp.count; i++) {
        let y = dp.getY(i) + dt * 0.012;
        if (y > 0.4) y = -0.05;
        dp.setY(i, y);
        dp.setX(i, dp.getX(i) + Math.sin(t * 0.3 + this._dustSeed[i]) * dt * 0.004);
      }
      dp.needsUpdate = true;
    }
    // orbiting beans: ring rotation + individual tumble and bob
    this._orbit.rotation.y = this._reduce ? 0 : -t * 0.14;
    const camDist = this._camera.position.length();
    for (const b of this._orbiters) {
      const u = b.userData;
      b.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.5 + u.seed) * 0.012, Math.sin(u.a) * u.r);
      b.rotation.set(u.seed + t * u.rate, u.seed + t * u.rate * 0.6, t * u.rate * 0.35);
      // fade out any orbiter that swings nearer the lens than the product
      b.getWorldPosition(this._wp);
      const d = this._wp.distanceTo(this._camera.position);
      const op = clamp01((d - camDist * 0.88) / (camDist * 0.22));
      b.visible = op > 0.02;
      b.traverse((m) => { if (m.material) m.material.opacity = op * 0.9; });
    }

    this._sheen.position.set(Math.cos(t * 0.5 + this._px) * 0.16, 0.2, Math.sin(t * 0.5 + this._px) * 0.16);
    this._contact.scale.setScalar(1 + lift * 2.2);
    this._contact.material.opacity = 0.95 - lift * 6;
  }
}

if (!customElements.get('cup-scene')) customElements.define('cup-scene', CupScene);

}
