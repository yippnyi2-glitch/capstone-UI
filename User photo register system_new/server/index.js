const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const { run, get, all } = require('./db')

const app = express()
const PORT = 13001
const IMAGES_DIR = path.join(__dirname, 'images')

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Serve saved images statically
app.use('/images', express.static(IMAGES_DIR))

// ── Helper: base64 Data URL → file ───────────────────────────────
function saveBase64Image(dataUrl, filePath) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buffer)
}

// ── Helper: Trigger FastAPI extraction (Fire-and-forget) ─────────
function triggerVectorExtraction(userId, record) {
  const BE_URL = 'http://localhost:8080/extract';
  const baseDir = __dirname;

  const items = [
    { key: 'front' },
    { key: 'left45' },
    { key: 'right45' },
    { key: 'left90' },
    { key: 'right90' }
  ];

  for (const item of items) {
    if (record[item.key]) {
      // Create absolute path for the Python API
      const absPath = path.join(baseDir, record[item.key].replace('./', ''));

      let image_type = '';
      if (item.key === 'front') image_type = 'front';
      else if (item.key === 'left45' || item.key === 'right45') image_type = 'side_45';
      else if (item.key === 'left90' || item.key === 'right90') image_type = 'side_90';

      const payload = {
        image_path: absPath,
        image_type: image_type,
        user_id: userId
      };

      // Fire-and-forget fetch (No await, no retry)
      fetch(BE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(async res => {
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Vector Extract] Failed for ${userId} (${item.key}): ${res.status} - ${errText}`);
        } else {
          console.log(`[Vector Extract] Success for ${userId} (${item.key})`);
        }
      }).catch(err => {
        console.error(`[Vector Extract] Connection Error for ${userId} (${item.key}) - No retry planned:`, err.message);
      });
    }
  }
}

// ── POST /api/register ───────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { user_id, mode, images } = req.body

    // 모드별 유효성 검사 차이 (오직 new 모드만 지원됨)
    if (!user_id || !images) {
      return res.status(400).json({ error: 'user_id and images are required' })
    }

    if (mode === 'new') {
      if (!images.front || !images.left45 || !images.right45 || !images.left90 || !images.right90) {
        return res.status(400).json({ error: 'Registration requires all 5 images (front, left45, right45, left90, right90)' })
      }
    } else {
      return res.status(400).json({ error: 'Invalid mode (only new is supported)' })
    }

    // Save image files to /server/images/{user_id}/
    const userDir = path.join(IMAGES_DIR, user_id)
    const record = {}

    if (images.front) {
      const frontPath = path.join(userDir, 'front.jpg')
      saveBase64Image(images.front, frontPath)
      record.front = `./images/${user_id}/front.jpg`
    }
    if (images.left45) {
      const left45Path = path.join(userDir, 'left45.jpg')
      saveBase64Image(images.left45, left45Path)
      record.left45 = `./images/${user_id}/left45.jpg`
    }
    if (images.right45) {
      const right45Path = path.join(userDir, 'right45.jpg')
      saveBase64Image(images.right45, right45Path)
      record.right45 = `./images/${user_id}/right45.jpg`
    }
    if (images.left90) {
      const left90Path = path.join(userDir, 'left90.jpg')
      saveBase64Image(images.left90, left90Path)
      record.left90 = `./images/${user_id}/left90.jpg`
    }
    if (images.right90) {
      const right90Path = path.join(userDir, 'right90.jpg')
      saveBase64Image(images.right90, right90Path)
      record.right90 = `./images/${user_id}/right90.jpg`
    }

    // 신규 등록이거나 기존 데이터가 없을 때 INSERT (mode === 'new')
    await run(
      'INSERT INTO users (user_id, image_front, image_left45, image_right45, image_left90, image_right90) VALUES (?,?,?,?,?,?)',
      [user_id, record.front || null, record.left45 || null, record.right45 || null, record.left90 || null, record.right90 || null]
    )

    // [Fire-and-forget] Trigger Vector Extraction in background
    triggerVectorExtraction(user_id, record);

    res.json({
      success: true,
      user_id,
      paths: [record.front || null, record.left45 || null, record.right45 || null, record.left90 || null, record.right90 || null]
    })
  } catch (err) {
    console.error('[register error]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/check_user_id ───────────────────────────────────────
app.get('/api/check_user_id', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id parameter is required' });
    const existing = await get('SELECT id FROM users WHERE user_id = ? LIMIT 1', [id]);
    res.json({ exists: !!existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

// ── GET /api/users ───────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const users = await all('SELECT * FROM users ORDER BY id DESC')
    res.json(users)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`)
  console.log(`📁 Images saved to: ${IMAGES_DIR}`)
  console.log(`🗄️  DB: ${path.join(__dirname, 'capstone.db')}\n`)
})
