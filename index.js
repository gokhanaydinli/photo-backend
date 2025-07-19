const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const session = require('express-session');

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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session konfigürasyonu
app.use(session({
    secret: 'photo-gallery-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 saat
}));

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

// Resim optimizasyonu fonksiyonu
async function optimizeImage(inputPath, outputPath) {
    try {
        const metadata = await sharp(inputPath).metadata();
        
        // Kalite kaybetmeden optimizasyon
        await sharp(inputPath)
            .resize(1920, 1920, { 
                fit: 'inside', 
                withoutEnlargement: true 
            })
            .jpeg({ 
                quality: 90, 
                progressive: true,
                mozjpeg: true 
            })
            .toFile(outputPath);
        
        // Orjinal dosyayı sil
        fs.unlinkSync(inputPath);
        
        return true;
    } catch (error) {
        console.error('Resim optimizasyon hatası:', error);
        return false;
    }
}

// Multer ayarları
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const sanitized = sanitizeFilename(file.originalname);
        const nameWithoutExt = path.parse(sanitized).name;
        const finalName = `${nameWithoutExt}_optimized.jpg`;
        cb(null, finalName);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları kabul edilir!'), false);
        }
    }
});

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Login sayfası
app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Galeri Giriş</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .login-container {
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          padding: 40px;
          width: 100%;
          max-width: 400px;
          text-align: center;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 28px;
          font-weight: 700;
        }
        .subtitle {
          color: #666;
          margin-bottom: 30px;
          font-size: 16px;
        }
        .form-group {
          margin-bottom: 20px;
          text-align: left;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #333;
        }
        input[type="password"] {
          width: 100%;
          padding: 15px;
          border: 2px solid #e1e5e9;
          border-radius: 12px;
          font-size: 16px;
          transition: all 0.3s ease;
          background: #f8f9fa;
        }
        input[type="password"]:focus {
          outline: none;
          border-color: #4CAF50;
          background: white;
          box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
        }
        .login-btn {
          background: linear-gradient(45deg, #4CAF50, #45a049);
          color: white;
          padding: 16px 24px;
          border: none;
          border-radius: 12px;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
          width: 100%;
        }
        .login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }
        .back-btn {
          margin-top: 20px;
          background: rgba(255,255,255,0.2);
          color: white;
          padding: 12px 24px;
          border-radius: 20px;
          text-decoration: none;
          font-weight: 500;
          display: inline-block;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.3);
        }
        .back-btn:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-2px);
        }
        .error {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 1px solid #ef9a9a;
        }
        @media (max-width: 480px) {
          .login-container {
            padding: 30px 20px;
            margin: 10px;
          }
          h1 { font-size: 24px; }
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>🔒 Galeri Giriş</h1>
        <p class="subtitle">Galeriye erişmek için şifre gerekli</p>
        
        ${req.query.error ? '<div class="error">❌ Yanlış şifre! Tekrar deneyin.</div>' : ''}
        
        <form action="/login" method="POST">
          <div class="form-group">
            <label for="password">Şifre:</label>
            <input type="password" id="password" name="password" placeholder="Şifreyi girin" required autofocus>
          </div>
          <button type="submit" class="login-btn">🚀 Giriş Yap</button>
        </form>
        
        <a href="/" class="back-btn">← Ana Sayfaya Dön</a>
      </div>
    </body>
    </html>
    `);
});

// Login post işlemi
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === '5252') {
        req.session.authenticated = true;
        res.redirect('/list');
    } else {
        res.redirect('/login?error=1');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Ana sayfa: upload.html sunulacak
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'upload.html'));
});

// Upload işlemi
app.post('/upload', upload.array('photos', 20), async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).send('Dosya yüklenemedi');

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Resim optimizasyonu ve metadata kaydetme
    const processedFiles = [];
    for (const file of req.files) {
        const originalPath = file.path;
        const optimizedPath = originalPath.replace(path.extname(originalPath), '_opt.jpg');
        
        // Resmi optimize et
        const optimized = await optimizeImage(originalPath, optimizedPath);
        if (optimized) {
            // Optimize edilmiş dosya adını güncelle
            const optimizedFilename = path.basename(optimizedPath);
            saveMetadata(optimizedFilename, ip, userAgent);
            processedFiles.push({
                filename: optimizedFilename,
                originalName: file.originalname
            });
        } else {
            // Optimizasyon başarısızsa orjinal dosyayı kullan
            saveMetadata(file.filename, ip, userAgent);
            processedFiles.push({
                filename: file.filename,
                originalName: file.originalname
            });
        }
    }

    // Birden fazla fotoğraf için preview oluştur
    const photoCount = processedFiles.length;
    const photosHtml = processedFiles.map(file => {
        const fileUrl = `/uploads/${file.filename}`;
        const fullUrl = `${req.protocol}://${req.get('host')}${fileUrl}`;
        return `
            <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                <a href="${fullUrl}" target="_blank" style="color: #4CAF50; text-decoration: none; font-weight: bold;">${file.originalName}</a>
                <br><small style="color: #666;">Optimize edildi: ${file.filename}</small>
                <br><br>
                <img src="${fileUrl}" alt="Yüklenen Fotoğraf" style="max-width: 100%; border-radius: 6px;">
            </div>
        `;
    }).join('');

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
          max-width: 600px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .photos-container {
          margin-top: 20px;
          text-align: left;
        }
        a.button {
          display: inline-block;
          margin: 10px 5px;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          border-radius: 6px;
          text-decoration: none;
        }
        .button.secondary {
          background-color: #2196F3;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>${photoCount} fotoğraf başarıyla yüklendi ✅</h2>
        <div class="photos-container">
          ${photosHtml}
        </div>
        <a class="button" href="/">Yeni fotoğraf yükle</a>
        <a class="button secondary" href="/list">Tüm fotoğrafları gör</a>
      </div>
    </body>
    </html>
  `);
});

// Listeleme sayfası (Şifre korumalı)
app.get('/list', requireAuth, (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send('Dosyalar okunamadı');
        if (!files.length) return res.send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Fotoğraf Galerisi</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: white;
            max-width: 400px;
          }
          .empty-state h1 {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .empty-state h2 {
            font-size: 24px;
            margin-bottom: 15px;
            font-weight: 400;
          }
          .empty-state p {
            font-size: 16px;
            opacity: 0.8;
            margin-bottom: 30px;
            line-height: 1.5;
          }
          .button {
            background: rgba(255,255,255,0.2);
            color: white;
            padding: 15px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-size: 16px;
            font-weight: 500;
            display: inline-block;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.3);
          }
          .button:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="empty-state">
          <h1>📸</h1>
          <h2>Henüz fotoğraf yok</h2>
          <p>İlk fotoğrafınızı yükleyerek galerinizi oluşturmaya başlayın!</p>
          <a class="button" href="/">Fotoğraf Yükle</a>
        </div>
      </body>
      </html>
    `);

        let meta = [];
        if (fs.existsSync(metaFilePath)) {
            meta = JSON.parse(fs.readFileSync(metaFilePath));
        }

        const list = files.map(file => {
            const fileMeta = meta.find(m => m.filename === file);
            const fileStats = fs.statSync(path.join(uploadDir, file));
            const fileSize = (fileStats.size / 1024).toFixed(1) + ' KB';
            
            const info = fileMeta ? {
                userAgent: fileMeta.userAgent.includes('Mobile') ? '📱 Mobil' : '💻 Masaüstü',
                ip: fileMeta.ip === '::1' ? 'Yerel' : fileMeta.ip.substring(0, 10) + '...',
                timestamp: new Date(fileMeta.timestamp).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            } : null;

            return `
        <div class="photo-card">
          <div class="photo-container">
            <img src="/uploads/${file}" alt="${file}" loading="lazy">
          </div>
          <div class="photo-info">
            <div class="photo-name">${file.replace('_optimized', '').replace('_opt', '')}</div>
            <div class="photo-meta">
              ${info ? `
                <div>📅 ${info.timestamp}</div>
                <div>🌐 ${info.userAgent}</div>
                <div>📊 ${fileSize}</div>
              ` : '<div>📊 ' + fileSize + '</div>'}
            </div>
            <a class="download-btn" href="/uploads/${file}" download>
              ⬇️ İndir
            </a>
          </div>
        </div>
      `;
        }).join('');

        res.send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Fotoğraf Galerisi</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
          }
          .header {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            padding: 15px;
            text-align: center;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 20px rgba(0,0,0,0.1);
          }
          h1 {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 24px;
            font-weight: 600;
          }
          .count {
            background: #4CAF50;
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
          }
          .top-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 15px;
          }
          .button {
            padding: 12px 20px;
            border-radius: 25px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
          }
                     .btn-primary { background: #2196F3; color: white; }
           .btn-success { background: #4CAF50; color: white; }
           .btn-danger { background: #f44336; color: white; }
           .btn-secondary { background: #6c757d; color: white; }
          .button:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
          
          .gallery {
            padding: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
            max-width: 1200px;
            margin: 0 auto;
          }
          
          .photo-card {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            transition: all 0.3s ease;
            position: relative;
          }
          .photo-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.2);
          }
          
          .photo-container {
            position: relative;
            overflow: hidden;
            aspect-ratio: 1;
            background: #f8f9fa;
          }
          .photo-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s ease;
          }
          .photo-card:hover .photo-container img {
            transform: scale(1.05);
          }
          
          .photo-info {
            padding: 15px;
          }
          .photo-name {
            font-weight: 600;
            color: #333;
            font-size: 16px;
            margin-bottom: 8px;
            word-break: break-word;
          }
          .photo-meta {
            font-size: 12px;
            color: #666;
            line-height: 1.4;
            margin-bottom: 12px;
          }
          .photo-meta div {
            margin-bottom: 4px;
          }
          
          .download-btn {
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.3s ease;
            width: 100%;
            justify-content: center;
          }
          .download-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          }
          
          /* Mobile Optimizations */
          @media (max-width: 768px) {
            .gallery {
              grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
              gap: 15px;
              padding: 15px;
            }
            .header { padding: 12px; }
            h1 { font-size: 20px; }
            .button { padding: 10px 16px; font-size: 13px; }
            .photo-info { padding: 12px; }
            .photo-name { font-size: 14px; }
            .photo-meta { font-size: 11px; }
          }
          
          @media (max-width: 480px) {
            .gallery {
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              padding: 12px;
            }
            .top-buttons { gap: 8px; }
            .button { padding: 8px 12px; }
          }
          
          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: white;
          }
          .empty-state h2 {
            font-size: 24px;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📸 Fotoğraf Galerisi</h1>
          <span class="count">${files.length} fotoğraf</span>
          <div class="top-buttons">
            <a class="button btn-primary" href="/">← Ana Sayfa</a>
            <a class="button btn-success" href="/zip-all" download>📦 Tümünü İndir</a>
            <a class="button btn-danger" href="/delete-all">🗑️ Tümünü Sil</a>
            <a class="button btn-secondary" href="/logout">🔓 Çıkış</a>
          </div>
        </div>
        <div class="gallery">
          ${list}
        </div>
      </body>
      </html>
    `);
    });
});

// Zip indir (Şifre korumalı)
app.get('/zip-all', requireAuth, (req, res) => {
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

// Tümünü sil (Şifre korumalı)
app.get('/delete-all', requireAuth, (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send('Dosyalar silinemedi');

        for (const file of files) {
            fs.unlinkSync(path.join(uploadDir, file));
        }

        fs.writeFileSync(metaFilePath, '[]');

        res.redirect('/');
    });
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});