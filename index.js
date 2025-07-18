const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use(cors());
app.use('/uploads', express.static('uploads')); // Yüklenen dosyaları göster

// Ana sayfa: upload.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// Türkçe karakterleri temizleyen fonksiyon
function sanitizeFilename(filename) {
  const map = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
    Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U'
  };
  return filename
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, c => map[c])
    .replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

// Multer ayarları
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, sanitized);
  }
});
const upload = multer({ storage });

// Fotoğraf yükleme endpoint'i
app.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).send('Dosya yüklenemedi');

  const fileUrl = `/uploads/${req.file.filename}`;
  res.send(`
    <h2>Fotoğraf başarıyla yüklendi!</h2>
    <p><a href="${fileUrl}" target="_blank">Fotoğrafı Görüntüle</a></p>
    <p><a href="/">Yeni fotoğraf yükle</a></p>
  `);
});

// Yüklenen dosyaları listele
app.get('/list', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).send('Dosyalar okunamadı');
    if (!files.length) return res.send('<h2>Hiç dosya yok</h2>');

    const list = files.map(file =>
      `<li><a href="/uploads/${file}" target="_blank">${file}</a></li>`
    ).join('');

    res.send(`<h2>Yüklenen Dosyalar</h2><ul>${list}</ul><p><a href="/">← Geri</a></p>`);
  });
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
