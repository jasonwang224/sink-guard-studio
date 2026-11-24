const art = document.querySelector('#assembly-art');
const playButton = document.querySelector('#play-motion');
const playLabel = document.querySelector('#play-label');
const positionInput = document.querySelector('#assembly-travel');
const glueSwitch = document.querySelector('#glue-surfaces');
const glueCaption = document.querySelector('#glue-caption');
const poseName = document.querySelector('#pose-name');
const status = document.querySelector('#assembly-loading');
const resetButton = document.querySelector('#reset-camera');
const help = document.querySelector('#assembly-help');
const steps = [...document.querySelectorAll('[data-stop]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pieces = ['back-left', 'back-right', 'front-left', 'front-right'];

let viewer;
let position = 0;
let direction = 1;
let hold = 900;
let playing = false;
let previousTime;
let nextFrame;
let switchingRenderer = false;

function eased(start, end, value) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function offsetsAt(value) {
  // Move above a shelf first, then lower the mating upper lip onto it.
  const columnGap = .057 * (1 - eased(0, .34, value));
  const rightLift = .020 * (1 - eased(.34, .52, value));
  const rowGap = .065 * (1 - eased(.56, .84, value));
  const backLift = .022 * (1 - eased(.84, 1, value));
  return Object.fromEntries(pieces.map(name => {
    const right = name.endsWith('right');
    const back = name.startsWith('back');
    return [name, {x: right ? columnGap : -columnGap, y: (right ? rightLift : 0) + (back ? backLift : 0), z: back ? -rowGap : rowGap}];
  }));
}

function showPosition() {
  const phase = position < .02 ? 'Pieces apart' : position === 1 ? 'Cover assembled'
    : position <= .52 ? 'Left and right joints' : position <= .56 ? 'Two joined rows' : 'Front and back joint';
  if (poseName.textContent !== phase) poseName.textContent = phase;
  positionInput.value = Math.round(position * 1000);
  positionInput.setAttribute('aria-valuetext', Math.round(position * 100) + '% assembled. ' + phase);
  const active = position < .12 ? 0 : position <= .56 ? 1 : 2;
  steps.forEach((button, index) => {
    if (index === active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  viewer?.draw(offsetsAt(position));
}

function scheduleFrame() {
  if (nextFrame === undefined && playing && !document.hidden) nextFrame = requestAnimationFrame(advance);
}

function setPlaying(value) {
  playing = value;
  playLabel.textContent = playing ? 'Pause' : 'Play';
  playButton.classList.toggle('is-playing', playing);
  playButton.setAttribute('aria-label', playing ? 'Pause assembly animation' : 'Play assembly animation');
  previousTime = undefined;
  if (nextFrame !== undefined) cancelAnimationFrame(nextFrame);
  nextFrame = undefined;
  scheduleFrame();
}

function advance(time) {
  nextFrame = undefined;
  const elapsed = previousTime === undefined ? 0 : Math.min(80, time - previousTime);
  previousTime = time;
  if (hold > 0) hold -= elapsed;
  else {
    position = Math.max(0, Math.min(1, position + direction * elapsed / 5300));
    showPosition();
    if (position === 0 || position === 1) {
      direction = position === 0 ? 1 : -1;
      hold = 1150;
    }
  }
  scheduleFrame();
}

function scrub(value) {
  setPlaying(false);
  position = value;
  hold = 0;
  if (position === 0 || position === 1) direction = position === 0 ? 1 : -1;
  showPosition();
}

let glueChange = 0;
async function updateGlue() {
  const request = ++glueChange;
  const enabled = glueSwitch.checked;
  glueCaption.textContent = enabled ? 'Loading glue surfaces…' : '';
  try {
    await viewer.setGlueVisible(enabled);
    if (request === glueChange) glueCaption.textContent = enabled ? 'Amber marks the matching faces.' : '';
  } catch {
    if (request !== glueChange) return;
    glueSwitch.checked = false;
    glueCaption.textContent = 'Glue surfaces could not load. Try the switch again.';
  }
}
glueSwitch.addEventListener('change', () => {
  if (glueSwitch.checked) scrub(0);
  updateGlue();
});
playButton.addEventListener('click', () => setPlaying(!playing));
positionInput.addEventListener('input', () => scrub(Number(positionInput.value) / 1000));
steps.forEach(button => button.addEventListener('click', () => scrub(Number(button.dataset.stop))));
resetButton.addEventListener('click', () => viewer?.reset?.());
document.addEventListener('visibilitychange', () => {
  if (nextFrame !== undefined) cancelAnimationFrame(nextFrame);
  nextFrame = previousTime = undefined;
  scheduleFrame();
});
reducedMotion.addEventListener('change', event => { if (event.matches) setPlaying(false); });

function preventMenu(event) { event.preventDefault(); }

async function createOrbitView() {
  const [THREE, {OrbitControls}, {GLTFLoader}] = await Promise.all([
    import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/loaders/GLTFLoader.js')
  ]);
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 5);
  const scene = new THREE.Scene();
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.minZoom = .65;
  controls.maxZoom = 5;
  const homeTarget = new THREE.Vector3(0, .011, 0);
  controls.target.copy(homeTarget);
  const cameraStart = new THREE.Vector3(.33, .83, 1.05);
  camera.position.copy(cameraStart).add(controls.target);
  controls.update();

  const ambient = new THREE.HemisphereLight(0xffffff, 0xb4c1cd, 1.65);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff5e9, 1.9);
  key.position.set(-.5, 1, .45);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xecf6ff, .85);
  rim.position.set(.6, .32, -.65);
  scene.add(rim);

  let gltf, nodes;
  try {
    gltf = await new GLTFLoader().loadAsync('assets/assembly-quarters.glb');
    nodes = pieces.map(name => {
      const mesh = gltf.scene.getObjectByName(name);
      if (!mesh) throw new Error('Missing assembly piece: ' + name);
      return mesh;
    });
  } catch (error) {
    controls.dispose();
    renderer.dispose();
    throw error;
  }
  scene.add(gltf.scene);
  let disposed = false;
  let markGroups = [];
  let markRequest;
  let showMarks = false;
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb000, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2
  });
  async function loadMarks() {
    const marks = await new GLTFLoader().loadAsync('assets/assembly-glue-faces.glb');
    const groups = pieces.map(name => marks.scene.getObjectByName(name));
    if (groups.some(group => !group)) throw new Error('Incomplete glue model');
    groups.forEach((group, index) => {
      group.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.material.dispose();
        if (disposed) mesh.geometry.dispose();
        else { mesh.material = markMaterial; mesh.renderOrder = 1; }
      });
      if (!disposed) nodes[index].add(group);
    });
    if (!disposed) markGroups = groups;
  }
  async function setGlueVisible(visible) {
    showMarks = visible;
    if (visible && !markGroups.length) {
      markRequest ??= loadMarks().catch(error => { markRequest = undefined; throw error; });
      await markRequest;
    }
    if (disposed) return;
    markGroups.forEach(group => { group.visible = showMarks; });
    render();
  }
  art.replaceChildren(canvas);
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  function resize() {
    const w = art.clientWidth, h = art.clientHeight;
    if (!w || !h) return;
    const halfHeight = Math.max(.286, .448 * h / w);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.right = halfHeight * w / h;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    render();
  }
  function reset() {
    controls.target.copy(homeTarget);
    camera.zoom = 1;
    camera.position.copy(cameraStart).add(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    render();
  }
  function keydown(event) {
    if (!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','+','=','-','Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { reset(); return; }
    if (event.shiftKey && event.key.startsWith('Arrow')) {
      const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const dy = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      const distance = (camera.top - camera.bottom) / (camera.zoom * 16);
      const pan = new THREE.Vector3(dx, dy, 0).applyQuaternion(camera.quaternion).multiplyScalar(-distance);
      controls.target.add(pan);
      camera.position.add(pan);
      controls.update();
      render();
      return;
    }
    const orbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (event.key === 'ArrowLeft') orbit.theta -= .15;
    if (event.key === 'ArrowRight') orbit.theta += .15;
    if (event.key === 'ArrowUp') orbit.phi -= .15;
    if (event.key === 'ArrowDown') orbit.phi += .15;
    if (['+','=','-'].includes(event.key)) camera.zoom = THREE.MathUtils.clamp(camera.zoom * (event.key === '-' ? .88 : 1.14), controls.minZoom, controls.maxZoom);
    orbit.makeSafe();
    camera.position.setFromSpherical(orbit).add(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    render();
  }
  art.addEventListener('keydown', keydown);
  art.addEventListener('contextmenu', preventMenu);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); useFallback(); }, {once:true});
  resetButton.hidden = false;
  art.classList.add('is-orbit');
  art.setAttribute('aria-label', 'Four colored sink cover pieces. Drag to rotate and right-drag to pan. Arrow keys rotate, Shift plus arrow keys pan, and plus or minus zoom.');
  help.textContent = 'Drag to rotate · Right-drag to pan · Scroll to zoom';
  return {
    reset, resize, setGlueVisible,
    draw(offsets) {
      nodes.forEach((node, i) => { const offset = offsets[pieces[i]]; node.position.set(offset.x, offset.y, offset.z); });
      render();
    },
    dispose() {
      disposed = true;
      markMaterial.dispose();
      art.removeEventListener('keydown', keydown);
      art.removeEventListener('contextmenu', preventMenu);
      controls.dispose();
      gltf.scene.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
      renderer.dispose();
      canvas.remove();
    }
  };
}

async function useFallback() {
  if (switchingRenderer) return;
  switchingRenderer = true;
  try {
    viewer?.dispose();
    viewer = undefined;
    art.replaceChildren();
    resetButton.hidden = true;
    art.classList.remove('is-orbit');
    art.setAttribute('aria-label', 'Angled view of the cover. Right-drag or press Shift and the arrow keys to pan. Use the buttons or slider to move the joints.');
    help.textContent = 'Right-drag to pan · Move the slider to inspect the joints.';
    const {createFallback} = await import('./assembly-fallback.js?v=glue1');
    const fallback = createFallback(art);
    await fallback.ready;
    viewer = fallback;
    if (glueSwitch.checked) await updateGlue();
    resetButton.hidden = false;
    viewer.resize();
    showPosition();
  } finally {
    switchingRenderer = false;
    if (!viewer) {
      setPlaying(false);
      status.hidden = false;
      status.textContent = 'The assembly could not load. Refresh this page to try again.';
      [playButton, positionInput, glueSwitch, ...steps].forEach(control => control.disabled = true);
    }
  }
}

const stage = document.querySelector('.assembly-stage');
const fullButton = document.querySelector('#assembly-fullscreen');

function syncFullScreen() {
  const expanded = document.fullscreenElement === stage || stage.classList.contains('expanded');
  fullButton.setAttribute('aria-pressed', String(expanded));
  fullButton.querySelector('span').textContent = expanded ? 'Exit full screen' : 'Full screen';
  viewer?.resize();
}
function setExpanded(value) {
  stage.classList.toggle('expanded', value);
  document.body.classList.toggle('assembly-expanded', value);
  syncFullScreen();
}
fullButton.addEventListener('click', async () => {
  if (stage.classList.contains('expanded')) { setExpanded(false); return; }
  if (document.fullscreenElement === stage) { await document.exitFullscreen(); return; }
  if (stage.requestFullscreen && document.fullscreenEnabled) {
    try { await stage.requestFullscreen(); return; } catch { /* A hosting frame may only allow in-page expansion. */ }
  }
  setExpanded(true);
});
document.addEventListener('fullscreenchange', syncFullScreen);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && stage.classList.contains('expanded')) {
    setExpanded(false);
    fullButton.focus();
  }
});

async function initialize() {
  try {
    viewer = await createOrbitView();
  } catch {
    try { await useFallback(); } catch { return; }
  }
  if (!viewer) return;
  viewer.resize();
  new ResizeObserver(() => { viewer?.resize(); viewer?.draw(offsetsAt(position)); }).observe(art);
  status.hidden = true;
  [playButton, positionInput, glueSwitch, ...steps].forEach(control => control.disabled = false);
  showPosition();
  setPlaying(!reducedMotion.matches);
}

initialize();
