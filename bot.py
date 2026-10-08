import discord
from discord.ext import commands
import os
import json
import aiohttp
import asyncio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv('DISCORD_TOKEN')
DATA_DIR = Path(__file__).parent / 'photo_data'
CATEGORIES_FILE = DATA_DIR / 'categories.json'

DATA_DIR.mkdir(exist_ok=True)

def load_categories():
    if CATEGORIES_FILE.exists():
        with open(CATEGORIES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_categories(cats):
    with open(CATEGORIES_FILE, 'w', encoding='utf-8') as f:
        json.dump(cats, f, indent=2, ensure_ascii=False)

def get_cat_dir(name):
    d = DATA_DIR / name
    d.mkdir(exist_ok=True)
    return d

def find_cats(cats, terms):
    terms = [t.lower() for t in terms]
    return [c for c in cats if all(t in c.lower() for t in terms)]

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.guild_messages = True

bot = commands.Bot(command_prefix='.', intents=intents, help_command=None)

@bot.event
async def on_ready():
    print(f'Bot hazır: {bot.user}')

@bot.command()
async def dostluk(ctx, *, name: str):
    name = name.lower().strip()
    cats = load_categories()
    if name not in cats:
        cats[name] = {'created_by': ctx.author.id, 'photos': []}
        save_categories(cats)
        get_cat_dir(name)
    cats[name]['last_used_by'] = ctx.author.id
    save_categories(cats)
    embed = discord.Embed(title='📁 Kategori Seçildi', description=f'**{name}** aktif.\nFotoğraf at.', color=0x00ff00)
    await ctx.reply(embed=embed)

@bot.command()
async def foto(ctx, *terms):
    cats = load_categories()
    if not cats:
        return await ctx.reply('Kategori yok. `.dostluk isim` ile oluştur.')

    if not terms:
        lines = [f'• **{c}** ({len(cats[c]["photos"])} fotoğraf)' for c in cats]
        embed = discord.Embed(title='📂 Kategoriler', description='\n'.join(lines), color=0x3498db)
        return await ctx.reply(embed=embed)

    matched = find_cats(cats, terms)
    if not matched:
        return await ctx.reply(f'Bulunamadı: **{" ".join(terms)}**')
    if len(matched) > 1:
        lines = [f'• **{c}** ({len(cats[c]["photos"])} fotoğraf)' for c in matched]
        embed = discord.Embed(title='🔍 Çok fazla sonuç', description='\n'.join(lines) + '\n\nDaha spesifik yaz.', color=0xffaa00)
        return await ctx.reply(embed=embed)

    cat_name = matched[0]
    cat = cats[cat_name]
    if not cat['photos']:
        return await ctx.reply(f'**{cat_name}** boş.')

    files = []
    for p in cat['photos']:
        fp = get_cat_dir(cat_name) / p['filename']
        if fp.exists():
            files.append(discord.File(fp, filename=p['filename']))

    if not files:
        return await ctx.reply('Dosyalar yok.')

    embed = discord.Embed(title=f'📸 {cat_name} - {len(files)} fotoğraf', color=0xff6b35)
    await ctx.reply(embed=embed, files=files)

@bot.command(aliases=['kategori'])
async def kategoriler(ctx):
    cats = load_categories()
    if not cats:
        return await ctx.reply('Kategori yok.')
    lines = [f'• **{c}** - {len(cats[c]["photos"])} fotoğraf' for c in cats]
    embed = discord.Embed(title='📂 Tüm Kategoriler', description='\n'.join(lines), color=0x3498db)
    await ctx.reply(embed=embed)

@bot.command()
async def sil(ctx, *terms):
    cats = load_categories()
    matched = find_cats(cats, terms)
    if not matched:
        return await ctx.reply(f'Bulunamadı: **{" ".join(terms)}**')
    if len(matched) > 1:
        return await ctx.reply('Çok fazla: ' + ', '.join(matched))

    name = matched[0]
    import shutil
    shutil.rmtree(get_cat_dir(name), ignore_errors=True)
    del cats[name]
    save_categories(cats)
    await ctx.reply(f'✅ **{name** silindi.')

@bot.command(aliases=['help', 'komutlar'])
async def yardım(ctx):
    embed = discord.Embed(title='📖 Komutlar', color=0x5865f2)
    embed.add_field(name='`.dostluk <isim>`', value='Kategori oluştur/seç. Sonra fotoğraf at.', inline=False)
    embed.add_field(name='`.foto [kelimeler]`', value='Esnek arama. Boş=kategoriler.', inline=False)
    embed.add_field(name='`.kategoriler`', value='Listele.', inline=False)
    embed.add_field(name='`.sil <isim>`', value='Sil.', inline=False)
    embed.set_footer(text='Örn: .dostluk astro xavi → foto at → .foto astro xavi')
    await ctx.reply(embed=embed)

@bot.event
async def on_message(msg):
    if msg.author.bot:
        return
    await bot.process_commands(msg)

    if not msg.attachments:
        return
    cats = load_categories()
    active = next((c for c in cats if cats[c].get('last_used_by') == msg.author.id), None)
    if not active:
        return

    cat = cats[active]
    cat_dir = get_cat_dir(active)
    count = 0
    async with aiohttp.ClientSession() as session:
        for att in msg.attachments:
            if not att.content_type or not att.content_type.startswith('image/'):
                continue
            ext = Path(att.filename).suffix or '.png'
            fname = f'{int(asyncio.get_event_loop().time()*1000)}_{count}{ext}'
            fpath = cat_dir / fname
            async with session.get(att.url) as r:
                data = await r.read()
            fpath.write_bytes(data)
            cat['photos'].append({'filename': fname, 'original': att.filename, 'by': msg.author.id})
            count += 1

    if count:
        cat['last_used_by'] = msg.author.id
        save_categories(cats)
        embed = discord.Embed(title='✅ Kaydedildi', description=f'**{active}** → {count} fotoğraf', color=0x00ff00)
        await msg.reply(embed=embed)

if __name__ == '__main__':
    if not TOKEN:
        print('HATA: .env dosyasında DISCORD_TOKEN yok!')
        exit(1)
    bot.run(TOKEN)