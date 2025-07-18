const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = 'uploads';
const metaFilePath = path.join(__dirname, 'metadata.json');

// Klasör ve metadata dosyası kontrolü
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(metaFilePath)) {
    fs.writeFileSync(metaFilePath, '[]');
}

app.use(cors());
app.use('/uploads', express.static('uploads'));

// Türkçe karakterleri temizle
function sanitizeFilename(filename) {
    const map = {
        ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
        Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U'
    };
    return filename
        .replace(/[çğıöşüÇĞİÖŞÜ]/g, c => map[c])
        .replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

// Metadata kaydet
function saveMetadata(filename, ip, userAgent) {
    let data = [];
    if (fs.existsSync(metaFilePath)) {
        data = JSON.parse(fs.readFileSync(metaFilePath));
    }
    data.push({
        filename,
        ip,
        userAgent,
        timestamp: new Date().toISOString()
    });
    fs.writeFileSync(metaFilePath, JSON.stringify(data, null, 2));
}

// Multer ayarları
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const sanitized = sanitizeFilename(file.originalname);
        cb(null, sanitized);
    }
});
const upload = multer({storage});

// Ana sayfa: upload.html sunulacak
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'upload.html'));
});

// Upload işlemi
app.post('/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).send('Dosya yüklenemedi');

    const fileUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get('host')}${fileUrl}`;

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    saveMetadata(req.file.filename, ip, userAgent);

    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Yükleme Başarılı</title>
      <style>
        body {
          font-family: sans-serif;
          background: #f0f0f0;
          padding: 20px;
          text-align: center;
        }
        .box {
          background: white;
          padding: 20px;
          border-radius: 10px;
          display: inline-block;
          max-width: 400px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        img {
          max-width: 100%;
          border-radius: 8px;
          margin-top: 15px;
        }
        a.button {
          display: inline-block;
          margin-top: 20px;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          border-radius: 6px;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>Fotoğraf başarıyla yüklendi ✅</h2>
        <a href="${fullUrl}" target="_blank">${req.file.filename}</a>
        <br>
        <img src="${fileUrl}" alt="Yüklenen Fotoğraf">
        <br>
        <a class="button" href="/">Yeni fotoğraf yükle</a>
        <!--<a class="button" href="/list">Yüklenenleri Gör</a>-->
      </div>
    </body>
    </html>
  `);
});

// Listeleme sayfası
app.get('/list', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send('Dosyalar okunamadı');
        if (!files.length) return res.send('<h2>Hiç dosya yüklenmemiş</h2>');

        let meta = [];
        if (fs.existsSync(metaFilePath)) {
            meta = JSON.parse(fs.readFileSync(metaFilePath));
        }

        const list = files.map(file => {
            const fileMeta = meta.find(m => m.filename === file);
            const info = fileMeta
                ? `<div class="info"><small>${fileMeta.userAgent}<br>${fileMeta.ip}<br>${new Date(fileMeta.timestamp).toLocaleString()}</small></div>`
                : `<div class="info"><small>Bilgi yok</small></div>`;

            return `
        <div class="item">
          <img src="/uploads/${file}" alt="${file}" loading="lazy">
          ${info}
          <a class="button" href="/uploads/${file}" download>İndir</a>
        </div>
      `;
        }).join('');

        res.send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Yüklenen Fotoğraflar</title>
        <style>
          body {
            font-family: sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
            text-align: center;
          }
          h2 { margin-bottom: 10px; }
          .top-buttons { margin-bottom: 20px; }
          .button {
            display: inline-block;
            padding: 10px 16px;
            margin: 4px;
            background-color: #2196F3;
            color: white;
            border-radius: 6px;
            text-decoration: none;
            font-size: 14px;
          }
          .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
          }
          .item {
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
            word-wrap: break-word;
            width: 100%;
            box-sizing: border-box;
            max-width: 450px;
          }
          img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin-bottom: 6px;
          }
          .info {
            font-size: 11px;
            color: #666;
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        <h2>Yüklenen Fotoğraflar</h2>
        <div class="top-buttons">
          <a class="button" href="/">← Geri</a>
          <a class="button" href="/zip-all" download>Tümünü İndir (.zip)</a>
          <a class="button" href="/delete-all" style="background-color:#e53935">Tümünü Sil 🗑️</a>
        </div>
        <div class="gallery">
          ${list}
        </div>
      </body>
      </html>
    `);
    });
});

// Zip indir
app.get('/zip-all', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err || files.length === 0) return res.status(404).send('Dosya bulunamadı');

        const zip = new AdmZip();
        files.forEach(file => {
            const filepath = path.join(uploadDir, file);
            zip.addLocalFile(filepath);
        });

        const data = zip.toBuffer();
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', 'attachment; filename="tum-fotograflar.zip"');
        res.send(data);
    });
});

// Tümünü sil
app.get('/delete-all', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send('Dosyalar silinemedi');

        for (const file of files) {
            fs.unlinkSync(path.join(uploadDir, file));
        }

        fs.writeFileSync(metaFilePath, '[]');

        res.send(`
      <h2>Tüm fotoğraflar ve bilgiler silindi ✅</h2>
      <a href="/list">← Listeye Dön</a>
    `);
    });
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});