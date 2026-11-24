// Atlas regions and projected origins come from the same upright print meshes as the GLB.
const sprites = {
  'back-left':   [0, 0, 941, 435, -724, -435],
  'back-right':  [943, 0, 761, 548, -7, -398],
  'front-left':  [0, 550, 843, 559, -836, -153],
  'front-right': [845, 550, 941, 494, -217, -13],
  'back-row':    [0, 1111, 1478, 585, -724, -435],
  'front-row':   [0, 1698, 1560, 634, -836, -153],
  'assembled':   [0, 2334, 1590, 916, -836, -435],
};
const atlasPixelsPerMetre = 2700;
const origin = {x: 0, y: 0, z: 0};
// Cropped amber mask regions, with their offset inside each underlying sprite.
const glueRegions = {
  'back-left':   [0, 0, 941, 396, 0, 39],
  'back-right':  [0, 398, 703, 162, 28, 386],
  'front-left':  [705, 398, 728, 557, 115, 0],
  'front-right': [0, 957, 695, 154, 246, 0],
  'back-row':    [0, 1113, 1448, 546, 0, 39],
  'front-row':   [0, 1661, 1445, 557, 115, 0],
  'assembled':   [0, 2220, 1448, 800, 112, 39],
};

function joined(a, b) {
  return Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7 && Math.abs(a.z - b.z) < 1e-7;
}

export function createFallback(container) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The canvas renderer is unavailable.');
  container.append(canvas);

  let poses = {};
  let loaded = false;
  let disposed = false;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let panX = 0;
  let panY = 0;
  let drag;
  let glueVisible = false;
  let glueAtlas;
  let glueLoad;
  const atlas = new Image();
  const ready = new Promise((resolve, reject) => {
    atlas.onload = () => { loaded = true; paint(); resolve(); };
    atlas.onerror = () => reject(new Error('The assembly artwork could not be loaded.'));
  });
  atlas.src = new URL('./assets/assembly-fallback.webp', import.meta.url).href;

  function setGlueVisible(visible) {
    glueVisible = Boolean(visible);
    if (!glueVisible || glueAtlas) {
      paint();
      return Promise.resolve();
    }
    if (!glueLoad) {
      const image = new Image();
      glueLoad = new Promise((resolve, reject) => {
        image.onload = () => { glueAtlas = image; paint(); resolve(); };
        image.onerror = () => { glueLoad = undefined; reject(new Error('The glue surface artwork could not be loaded.')); };
      });
      image.src = new URL('./assets/assembly-glue-fallback.webp', import.meta.url).href;
    }
    return glueLoad;
  }

  function paint() {
    if (!loaded || disposed || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / 0.81, height / 0.51);
    const centreX = width / 2 + 0.014 * scale + panX * dpr;
    const centreY = height / 2 + 0.005 * scale + panY * dpr;

    function drawSprite(name, pose) {
      const [ix, iy, iw, ih, ox, oy] = sprites[name];
      // Orthographic camera at (0.33, 0.83, 1.05), looking towards the model origin.
      const dx = 0.953993717 * pose.x - 0.299826597 * pose.z;
      const dy = 0.180524921 * pose.x - 0.798422378 * pose.y + 0.574397476 * pose.z;
      const px = centreX + (ox / atlasPixelsPerMetre + dx) * scale;
      const py = centreY + (oy / atlasPixelsPerMetre + dy) * scale;
      const pxScale = scale / atlasPixelsPerMetre;
      ctx.drawImage(atlas, ix, iy, iw, ih, px, py, iw * pxScale, ih * pxScale);
      if (glueVisible && glueAtlas && glueRegions[name]) {
        const [gx, gy, gw, gh, dx, dy] = glueRegions[name];
        ctx.drawImage(glueAtlas, gx, gy, gw, gh, px + dx * pxScale, py + dy * pxScale, gw * pxScale, gh * pxScale);
      }
    }

    const bl = poses['back-left'] || origin;
    const br = poses['back-right'] || origin;
    const fl = poses['front-left'] || origin;
    const fr = poses['front-right'] || origin;
    if (joined(bl, br) && joined(fl, fr) && joined(bl, fl)) {
      drawSprite('assembled', bl);
      return;
    }
    // Joined poses use a common depth-buffered image so both lips occlude correctly.
    function drawRow(side, left, right) {
      if (joined(left, right)) drawSprite(`${side}-row`, left);
      else {
        drawSprite(`${side}-left`, left);
        drawSprite(`${side}-right`, right);
      }
    }
    drawRow('back', bl, br);
    drawRow('front', fl, fr);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.round(rect.width * dpr);
    height = Math.round(rect.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    paint();
  }

  const listeners = new AbortController();
  const options = {signal: listeners.signal};
  const previousCursor = container.style.cursor;

  function releaseDrag() {
    if (!drag) return;
    const id = drag.id;
    drag = undefined;
    container.style.cursor = previousCursor;
    if (container.hasPointerCapture(id)) container.releasePointerCapture(id);
  }

  function reset() {
    releaseDrag();
    panX = panY = 0;
    paint();
  }

  container.addEventListener('contextmenu', event => event.preventDefault(), options);
  container.addEventListener('pointerdown', event => {
    if (event.button !== 2 || drag) return;
    event.preventDefault();
    container.focus({preventScroll: true});
    container.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    container.style.cursor = 'grabbing';
  }, options);
  container.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    if (!(event.buttons & 2)) { releaseDrag(); return; }
    panX += event.clientX - drag.x;
    panY += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    paint();
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    container.addEventListener(type, event => {
      if (event.pointerId === drag?.id) releaseDrag();
    }, options);
  }
  const arrowPan = {ArrowLeft:[-32,0], ArrowRight:[32,0], ArrowUp:[0,-32], ArrowDown:[0,32]};
  container.addEventListener('keydown', event => {
    if (event.key === 'Home') {
      event.preventDefault();
      reset();
    } else if (event.shiftKey && Object.hasOwn(arrowPan, event.key)) {
      event.preventDefault();
      const [dx, dy] = arrowPan[event.key];
      panX += dx;
      panY += dy;
      paint();
    }
  }, options);

  resize();
  return {
    ready,
    draw(offsets) { poses = offsets || {}; paint(); },
    resize, reset, setGlueVisible,
    dispose() { disposed = true; listeners.abort(); releaseDrag(); canvas.remove(); },
  };
}
