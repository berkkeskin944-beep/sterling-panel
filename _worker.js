export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // KV namespace: PHOTOS_KV
    const kv = env.PHOTOS_KV;

    // GET /api/categories
    if (path === '/api/categories' && request.method === 'GET') {
      const data = await kv.get('categories', { type: 'json' }) || [];
      return Response.json(data, { headers: corsHeaders });
    }

    // GET /api/photos
    if (path === '/api/photos' && request.method === 'GET') {
      const cat = url.searchParams.get('category');
      const data = await kv.get('photos', { type: 'json' }) || [];
      const filtered = cat ? data.filter(p => p.category === cat) : data;
      return Response.json(filtered, { headers: corsHeaders });
    }

    // GET /api/photos/:id
    if (path.startsWith('/api/photos/') && request.method === 'GET') {
      const id = path.split('/').pop();
      const data = await kv.get('photos', { type: 'json' }) || [];
      const photo = data.find(p => p.id === id);
      if (!photo) return new Response('Not found', { status: 404, headers: corsHeaders });
      return Response.json(photo, { headers: corsHeaders });
    }

    // POST /api/photos (bot upload)
    if (path === '/api/photos' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.BOT_SECRET}`) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }
      const body = await request.json();
      const photos = await kv.get('photos', { type: 'json' }) || [];
      const newPhoto = {
        id: crypto.randomUUID(),
        ...body,
        uploadedAt: Date.now()
      };
      photos.unshift(newPhoto);
      await kv.put('photos', JSON.stringify(photos));
      
      // Update category count
      const cats = await kv.get('categories', { type: 'json' }) || [];
      const catIdx = cats.findIndex(c => c.name === body.category);
      if (catIdx >= 0) {
        cats[catIdx].count = (cats[catIdx].count || 0) + 1;
      } else {
        cats.push({ name: body.category, count: 1 });
      }
      await kv.put('categories', JSON.stringify(cats));

      return Response.json({ success: true, photo: newPhoto }, { headers: corsHeaders });
    }

    // DELETE /api/photos/:id
    if (path.startsWith('/api/photos/') && request.method === 'DELETE') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.BOT_SECRET}`) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }
      const id = path.split('/').pop();
      let photos = await kv.get('photos', { type: 'json' }) || [];
      const photo = photos.find(p => p.id === id);
      if (!photo) return new Response('Not found', { status: 404, headers: corsHeaders });
      
      photos = photos.filter(p => p.id !== id);
      await kv.put('photos', JSON.stringify(photos));

      // Update category count
      const cats = await kv.get('categories', { type: 'json' }) || [];
      const catIdx = cats.findIndex(c => c.name === photo.category);
      if (catIdx >= 0) {
        cats[catIdx].count = Math.max(0, (cats[catIdx].count || 1) - 1);
        if (cats[catIdx].count === 0) cats.splice(catIdx, 1);
      }
      await kv.put('categories', JSON.stringify(cats));

      // Delete from R2 if exists
      if (photo.r2Key && env.PHOTOS_R2) {
        await env.PHOTOS_R2.delete(photo.r2Key).catch(() => {});
      }

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // POST /api/categories (create)
    if (path === '/api/categories' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.BOT_SECRET}`) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }
      const { name } = await request.json();
      let cats = await kv.get('categories', { type: 'json' }) || [];
      if (!cats.find(c => c.name === name)) {
        cats.push({ name, count: 0 });
        await kv.put('categories', JSON.stringify(cats));
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // POST /api/photos/upload (multipart file upload)
    if (path === '/api/photos/upload' && request.method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('file');
      const category = formData.get('category');
      
      if (!file || !category) {
        return new Response('Missing file or category', { status: 400, headers: corsHeaders });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      // Generate unique filename
      const ext = file.name.split('.').pop().toLowerCase();
      const filename = `${Date.now()}_${crypto.randomUUID().slice(0,8)}.${ext}`;
      const r2Key = `photos/${category}/${filename}`;

      // Store in R2
      if (env.PHOTOS_R2) {
        await env.PHOTOS_R2.put(r2Key, buffer, {
          httpMetadata: { contentType: file.type }
        });
      }

      // Save metadata in KV
      const photos = await kv.get('photos', { type: 'json' }) || [];
      const newPhoto = {
        id: crypto.randomUUID(),
        filename,
        category,
        url: `/images/${category}/${filename}`,
        r2Key,
        size: buffer.length,
        uploadedAt: Date.now(),
        uploadedBy: 'web'
      };
      photos.unshift(newPhoto);
      await kv.put('photos', JSON.stringify(photos));

      // Update category count
      const cats = await kv.get('categories', { type: 'json' }) || [];
      const catIdx = cats.findIndex(c => c.name === category);
      if (catIdx >= 0) {
        cats[catIdx].count = (cats[catIdx].count || 0) + 1;
      } else {
        cats.push({ name: category, count: 1 });
      }
      await kv.put('categories', JSON.stringify(cats));

      return Response.json({ success: true, photo: newPhoto }, { headers: corsHeaders });
    }

    // POST /api/photos/upload-url (download from URL)
    if (path === '/api/photos/upload-url' && request.method === 'POST') {
      const { url, category } = await request.json();
      
      if (!url || !category) {
        return new Response('Missing url or category', { status: 400, headers: corsHeaders });
      }

      // Validate URL
      if (!/^https?:\/\//.test(url)) {
        return new Response('Invalid URL', { status: 400, headers: corsHeaders });
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const ct = res.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) throw new Error('Not an image');
        
        const buffer = await res.arrayBuffer();
        const ext = ct.includes('png') ? 'png' : ct.includes('jpeg') ? 'jpg' : 
                    ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'png';
        const filename = `${Date.now()}_${crypto.randomUUID().slice(0,8)}.${ext}`;
        const r2Key = `photos/${category}/${filename}`;

        // Store in R2
        if (env.PHOTOS_R2) {
          await env.PHOTOS_R2.put(r2Key, new Uint8Array(buffer), {
            httpMetadata: { contentType: ct }
          });
        }

        // Save metadata in KV
        const photos = await kv.get('photos', { type: 'json' }) || [];
        const newPhoto = {
          id: crypto.randomUUID(),
          filename,
          category,
          url: `/images/${category}/${filename}`,
          r2Key,
          size: buffer.byteLength,
          uploadedAt: Date.now(),
          uploadedBy: 'web',
          sourceUrl: url
        };
        photos.unshift(newPhoto);
        await kv.put('photos', JSON.stringify(photos));

        // Update category count
        const cats = await kv.get('categories', { type: 'json' }) || [];
        const catIdx = cats.findIndex(c => c.name === category);
        if (catIdx >= 0) {
          cats[catIdx].count = (cats[catIdx].count || 0) + 1;
        } else {
          cats.push({ name: category, count: 1 });
        }
        await kv.put('categories', JSON.stringify(cats));

        return Response.json({ success: true, photo: newPhoto }, { headers: corsHeaders });
      } catch (e) {
        return new Response(`Download failed: ${e.message}`, { status: 400, headers: corsHeaders });
      }
    }

    // GET /images/:category/:filename (serve from R2)
    if (path.startsWith('/images/') && request.method === 'GET') {
      if (!env.PHOTOS_R2) return new Response('R2 not configured', { status: 500, headers: corsHeaders });
      const key = path.replace('/images/', 'photos/');
      const obj = await env.PHOTOS_R2.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders });
      return new Response(obj.body, {
        headers: { 
          'Content-Type': obj.httpMetadata?.contentType || 'image/png',
          'Cache-Control': 'public, max-age=31536000',
          ...corsHeaders 
        }
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};