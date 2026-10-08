const fs = require('fs');
const path = require('path');

const dirs = ['public/data', 'photo_data'];
dirs.forEach(d => {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    console.log('Created:', p);
  } else {
    console.log('Exists:', p);
  }
});