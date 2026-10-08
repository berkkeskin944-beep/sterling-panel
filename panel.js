const express = require('express');
const fs = require('fs');
const path = require('path');
// Node 18+ native fetch kullanıyoruz

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'photo_data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadCategories() {
  if (fs.existsSync(CATEGORIES_FILE)) {
    return JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
  }
  return {};
}

function saveCategories(cats) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(cats, null, 2));
}

function getCatDir(name) {
  const dir = path.join(DATA_DIR, name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isImageUrl(url) {
  return /\.(png|jpg|jpeg|gif|webp|bmp)(\?.*)?$/i.test(url) || 
         /https?:\/\/(media|cdn)\.discordapp\.com\//i.test(url);
}

async function downloadAndSave(url, catDir, cat) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    const ext = path.extname(new URL(url).pathname) || 
      (ct.includes('png') ? '.png' : ct.includes('jpeg') ? '.jpg' : 
       ct.includes('gif') ? '.gif' : ct.includes('webp') ? '.webp' : '.png');
    const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    fs.writeFileSync(path.join(catDir, fname), Buffer.from(buf));
    cat.photos.push({ filename: fname, originalName: fname, uploadedBy: 'panel', uploadedAt: Date.now(), size: buf.byteLength, sourceUrl: url });
    return fname;
  } catch (e) {
    console.error('Download error:', e.message);
    return null;
  }
}

app.get('/api/categories', (req, res) => {
  const cats = loadCategories();
  const list = Object.keys(cats).map(k => ({
    name: k,
    count: cats[k].photos.length,
    createdAt: cats[k].createdAt
  }));
  res.json(list);
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'İsim gerekli' });
  const key = name.toLowerCase().trim();
  const cats = loadCategories();
  if (!cats[key]) {
    cats[key] = { createdBy: 'panel', createdAt: Date.now(), photos: [] };
    saveCategories(cats);
    getCatDir(key);
  }
  res.json({ success: true, name: key });
});

app.delete('/api/categories/:name', (req, res) => {
  const name = req.params.name.toLowerCase();
  const cats = loadCategories();
  if (!cats[name]) return res.status(404).json({ error: 'Yok' });
  fs.rmSync(getCatDir(name), { recursive: true, force: true });
  delete cats[name];
  saveCategories(cats);
  res.json({ success: true });
});

app.post('/api/categories/:name/urls', async (req, res) => {
  const name = req.params.name.toLowerCase();
  const { urls } = req.body;
  if (!Array.isArray(urls)) return res.status(400).json({ error: 'URL listesi gerekli' });
  
  const cats = loadCategories();
  if (!cats[name]) return res.status(404).json({ error: 'Kategori yok' });
  
  const cat = cats[name];
  const catDir = getCatDir(name);
  let saved = 0;
  
  for (const url of urls) {
    if (!isImageUrl(url)) continue;
    const result = await downloadAndSave(url, catDir, cat);
    if (result) saved++;
  }
  
  saveCategories(cats);
  res.json({ success: true, saved });
});

app.get('/api/categories/:name/photos', (req, res) => {
  const name = req.params.name.toLowerCase();
  const cats = loadCategories();
  if (!cats[name]) return res.status(404).json({ error: 'Yok' });
  
  const catDir = getCatDir(name);
  const photos = cats[name].photos.map(p => {
    const fp = path.join(catDir, p.filename);
    return fs.existsSync(fp) ? { ...p, url: `/images/${name}/${p.filename}` } : null;
  }).filter(Boolean);
  
  res.json(photos);
});

app.delete('/api/categories/:name/photos/:filename', (req, res) => {
  const name = req.params.name.toLowerCase();
  const filename = req.params.filename;
  const cats = loadCategories();
  if (!cats[name]) return res.status(404).json({ error: 'Kategori yok' });
  
  const cat = cats[name];
  const idx = cat.photos.findIndex(p => p.filename === filename);
  if (idx === -1) return res.status(404).json({ error: 'Fotoğraf yok' });
  
  const fp = path.join(getCatDir(name), filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  
  cat.photos.splice(idx, 1);
  saveCategories(cats);
  res.json({ success: true });
});

app.use('/images', express.static(DATA_DIR));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Panel: http://localhost:${PORT}`);
  console.log(`Listening on 0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});