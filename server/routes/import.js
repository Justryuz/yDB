/**
 * @file routes/import.js
 * @description Import CSV/JSON data into a database table.
 */

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /api/import/parse
 * Upload a file and parse it to preview data.
 */
router.post('/parse', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const content = req.file.buffer.toString('utf-8');
        let columns = [];
        let data = [];

        if (ext === 'csv') {
            const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
            if (records.length) {
                columns = Object.keys(records[0]);
                data = records;
            }
        } else if (ext === 'json') {
            const parsed = JSON.parse(content);
            data = Array.isArray(parsed) ? parsed : [parsed];
            if (data.length) columns = Object.keys(data[0]);
        } else {
            return res.status(400).json({ error: 'Unsupported format. Use CSV or JSON.' });
        }

        res.json({
            filename: req.file.originalname,
            columns,
            data: data.slice(0, 100), // Preview first 100 rows
            totalRows: data.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
