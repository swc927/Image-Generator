// Photo Batch Studio Plus
const sourceEl = document.getElementById('source');
const keywordEl = document.getElementById('keyword');
const apiKeyEl = document.getElementById('apiKey');
const countEl = document.getElementById('count');
const sizeEl = document.getElementById('size');
const cellEl = document.getElementById('cell');
const renderBtn = document.getElementById('renderBtn');
const zipBtn = document.getElementById('zipBtn');
const collageBtn = document.getElementById('collageBtn');
const grid = document.getElementById('grid');
const toast = document.getElementById('toast');

let currentItems = []; // { previewUrl, downloadUrl, caption }
let currentSize = 1000;

function showToast(t){
  toast.textContent = t;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1300);
}

function toggleUnsplashFields(){
  const unsplashBits = document.querySelectorAll('.opt-unsplash');
  const on = sourceEl.value === 'unsplash';
  unsplashBits.forEach(el => el.classList.toggle('hidden', !on));
}
sourceEl.addEventListener('change', toggleUnsplashFields);

function randomSeed(){
  return Math.random().toString(36).slice(2);
}

function picsumPreview(seed){
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/400`;
}
function picsumFull(seed, size){
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;
}

async function fetchUnsplash(query, count, key){
  const per = Math.min(count, 30);
  let page = 1;
  let items = [];
  while(items.length < count){
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${per}&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` }});
    if(!res.ok) throw new Error('Unsplash request failed');
    const data = await res.json();
    const batch = data.results || [];
    if(!batch.length) break;
    items = items.concat(batch);
    if(batch.length < per) break;
    page++;
  }
  return items.slice(0, count);
}

function addTile(src, caption=''){
  const fig = document.createElement('figure');
  fig.className = 'tile';
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  img.loading = 'lazy';
  img.src = src;
  img.alt = caption || 'Image';
  const cap = document.createElement('figcaption');
  cap.className = 'cap';
  cap.textContent = caption;
  fig.appendChild(img);
  fig.appendChild(cap);
  grid.appendChild(fig);
}

async function renderSet(){
  const n = Math.min(Math.max(+countEl.value || 1, 1), 60);
  currentSize = +sizeEl.value || 1000;
  currentItems = [];
  grid.innerHTML = '';

  if(sourceEl.value === 'picsum'){
    const seeds = Array.from({length:n}, () => randomSeed());
    currentItems = seeds.map(seed => ({
      previewUrl: picsumPreview(seed),
      downloadUrl: picsumFull(seed, currentSize),
      caption: `seed ${seed}`
    }));
  }else{
    const key = apiKeyEl.value.trim();
    const q = keywordEl.value.trim();
    if(!key || !q){
      showToast('Enter keyword and key for Unsplash');
      return;
    }
    try{
      const res = await fetchUnsplash(q, n, key);
      currentItems = res.map(r => {
        // use raw with width and height for exact square crops
        const raw = r.urls.raw;
        const preview = `${raw}&w=400&h=400&fit=crop`;
        const full = `${raw}&w=${currentSize}&h=${currentSize}&fit=crop`;
        const who = r.user && r.user.name ? `by ${r.user.name}` : '';
        return { previewUrl: preview, downloadUrl: full, caption: who };
      });
      showToast('Loaded from Unsplash');
    }catch(e){
      console.error(e);
      showToast('Unsplash failed');
      return;
    }
  }

  currentItems.forEach(it => addTile(it.previewUrl, it.caption));
  showToast('Rendered preview');
}

async function downloadZip(){
  if(!currentItems.length){ showToast('Render first'); return; }
  const zip = new JSZip();
  let done = 0;

  for(const [i, it] of currentItems.entries()){
    try{
      const res = await fetch(it.downloadUrl, { mode: 'cors', cache: 'no-store' });
      if(!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      zip.file(`photo_${String(i+1).padStart(2,'0')}_${currentSize}.${ext}`, blob);
      done++;
      if(done % 3 === 0) showToast(`Packed ${done}/${currentItems.length}`);
    }catch(e){
      console.error('Failed to fetch', it.downloadUrl, e);
    }
  }

  const out = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = `photos_${currentItems.length}_${currentSize}.zip`;
  a.click();
  showToast('ZIP ready');
}

async function exportCollage(){
  if(!currentItems.length){ showToast('Render first'); return; }
  const cell = +cellEl.value || 512;

  // load previews
  const imgs = await Promise.all(currentItems.map(it => new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = it.previewUrl;
  })));

  const valid = imgs.filter(Boolean);
  if(!valid.length){ showToast('Could not load preview'); return; }

  const cols = Math.ceil(Math.sqrt(valid.length));
  const rows = Math.ceil(valid.length / cols);
  const pad = 6;

  const canvas = document.createElement('canvas');
  canvas.width = cols * (cell + pad) + pad;
  canvas.height = rows * (cell + pad) + pad;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1024';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  function drawRounded(img, x, y, w, h, r){
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  valid.forEach((img, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = pad + c * (cell + pad);
    const y = pad + r * (cell + pad);
    drawRounded(img, x, y, cell, cell, 18);
  });

  try{
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `collage_${valid.length}_${cell}.png`;
    a.click();
    showToast('Collage saved');
  }catch(e){
    console.error(e);
    showToast('Export blocked by browser');
  }
}

renderBtn.addEventListener('click', renderSet);
zipBtn.addEventListener('click', downloadZip);
collageBtn.addEventListener('click', exportCollage);

document.addEventListener('DOMContentLoaded', () => {
  toggleUnsplashFields();
});
