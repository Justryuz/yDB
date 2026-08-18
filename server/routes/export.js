/**
 * @file routes/export.js
 * @description Export query results as CSV/JSON/Excel.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

/**
 * POST /api/export/csv
 * Body: { columns, data, filename }
 */
router.post('/csv', (req, res) => {
    const { columns, data, filename } = req.body;
    if (!columns || !data) return res.status(400).json({ error: 'columns and data required' });

    let csv = columns.join(',') + '\n';
    data.forEach(row => {
        csv += columns.map(c => {
            let v = row[c];
            if (v == null) return '';
            v = String(v);
            if (/[,"\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
            return v;
        }).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export'}.csv"`);
    res.send(csv);
});

/**
 * POST /api/export/json
 * Body: { data, filename }
 */
router.post('/json', (req, res) => {
    const { data, filename } = req.body;
    if (!data) return res.status(400).json({ error: 'data required' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export'}.json"`);
    res.send(JSON.stringify(data, null, 2));
});

module.exports = router;
