import sharp from 'sharp';
const src = 'public/icons/icon.svg';
await sharp(src, { density: 300 }).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(src, { density: 300 }).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(src, { density: 300 }).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
await sharp(src, { density: 300 }).resize(32, 32).png().toFile('public/icons/favicon-32.png');
await sharp(src, { density: 300 }).resize(96, 96).png().toFile('public/icons/icon-maskable-192.png');
console.log('icons ok');
