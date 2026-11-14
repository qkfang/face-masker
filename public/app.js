const $ = (id) => document.getElementById(id);
const els = {
  open: $('openBtn'), input: $('fileInput'), save: $('saveBtn'), status: $('status'),
  images: $('images'), panel: $('panel'), empty: $('empty'), list: $('faceList'), count: $('count'),
  orig: $('origCanvas'), mask: $('maskCanvas'),
  origBoxes: document.querySelector('#stageOriginal .boxes'),
  maskBoxes: document.querySelector('#stageMasked .boxes'),
  origName: $('origName'), maskedName: $('maskedName'),
  type: $('maskType'), shape: $('maskShape'), strength: $('strength'), opacity: $('opacity'),
};

const KID_MAX_AGE = 18;
const PAD = 0.15;

const state = { file: null, handle: null, faces: [], saveName: '', saveType: 'image/png' };
let modelsReady = null;

function setStatus(msg) { els.status.textContent = msg; }

function loadModels() {
  modelsReady ??= (async () => {
    setStatus('Loading face detection models…');
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri('/model'),
      faceapi.nets.ageGenderNet.loadFromUri('/model'),
    ]);
  })();
  return modelsReady;
}

// ---------- file selection ----------

els.open.addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await showOpenFilePicker({
        types: [{ description: 'Images', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'] } }],
      });
      await openFile(await handle.getFile(), handle);
    } catch (e) {
      if (e.name !== 'AbortError') setStatus(`Could not open file: ${e.message}`);
    }
  } else {
    els.input.click();
  }
});
els.input.addEventListener('change', () => {
  const file = els.input.files[0];
  els.input.value = '';
  if (file) openFile(file, null);
});

async function openFile(file, handle) {
  if (!file.type.startsWith('image/')) { setStatus('That file is not an image.'); return; }
  els.save.disabled = true;
  try {
    await loadModels();
    setStatus('Reading photo…');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    els.orig.width = els.mask.width = bitmap.width;
    els.orig.height = els.mask.height = bitmap.height;
    els.orig.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();

    Object.assign(state, { file, handle, faces: [] });
    const dot = file.name.lastIndexOf('.');
    const base = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext = dot > 0 ? file.name.slice(dot) : '';
    const keepType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    state.saveType = keepType ? file.type : 'image/png';
    state.saveName = `${base}_masked${keepType ? ext : '.png'}`;
    els.origName.textContent = file.name;
    els.maskedName.textContent = state.saveName;

    els.empty.hidden = true;
    els.images.hidden = els.panel.hidden = false;
    setStatus('Detecting faces…');
    await new Promise(requestAnimationFrame);

    const results = await faceapi
      .detectAllFaces(els.orig, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
      .withAgeAndGender();
    state.faces = results
      .sort((a, b) => a.detection.box.x - b.detection.box.x)
      .map((r, i) => makeFace(r, i));
    setStatus(state.faces.length
      ? `Found ${state.faces.length} face${state.faces.length > 1 ? 's' : ''}. Select the ones to mask.`
      : 'No faces detected in this photo.');
    refresh();
    els.save.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus(`Failed to process photo: ${e.message}`);
  }
}

function makeFace(result, index) {
  const { x, y, width, height } = result.detection.box;
  const W = els.orig.width, H = els.orig.height;
  const x0 = Math.max(0, x - width * PAD), y0 = Math.max(0, y - height * PAD);
  const x1 = Math.min(W, x + width * (1 + PAD)), y1 = Math.min(H, y + height * (1 + PAD));
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  const t = document.createElement('canvas');
  t.width = t.height = 88;
  t.getContext('2d').drawImage(els.orig, box.x, box.y, box.w, box.h, 0, 0, 88, 88);

  return {
    id: index, box, age: Math.round(result.age),
    category: result.age < KID_MAX_AGE ? 'kid' : 'adult',
    selected: true, thumb: t.toDataURL('image/jpeg', 0.8),
  };
}

// ---------- rendering ----------

function drawMasked() {
  const ctx = els.mask.getContext('2d');
  const { width: W, height: H } = els.mask;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(els.orig, 0, 0);
  const strength = Number(els.strength.value);

  const opacity = Number(els.opacity.value) / 100;

  for (const f of state.faces.filter((f) => f.selected)) {
    const { x, y, w, h } = f.box;
    ctx.save();
    ctx.globalAlpha = opacity;

    if (els.type.value === 'smiley') {
      drawSmiley(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.55);
    } else {
      ctx.beginPath();
      if (els.shape.value === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(buildEffect(els.type.value, f.box, strength), x, y, w, h);
    }
    ctx.restore();
  }
}

// Renders the mask effect for one face into its own canvas (w x h) so it can be composited with opacity.
function buildEffect(type, { x, y, w, h }, strength) {
  const W = els.orig.width, H = els.orig.height;
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.round(w));
  layer.height = Math.max(1, Math.round(h));
  const lctx = layer.getContext('2d');
  const size = Math.max(w, h);

  if (type === 'solid') {
    lctx.fillStyle = '#000';
    lctx.fillRect(0, 0, layer.width, layer.height);
  } else if (type === 'motion') {
    // Average several horizontally shifted copies of the face to simulate motion blur.
    const length = size * strength * 0.06;
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const shift = (i / (steps - 1) - 0.5) * length;
      lctx.globalAlpha = 1 / (i + 1);
      lctx.drawImage(els.orig, x + shift, y, w, h, 0, 0, layer.width, layer.height);
    }
  } else if (type === 'blur') {
    const radius = size * strength * 0.012;
    const m = Math.ceil(radius * 3);
    const sx = Math.max(0, x - m), sy = Math.max(0, y - m);
    const sw = Math.min(W, x + w + m) - sx, sh = Math.min(H, y + h + m) - sy;
    lctx.filter = `blur(${radius}px)`;
    lctx.drawImage(els.orig, sx, sy, sw, sh, sx - x, sy - y, sw, sh);
  } else {
    const blocks = Math.max(2, Math.round(18 - strength * 1.6));
    const scale = blocks / size;
    const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
    const tmp = document.createElement('canvas');
    tmp.width = tw; tmp.height = th;
    tmp.getContext('2d').drawImage(els.orig, x, y, w, h, 0, 0, tw, th);
    lctx.imageSmoothingEnabled = false;
    lctx.drawImage(tmp, 0, 0, tw, th, 0, 0, layer.width, layer.height);
  }
  return layer;
}

function drawSmiley(ctx, cx, cy, r) {
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = r * 0.06;
  ctx.stroke();

  ctx.fillStyle = '#3b2f00';
  for (const dx of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * r, cy - 0.25 * r, r * 0.09, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#3b2f00';
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 0.05 * r, r * 0.55, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function renderBoxes(container) {
  const W = els.orig.width, H = els.orig.height;
  container.replaceChildren(...state.faces.map((f) => {
    const d = document.createElement('div');
    d.className = `box ${f.selected ? 'selected' : ''} ${f.category}`;
    d.dataset.id = f.id;
    Object.assign(d.style, {
      left: `${(f.box.x / W) * 100}%`, top: `${(f.box.y / H) * 100}%`,
      width: `${(f.box.w / W) * 100}%`, height: `${(f.box.h / H) * 100}%`,
    });
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${f.id + 1} · ${f.category === 'kid' ? 'Kid' : 'Adult'}`;
    d.append(tag);
    d.title = f.selected ? 'Click to unmask' : 'Click to mask';
    d.addEventListener('click', () => toggle(f.id));
    d.addEventListener('mouseenter', () => hover(f.id, true));
    d.addEventListener('mouseleave', () => hover(f.id, false));
    return d;
  }));
}

function renderList() {
  const selected = state.faces.filter((f) => f.selected).length;
  els.count.textContent = state.faces.length ? `(${selected} of ${state.faces.length} masked)` : '';
  els.list.replaceChildren(...state.faces.map((f) => {
    const li = document.createElement('li');
    li.dataset.id = f.id;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = f.selected;
    cb.addEventListener('change', () => toggle(f.id));

    const img = document.createElement('img');
    img.src = f.thumb;
    img.alt = `Face ${f.id + 1}`;

    const name = document.createElement('div');
    name.className = 'name';
    name.innerHTML = `Face ${f.id + 1}<small>est. age ~${f.age}</small>`;

    const sel = document.createElement('select');
    sel.innerHTML = '<option value="adult">Adult</option><option value="kid">Kid</option>';
    sel.value = f.category;
    sel.addEventListener('change', () => { f.category = sel.value; refresh(); });

    li.append(cb, img, name, sel);
    li.addEventListener('mouseenter', () => hover(f.id, true));
    li.addEventListener('mouseleave', () => hover(f.id, false));
    return li;
  }));
}

function refresh() {
  renderBoxes(els.origBoxes);
  renderBoxes(els.maskBoxes);
  renderList();
  drawMasked();
}

function toggle(id) {
  const f = state.faces[id];
  f.selected = !f.selected;
  refresh();
}

function hover(id, on) {
  document.querySelectorAll(`[data-id="${id}"]`).forEach((n) => n.classList.toggle('hover', on));
}

document.querySelectorAll('[data-bulk]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const mode = btn.dataset.bulk;
    state.faces.forEach((f) => { f.selected = mode === 'all' || f.category === mode; });
    refresh();
  }));

let redrawQueued = false;
for (const el of [els.type, els.shape, els.strength, els.opacity]) {
  el.addEventListener('input', () => {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => { redrawQueued = false; drawMasked(); });
  });
}

// ---------- saving ----------

els.save.addEventListener('click', async () => {
  const quality = state.saveType === 'image/png' ? undefined : 0.95;
  const blob = await new Promise((res) => els.mask.toBlob(res, state.saveType, quality));
  if (!blob) { setStatus('Could not encode the masked image.'); return; }

  if (window.showSaveFilePicker) {
    try {
      const ext = state.saveName.slice(state.saveName.lastIndexOf('.'));
      const opts = {
        suggestedName: state.saveName,
        types: [{ description: 'Image', accept: { [state.saveType]: [ext] } }],
      };
      if (state.handle) opts.startIn = state.handle; // same folder as the original
      const out = await showSaveFilePicker(opts);
      const w = await out.createWritable();
      await w.write(blob);
      await w.close();
      setStatus(`Saved ${out.name}. Original left untouched.`);
    } catch (e) {
      if (e.name !== 'AbortError') setStatus(`Save failed: ${e.message}`);
    }
    return;
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = state.saveName;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Downloaded ${state.saveName}. Original left untouched.`);
});

loadModels().then(() => setStatus('Choose a local photo to begin.')).catch((e) => setStatus(`Model load failed: ${e.message}`));
