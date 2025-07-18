const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use('/uploads', express.static('uploads'));


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});


const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Türkçe karakterleri temizleyen fonksiyon
function sanitizeFilename(filename) {
  const map = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
    Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U'
  };
  return filename
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, c => map[c])
    .replace(/[^a-zA-Z0-9.\-_]/g, '_'); // özel karakterleri de alt çizgiye çevir
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const originalName = file.originalname;
    const sanitized = sanitizeFilename(originalName);
    cb(null, sanitized);
  }
});

const upload = multer({ storage });


app.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).send('Dosya yüklenemedi');
  res.send('Fotoğraf başarıyla yüklendi');
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
