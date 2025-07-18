const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = 'uploads';
const metaFilePath = path.join(__dirname, 'metadata.json');

// 🔐 Firebase ayarları
const firebaseKey = require('./firebase-config.json'); // Bu dosya dizinde olmalı

admin.initializeApp({
  credential: admin.credential.cert(firebaseKey),
  storageBucket: 'photo-cloud-91902.appspot.com' // BU TAM DOĞRU OLMALI
});
const bucket = admin.storage().bucket();

// 📁 Gerekli klasör ve metadata dosyası oluşturulmamışsa oluştur
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(metaFilePath)) fs.writeFileSync(metaFilePath, '[]');

app.use(cors());
app.use('/uploads', express.static(uploadDir));

// 🔤 Türkçe karakter temizleyici
function sanitizeFilename(filename) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
  return filename.replace(/[çğıöşüÇĞİÖŞÜ]/g, c => map[c]).replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

// 🧠 Metadata kaydet
function saveMetadata(filename, ip, userAgent, firebaseUrl) {
  let data = [];
  if (fs.existsSync(metaFilePath)) {
    data = JSON.parse(fs.readFileSync(metaFilePath));
  }
  data.push({
    filename,
    ip,
    userAgent,
    firebaseUrl,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(metaFilePath, JSON.stringify(data, null, 2));
}

// 📥 Multer ayarı
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, sanitizeFilename(file.originalname))
});
const upload = multer({ storage });

// 📄 Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// 🚀 Upload route
app.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).send('Dosya yüklenemedi');

  const fileUrl = `/uploads/${req.file.filename}`;
  const fullUrl = `${req.protocol}://${req.get('host')}${fileUrl}`;
  const localPath = path.join(uploadDir, req.file.filename);
  const destination = `photos/${req.file.filename}`;

  // ☁️ Firebase'e yedekle
  await bucket.upload(localPath, {
    destination,
    public: true,
    metadata: {
      cacheControl: 'public,max-age=31536000',
    }
  });

  const firebaseUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  saveMetadata(req.file.filename, ip, userAgent, firebaseUrl);

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Yükleme Başarılı</title>
    </head>
    <body style="text-align:center; font-family:sans-serif;">
      <h2>✅ Fotoğraf başarıyla yüklendi</h2>
      <p><a href="${fullUrl}" target="_blank">${req.file.filename}</a></p>
      <img src="${fileUrl}" alt="Yüklenen Fotoğraf" style="max-width:300px;">
      <br><br>
      <a href="/">Yeni fotoğraf yükle</a> |
      <a href="/list">Yüklenenleri Gör</a>
    </body>
    </html>
  `);
});

// 📄 Listeleme
app.get('/list', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).send('Dosyalar okunamadı');

    const meta = fs.existsSync(metaFilePath) ? JSON.parse(fs.readFileSync(metaFilePath)) : [];

    const list = files.map(file => {
      const m = meta.find(entry => entry.filename === file);
      const info = m
        ? `<div><small>${m.userAgent}<br>${m.ip}<br>${new Date(m.timestamp).toLocaleString()}</small><br>
           <a href="${m.firebaseUrl}" target="_blank">🌐 Firebase Link</a></div>`
        : `<div><small>Bilgi yok</small></div>`;

      return `
        <div class="item">
          <img src="/uploads/${file}" style="max-width:100%;">
          ${info}
          <a class="button" href="/uploads/${file}" download>İndir</a>
        </div>`;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Yüklenen Fotoğraflar</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 20px; }
          .button {
            padding: 6px 12px; margin: 6px;
            background: #2196F3; color: white; border-radius: 4px; text-decoration: none;
          }
          .gallery { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
          .item { background: #fff; padding: 10px; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); width: 220px; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <h2>📷 Yüklenen Fotoğraflar</h2>
        <div>
          <a class="button" href="/">← Geri</a>
          <a class="button" href="/zip-all" download>.zip indir</a>
          <a class="button" href="/delete-all" style="background:#e53935">🗑️ Tümünü Sil</a>
        </div>
        <div class="gallery">${list}</div>
      </body>
      </html>
    `);
  });
});

// 📦 ZIP indir
app.get('/zip-all', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err || files.length === 0) return res.status(404).send('Dosya yok');

    const zip = new AdmZip();
    files.forEach(f => zip.addLocalFile(path.join(uploadDir, f)));

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="tum-fotolar.zip"');
    res.send(zip.toBuffer());
  });
});

// 🧹 Hepsini sil
app.get('/delete-all', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).send('Silinemedi');
    files.forEach(f => fs.unlinkSync(path.join(uploadDir, f)));
    fs.writeFileSync(metaFilePath, '[]');

    res.send(`<h3>🧹 Tüm dosyalar silindi.</h3><a href="/list">← Listeye Dön</a>`);
  });
});

// 🔥 Başlat
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda çalışıyor`);
});
