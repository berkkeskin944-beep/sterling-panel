const { Client, GatewayIntentBits, Events, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const DATA_DIR = path.join(__dirname, 'photo_data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadCategories() {
  if (fs.existsSync(CATEGORIES_FILE)) {
    return JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
  }
  return {};
}

function saveCategories(categories) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
}

function getCategoryDir(category) {
  const dir = path.join(DATA_DIR, category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

client.once(Events.ClientReady, () => {
  console.log(`Bot hazır: ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('.')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'dostluk') {
    if (args.length === 0) {
      return message.reply('Kullanım: `.dostluk kategori_adı` - Yeni kategori oluşturur veya mevcut kategoriyi seçer.');
    }
    const categoryName = args.join(' ').toLowerCase();
    const categories = loadCategories();
    
    if (!categories[categoryName]) {
      categories[categoryName] = {
        createdBy: message.author.id,
        createdAt: Date.now(),
        photos: []
      };
      saveCategories(categories);
      getCategoryDir(categoryName);
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📁 Kategori Seçildi')
      .setDescription(`**${categoryName}** kategorisi aktif.\nŞimdi fotoğrafları atabilirsiniz.`)
      .setColor(0x00ff00);
    return message.reply({ embeds: [embed] });
  }

  function findCategories(categories, searchTerms) {
  const terms = searchTerms.map(t => t.toLowerCase());
  return Object.keys(categories).filter(cat => {
    const catLower = cat.toLowerCase();
    return terms.every(term => catLower.includes(term));
  });
}

  if (command === 'foto') {
    const categories = loadCategories();
    const categoryNames = Object.keys(categories);
    
    if (categoryNames.length === 0) {
      return message.reply('Henüz hiç kategori yok. `.dostluk kategori_adı` ile oluşturun.');
    }

    if (args.length === 0) {
      const list = categoryNames.map(c => `• **${c}** (${categories[c].photos.length} fotoğraf)`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('📂 Kategoriler')
        .setDescription(list)
        .setColor(0x3498db);
      return message.reply({ embeds: [embed] });
    }

    const matchedCategories = findCategories(categories, args);
    
    if (matchedCategories.length === 0) {
      return message.reply(`Aradığınız kriterlere uygun kategori bulunamadı: **${args.join(' ')}**`);
    }

    if (matchedCategories.length > 1) {
      const list = matchedCategories.map(c => `• **${c}** (${categories[c].photos.length} fotoğraf)`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('🔍 Birden fazla kategori bulundu')
        .setDescription(list + '\n\nDaha spesifik arama yapın.')
        .setColor(0xffaa00);
      return message.reply({ embeds: [embed] });
    }

    const categoryName = matchedCategories[0];
    const category = categories[categoryName];

    if (category.photos.length === 0) {
      return message.reply(`**${categoryName}** kategorisinde fotoğraf yok.`);
    }

    const attachments = category.photos.map((photo, index) => {
      const filePath = path.join(getCategoryDir(categoryName), photo.filename);
      if (fs.existsSync(filePath)) {
        return new AttachmentBuilder(filePath, { name: photo.filename });
      }
      return null;
    }).filter(Boolean);

    if (attachments.length === 0) {
      return message.reply('Dosyalar bulunamadı.');
    }

    const embed = new EmbedBuilder()
      .setTitle(`📸 ${categoryName} - ${attachments.length} fotoğraf`)
      .setColor(0xff6b35);
    
    await message.reply({ embeds: [embed], files: attachments });
    return;
  }

  if (command === 'kategoriler' || command === 'kategori') {
    const categories = loadCategories();
    const categoryNames = Object.keys(categories);
    
    if (categoryNames.length === 0) {
      return message.reply('Henüz hiç kategori yok.');
    }

    const list = categoryNames.map(c => `• **${c}** - ${categories[c].photos.length} fotoğraf`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle('📂 Tüm Kategoriler')
      .setDescription(list)
      .setColor(0x3498db);
    return message.reply({ embeds: [embed] });
  }

  if (command === 'sil') {
    if (args.length === 0) {
      return message.reply('Kullanım: `.sil kategori_adı` - Kategoriyi ve tüm fotoğraflarını siler.');
    }
    const categories = loadCategories();
    const matchedCategories = findCategories(categories, args);
    
    if (matchedCategories.length === 0) {
      return message.reply(`**${args.join(' ')}** kategorisi bulunamadı.`);
    }

    if (matchedCategories.length > 1) {
      const list = matchedCategories.map(c => `• **${c}**`).join('\n');
      return message.reply(`Birden fazla kategori bulundu, daha spesifik yazın:\n${list}`);
    }

    const categoryName = matchedCategories[0];
    const categoryDir = getCategoryDir(categoryName);
    if (fs.existsSync(categoryDir)) {
      fs.rmSync(categoryDir, { recursive: true, force: true });
    }
    
    delete categories[categoryName];
    saveCategories(categories);
    
    return message.reply(`✅ **${categoryName}** kategorisi ve tüm fotoğrafları silindi.`);
  }

  if (command === 'yardım' || command === 'help' || command === 'komutlar') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Fotoğraf Botu - Komutlar')
      .setDescription('Tüm komutlar `.` ile başlar.')
      .setColor(0x5865f2)
      .addFields(
        { name: '`.dostluk <kategori>`', value: 'Kategori oluşturur veya seçer. Seçili kategoriye fotoğraf atarsınız.', inline: false },
        { name: '`.foto [kelime1 kelime2...]`', value: 'Kategori arar (esnek arama). Boş bırakılırsa tüm kategorileri listeler.', inline: false },
        { name: '`.kategoriler` / `.kategori`', value: 'Tüm kategorileri ve fotoğraf sayılarını listeler.', inline: false },
        { name: '`.sil <kategori>`', value: 'Kategoriyi ve içindeki tüm fotoğrafları siler (esnek arama).', inline: false },
        { name: '`.yardım` / `.help` / `.komutlar`', value: 'Bu mesajı gösterir.', inline: false }
      )
      .setFooter({ text: 'Örnek: .dostluk boris astro xavi → sonra fotoğraf at → .foto astro xavi' });
    return message.reply({ embeds: [embed] });
  }
});

function isImageUrl(url) {
  const imageExtensions = /\.(png|jpg|jpeg|gif|webp|bmp)(\?.*)?$/i;
  const discordCdn = /https?:\/\/(media|cdn)\.discordapp\.com\//i;
  return imageExtensions.test(url) || discordCdn.test(url);
}

function extractImageUrls(text) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];
  return urls.filter(isImageUrl);
}

async function downloadAndSave(url, categoryDir, category, message) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    
    const buffer = await response.arrayBuffer();
    const ext = path.extname(new URL(url).pathname) || 
      (contentType.includes('png') ? '.png' : 
       contentType.includes('jpeg') ? '.jpg' : 
       contentType.includes('gif') ? '.gif' : 
       contentType.includes('webp') ? '.webp' : '.png');
    
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(categoryDir, filename);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    category.photos.push({
      filename,
      originalName: filename,
      uploadedBy: message.author.id,
      uploadedAt: Date.now(),
      size: buffer.byteLength,
      sourceUrl: url
    });
    return filename;
  } catch (err) {
    console.error('URL indirme hatası:', err.message);
    return null;
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const categories = loadCategories();
  const activeCategory = Object.keys(categories).find(c => 
    categories[c].lastUsedBy === message.author.id
  );

  if (!activeCategory) return;

  const category = categories[activeCategory];
  const categoryDir = getCategoryDir(activeCategory);
  let savedCount = 0;

  // 1. Attachments (dosya yüklendi)
  for (const [, attachment] of message.attachments) {
    if (!attachment.contentType?.startsWith('image/')) continue;
    const ext = path.extname(attachment.name) || '.png';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(categoryDir, filename);
    try {
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      category.photos.push({
        filename,
        originalName: attachment.name,
        uploadedBy: message.author.id,
        uploadedAt: Date.now(),
        size: attachment.size
      });
      savedCount++;
    } catch (err) {
      console.error('Attachment kaydetme hatası:', err);
    }
  }

  // 2. URLs in message content (Discord CDN linkleri, imgur, vs.)
  const imageUrls = extractImageUrls(message.content);
  for (const url of imageUrls) {
    const result = await downloadAndSave(url, categoryDir, category, message);
    if (result) savedCount++;
  }

  if (savedCount > 0) {
    category.lastUsedBy = message.author.id;
    saveCategories(categories);
    const embed = new EmbedBuilder()
      .setTitle('✅ Fotoğraflar Kaydedildi')
      .setDescription(`**${activeCategory}** kategorisine ${savedCount} fotoğraf eklendi.`)
      .setColor(0x00ff00);
    await message.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);