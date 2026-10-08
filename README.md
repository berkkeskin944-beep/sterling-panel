# Discord Fotoğraf Yedekleme Botu

## Kurulum

1. Klasöre girin:
```bash
cd discord-photo-bot
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. `.env.example` dosyasını `.env` olarak kopyalayın ve token yazın:
```bash
copy .env.example .env
```
Sonra `.env` dosyasını açın ve `DISCORD_TOKEN=your_bot_token_here` kısmına bot token'ınızı yazın.

4. Botu başlatın:
```bash
npm start
```

## Kullanım

### Kategori Oluştur / Seç
```
.dostluk Boris,Astro,Xavi
```
Bu komut "boris,astro,xavi" adında bir kategori oluşturur (veya varsa seçer). Bundan sonra atacağınız tüm fotoğraflar bu kategoriye kaydedilir.

### Fotoğraf Yükle
Kategori seçildikten sonra (`.dostluk` ile), sadece fotoğrafları Discord'a atın. Bot otomatik olarak aktif kategoriye kaydedecek.

### Fotoğrafları Geri Al
```
.foto boris,astro,xavi
```
Belirtilen kategorideki tüm fotoğrafları size gönderir.

Kategori belirtmezseniz:
```
.foto
```
Tüm kategorileri listeler.

### Kategorileri Listele
```
.kategoriler
```
veya
```
.kategori
```

### Kategori Sil
```
.sil boris,astro,xavi
```
Kategoriyi ve içindeki tüm fotoğrafları siler.

## Notlar
- Fotoğraflar `photo_data/` klasöründe saklanır
- Her kategori ayrı klasörde tutulur
- Sadece resim dosyaları (jpg, png, gif, webp) kaydedilir
- Bot sadece `.` ile başlayan komutlara yanıt verir