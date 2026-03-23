const express = require('express');
const router = express.Router();
const { importUsersFromExcel } = require('../utils/importService');
const path = require('path');

router.post('/users', async (req, res) => {
    try {
        const filePath = path.join(__dirname, '../user.xlsx');
        const result = await importUsersFromExcel(filePath);
        res.status(200).json({
            message: 'Import process completed',
            data: result
        });
    } catch (error) {
        console.error('Import error:', error.message);
        res.status(500).json({
            message: 'Import failed',
            error: error.message
        });
    }
});

module.exports = router;
