const { Client, GatewayIntentBits, Events, AttachmentBuilder, EmbedBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BOT_SECRET = process.env.BOT_SECRET;
const WORKER_URL = process.env.WORKER_URL;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const PAGES_PROJECT = process.env.PAGES_PROJECT || 'dostluk-panel';

const DATA_DIR = path.join(__dirname, 'photo_data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_OUT_DIR = path.join(PUBLIC_DIR, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_OUT_DIR)) fs.mkdirSync(DATA_OUT_DIR, { recursive: true });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

let categories = {};
let lastUsedBy = {};

function loadCategories() {
  const file = path.join(DATA_DIR, 'categories.json');
  if (fs.existsSync(file)) {
    categories = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    categories = {};
  }
  return categories;
}

function saveCategories() {
  fs.writeFileSync(path.join(DATA_DIR, 'categories.json'), JSON.stringify(categories, null, 2));
}

function getCatDir(name) {
  const dir = path.join(DATA_DIR, name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findCats(terms) {
  terms = terms.map(t => t.toLowerCase());
  return Object.keys(categories).filter(cat => 
    terms.every(t => cat.toLowerCase().includes(t))
  );
}

function isImageUrl(url) {
  return /\.(png|jpg|jpeg|gif|webp|bmp)(\?.*)?$/i.test(url) || 
         /https?:\/\/(media|cdn)\.discordapp\.com\//i.test(url);
}

function extractImageUrls(text) {
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  return urls.filter(isImageUrl);
}

async function downloadAndSave(url, catDir) {
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
    return { filename: fname, size: buf.byteLength };
  } catch (e) {
    console.error('Download error:', e.message);
    return null;
  }
}

async function pushToWorker(photos) {
  if (!WORKER_URL || !BOT_SECRET) return;
  try {
    await fetch(`${WORKER_URL}/api/photos`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOT_SECRET}`
      },
      body: JSON.stringify(photos)
    });
  } catch (e) {
    console.error('Worker push error:', e.message);
  }
}

async function generateDataFiles() {
  loadCategories();
  
  // Generate categories.js
  const catsArray = Object.entries(categories).map(([name, data]) => ({
    name,
    count: data.photos?.length || 0,
    createdAt: data.createdAt
  }));
  
  fs.writeFileSync(
    path.join(DATA_OUT_DIR, 'categories.js'),
    `// Auto-generated - ${new Date().toISOString()}\nwindow.CATEGORIES = ${JSON.stringify(catsArray, null, 2)};`
  );

  // Generate photos.js
  const photosArray = [];
  for (const [catName, data] of Object.entries(categories)) {
    if (!data.photos) continue;
    const catDir = getCatDir(catName);
    for (const p of data.photos) {
      const fp = path.join(catDir, p.filename);
      if (fs.existsSync(fp)) {
        photosArray.push({
          id: p.id || `${catName}_${p.filename}`,
          filename: p.filename,
          category: catName,
          url: `/images/${catName}/${p.filename}`,
          size: p.size || fs.statSync(fp).size,
          uploadedAt: p.uploadedAt || Date.now(),
          uploadedBy: p.uploadedBy
        });
      }
    }
  }
  
  fs.writeFileSync(
    path.join(DATA_OUT_DIR, 'photos.js'),
    `// Auto-generated - ${new Date().toISOString()}\nwindow.PHOTOS = ${JSON.stringify(photosArray, null, 2)};`
  );

  console.log(`[Data] Generated: ${catsArray.length} categories, ${photosArray.length} photos`);
  return { categories: catsArray, photos: photosArray };
}

async function deployToPages() {
  try {
    console.log('[Deploy] Deploying to Cloudflare Pages...');
    execSync(`npx wrangler pages deploy ${PUBLIC_DIR} --project-name=${PAGES_PROJECT} --branch=main`, {
      stdio: 'inherit',
      env: { ...process.env, CF_API_TOKEN, CF_ACCOUNT_ID }
    });
    console.log('[Deploy] Pages deploy done!');
  } catch (e) {
    console.error('[Deploy] Pages deploy failed:', e.message);
  }
}

async function deployWorker() {
  try {
    console.log('[Deploy] Deploying Worker...');
    execSync(`npx wrangler deploy`, {
      stdio: 'inherit',
      env: { ...process.env, CF_API_TOKEN, CF_ACCOUNT_ID }
    });
    console.log('[Deploy] Worker deploy done!');
  } catch (e) {
    console.error('[Deploy] Worker deploy failed:', e.message);
  }
}

async function fullDeploy() {
  await generateDataFiles();
  await deployToPages();
  await deployWorker();
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot ready: ${client.user.tag}`);
  loadCategories();
  await generateDataFiles();
  
  // Register slash commands
  const commands = [
    { name: 'dostluk', description: 'Kategori oluştur/seç', options: [{ name: 'kategori', type: 3, description: 'Kategori adı', required: true }] },
    { name: 'foto', description: 'Fotoğrafları getir', options: [{ name: 'kategori', type: 3, description: 'Kategori adı (boş = tüm)', required: false }] },
    { name: 'kategoriler', description: 'Tüm kategorileri listele' },
    { name: 'sil', description: 'Kategori sil', options: [{ name: 'kategori', type: 3, description: 'Kategori adı', required: true }] },
    { name: 'yardim', description: 'Komutları göster' },
    { name: 'deploy', description: 'Cloudflare\'a deploy et (sahip)' }
  ];
  
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Slash commands registered');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user } = interaction;
  loadCategories();

  if (commandName === 'dostluk') {
    const name = options.getString('kategori').toLowerCase().trim();
    if (!categories[name]) {
      categories[name] = { createdBy: user.id, createdAt: Date.now(), photos: [] };
      saveCategories();
      getCatDir(name);
    }
    lastUsedBy[user.id] = name;
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📁 Kategori Seçildi').setDescription(`**${name}** aktif. Fotoğraf/Link at.`).setColor(0x00ff00)] });
  }

  if (commandName === 'foto') {
    const name = options.getString('kategori');
    if (!name) {
      const list = Object.entries(categories).map(([c, d]) => `• **${c}** (${d.photos?.length || 0})`).join('\n') || 'Yok';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📂 Kategoriler').setDescription(list).setColor(0x3498db)] });
    }
    const matched = findCats(name.split(' '));
    if (!matched.length) return interaction.reply({ content: `Bulunamadı: **${name}**`, ephemeral: true });
    if (matched.length > 1) return interaction.reply({ content: `Çok fazla: ${matched.join(', ')}`, ephemeral: true });
    
    const cat = categories[matched[0]];
    if (!cat.photos?.length) return interaction.reply({ content: 'Boş kategori', ephemeral: true });
    
    const files = cat.photos.map(p => {
      const fp = path.join(getCatDir(matched[0]), p.filename);
      return fs.existsSync(fp) ? new AttachmentBuilder(fp, { name: p.filename }) : null;
    }).filter(Boolean);
    
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📸 ${matched[0]}`).setColor(0xff6b35)], files });
  }

  if (commandName === 'kategoriler') {
    const list = Object.entries(categories).map(([c, d]) => `• **${c}** - ${d.photos?.length || 0}`).join('\n') || 'Yok';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📂 Kategoriler').setDescription(list).setColor(0x3498db)] });
  }

  if (commandName === 'sil') {
    const name = options.getString('kategori').toLowerCase();
    const matched = findCats([name]);
    if (!matched.length) return interaction.reply({ content: `Yok: **${name}**`, ephemeral: true });
    if (matched.length > 1) return interaction.reply({ content: `Çok fazla: ${matched.join(', ')}`, ephemeral: true });
    
    fs.rmSync(getCatDir(matched[0]), { recursive: true, force: true });
    delete categories[matched[0]];
    saveCategories();
    return interaction.reply(`✅ **${matched[0]}** silindi.`);
  }

  if (commandName === 'yardim') {
    const emb = new EmbedBuilder()
      .setTitle('📖 Dostluk SS Komutları')
      .setColor(0x58a6ff)
      .addFields(
        { name: '/dostluk <kategori>', value: 'Kategori oluştur/seç', inline: false },
        { name: '/foto [kategori]', value: 'Fotoğrafları getir', inline: false },
        { name: '/kategoriler', value: 'Listele', inline: false },
        { name: '/sil <kategori>', value: 'Sil', inline: false },
        { name: '/deploy', value: 'CF Pages + Worker deploy (sahip)', inline: false }
      );
    return interaction.reply({ embeds: [emb] });
  }

  if (commandName === 'deploy') {
    if (user.id !== process.env.OWNER_ID) return interaction.reply({ content: 'Yetkisiz', ephemeral: true });
    await interaction.deferReply();
    await fullDeploy();
    await interaction.editReply('✅ Deploy tamamlandı!');
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  // Handle prefix commands
  if (message.content.startsWith('.')) {
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    loadCategories();

    if (cmd === 'dostluk') {
      const name = args.join(' ').toLowerCase().trim();
      if (!categories[name]) {
        categories[name] = { createdBy: message.author.id, createdAt: Date.now(), photos: [] };
        saveCategories();
        getCatDir(name);
      }
      lastUsedBy[message.author.id] = name;
      return message.reply({ embeds: [new EmbedBuilder().setTitle('📁 Kategori Seçildi').setDescription(`**${name}** aktif`).setColor(0x00ff00)] });
    }
    if (cmd === 'foto') {
      if (!args.length) {
        const list = Object.entries(categories).map(([c, d]) => `• **${c}** (${d.photos?.length || 0})`).join('\n') || 'Yok';
        return message.reply({ embeds: [new EmbedBuilder().setTitle('📂 Kategoriler').setDescription(list).setColor(0x3498db)] });
      }
      const matched = findCats(args);
      if (!matched.length) return message.reply(`Bulunamadı: **${args.join(' ')}**`);
      if (matched.length > 1) return message.reply(`Çok fazla: ${matched.join(', ')}`);
      const cat = categories[matched[0]];
      if (!cat.photos?.length) return message.reply('Boş');
      const files = cat.photos.map(p => {
        const fp = path.join(getCatDir(matched[0]), p.filename);
        return fs.existsSync(fp) ? new AttachmentBuilder(fp, { name: p.filename }) : null;
      }).filter(Boolean);
      return message.reply({ embeds: [new EmbedBuilder().setTitle(`📸 ${matched[0]}`).setColor(0xff6b35)], files });
    }
    if (cmd === 'kategoriler' || cmd === 'kategori') {
      const list = Object.entries(categories).map(([c, d]) => `• **${c}** - ${d.photos?.length || 0}`).join('\n') || 'Yok';
      return message.reply({ embeds: [new EmbedBuilder().setTitle('📂 Kategoriler').setDescription(list).setColor(0x3498db)] });
    }
    if (cmd === 'sil') {
      const matched = findCats(args);
      if (!matched.length) return message.reply(`Yok: **${args.join(' ')}**`);
      if (matched.length > 1) return message.reply(`Çok fazla: ${matched.join(', ')}`);
      fs.rmSync(getCatDir(matched[0]), { recursive: true, force: true });
      delete categories[matched[0]];
      saveCategories();
      return message.reply(`✅ **${matched[0]}** silindi.`);
    }
    if (cmd === 'yardim' || cmd === 'help') {
      const emb = new EmbedBuilder().setTitle('📖 Komutlar').setColor(0x58a6ff)
        .addFields(
          { name: '.dostluk <kategori>', value: 'Kategori seç', inline: false },
          { name: '.foto [kelimeler]', value: 'Esnek arama', inline: false },
          { name: '.kategoriler', value: 'Listele', inline: false },
          { name: '.sil <kategori>', value: 'Sil', inline: false }
        );
      return message.reply({ embeds: [emb] });
    }
    return;
  }

  // Auto-save attachments & URLs
  if (message.attachments.size > 0 || extractImageUrls(message.content).length > 0) {
    const activeCat = lastUsedBy[message.author.id];
    if (!activeCat || !categories[activeCat]) return;

    const cat = categories[activeCat];
    const catDir = getCatDir(activeCat);
    let saved = 0;
    const newPhotos = [];

    // Attachments
    for (const [, att] of message.attachments) {
      if (!att.contentType?.startsWith('image/')) continue;
      const ext = path.extname(att.name) || '.png';
      const fname = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const fp = path.join(catDir, fname);
      try {
        const res = await fetch(att.url);
        const buf = await res.arrayBuffer();
        fs.writeFileSync(fp, Buffer.from(buf));
        const photo = { id: `${activeCat}_${fname}`, filename: fname, originalName: att.name, uploadedBy: message.author.id, uploadedAt: Date.now(), size: att.size };
        if (!cat.photos) cat.photos = [];
        cat.photos.push(photo);
        newPhotos.push({ ...photo, category: activeCat });
        saved++;
      } catch (e) { console.error(e); }
    }

    // URLs
    for (const url of extractImageUrls(message.content)) {
      const result = await downloadAndSave(url, catDir);
      if (result) {
        const photo = { id: `${activeCat}_${result.filename}`, filename: result.filename, originalName: result.filename, uploadedBy: message.author.id, uploadedAt: Date.now(), size: result.size };
        if (!cat.photos) cat.photos = [];
        cat.photos.push(photo);
        newPhotos.push({ ...photo, category: activeCat });
        saved++;
      }
    }

    if (saved > 0) {
      saveCategories();
      await generateDataFiles();
      await pushToWorker(newPhotos);
      const emb = new EmbedBuilder().setTitle('✅ Kaydedildi').setDescription(`**${activeCat}** → ${saved} fotoğraf`).setColor(0x00ff00);
      await message.reply({ embeds: [emb] });
    }
  }
});

client.login(TOKEN);