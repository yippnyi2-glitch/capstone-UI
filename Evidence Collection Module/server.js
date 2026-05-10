const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 13000;

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS evidence (
            id TEXT PRIMARY KEY,
            image_url TEXT,
            is_deepfake BOOLEAN,
            is_deleted BOOLEAN DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error("Error creating table", err.message);
                return;
            }
            // Seed initial data if empty
            db.get("SELECT COUNT(*) AS count FROM evidence", (err, row) => {
                if (row.count === 0) {
                    const insert = 'INSERT INTO evidence (id, image_url, is_deepfake) VALUES (?, ?, ?)';
                    const initialData = [
                        ["#EVID-001", "https://i.pravatar.cc/300?u=1", 1],
                        ["#EVID-002", "https://i.pravatar.cc/300?u=2", 1],
                        ["#EVID-003", "https://i.pravatar.cc/300?u=3", 1]
                    ];
                    initialData.forEach(item => {
                        db.run(insert, item);
                    });
                    console.log("Database seeded with initial evidence data.");
                }
            });
        });
    }
});

// API Endpoint to get all evidence (that is not deleted)
app.get('/api/evidence', (req, res) => {
    db.all("SELECT * FROM evidence WHERE is_deleted = 0", [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

// API Endpoint to request deletion of selected evidence (Removed per user request)

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
