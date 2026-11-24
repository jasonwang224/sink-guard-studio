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
  const atlas = new Image();
  const ready = new Promise((resolve, reject) => {
    atlas.onload = () => { loaded = true; paint(); resolve(); };
    atlas.onerror = () => reject(new Error('The assembly artwork could not be loaded.'));
  });
  atlas.src = new URL('./assets/assembly-fallback.webp', import.meta.url).href;

  function paint() {
    if (!loaded || disposed || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / 0.81, height / 0.51);
    const centreX = width / 2 + 0.014 * scale;
    const centreY = height / 2 + 0.005 * scale;

    function drawSprite(name, pose) {
      const [ix, iy, iw, ih, ox, oy] = sprites[name];
      // Orthographic camera at (0.33, 0.83, 1.05), looking towards the model origin.
      const dx = 0.953993717 * pose.x - 0.299826597 * pose.z;
      const dy = 0.180524921 * pose.x - 0.798422378 * pose.y + 0.574397476 * pose.z;
      const px = centreX + (ox / atlasPixelsPerMetre + dx) * scale;
      const py = centreY + (oy / atlasPixelsPerMetre + dy) * scale;
      ctx.drawImage(atlas, ix, iy, iw, ih, px, py, iw * scale / atlasPixelsPerMetre, ih * scale / atlasPixelsPerMetre);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.round(rect.width * dpr);
    height = Math.round(rect.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    paint();
  }

  resize();
  return {
    ready,
    draw(offsets) { poses = offsets || {}; paint(); },
    resize,
    dispose() { disposed = true; canvas.remove(); },
  };
}
