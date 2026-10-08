require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_OUT_DIR = path.join(PUBLIC_DIR, 'data');
const DATA_DIR = path.join(__dirname, 'photo_data');

function loadCategories() {
  const file = path.join(DATA_DIR, 'categories.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return {};
}

function generateDataFiles() {
  const categories = loadCategories();
  
  const catsArray = Object.entries(categories).map(([name, data]) => ({
    name,
    count: data.photos?.length || 0,
    createdAt: data.createdAt
  }));
  
  fs.writeFileSync(
    path.join(DATA_OUT_DIR, 'categories.js'),
    `// Auto-generated - ${new Date().toISOString()}\nwindow.CATEGORIES = ${JSON.stringify(catsArray, null, 2)};`
  );

  const photosArray = [];
  for (const [catName, data] of Object.entries(categories)) {
    if (!data.photos) continue;
    const catDir = path.join(DATA_DIR, catName);
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

  console.log(`Generated: ${catsArray.length} categories, ${photosArray.length} photos`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--data-only')) {
    generateDataFiles();
    return;
  }

  generateDataFiles();

  console.log('\n=== Deploying to Cloudflare Pages ===');
  try {
    execSync(`npx wrangler pages deploy ${PUBLIC_DIR} --project-name=${process.env.PAGES_PROJECT || 'dostluk-panel'}`, {
      stdio: 'inherit',
      env: { ...process.env }
    });
    console.log('Pages deploy done!\n');
  } catch (e) {
    console.error('Pages deploy failed:', e.message);
  }

  console.log('=== Deploying Worker ===');
  try {
    execSync('npx wrangler deploy', {
      stdio: 'inherit',
      env: { ...process.env }
    });
    console.log('Worker deploy done!\n');
  } catch (e) {
    console.error('Worker deploy failed:', e.message);
  }
}

main();