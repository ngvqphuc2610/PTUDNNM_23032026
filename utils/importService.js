const ExcelJS = require('exceljs');
const crypto = require('crypto');
const userModel = require('../schemas/users');
const roleModel = require('../schemas/roles');
const cartModel = require('../schemas/cart');
const userController = require('../controllers/users');
const { sendPasswordMail } = require('./sendMailHandler');
const mongoose = require('mongoose');
const path = require('path');

async function importUsersFromExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile(filePath);
    } catch (err) {
        throw new Error(`Could not read Excel file: ${err.message}`);
    }

    const worksheet = workbook.getWorksheet(1); 
    if (!worksheet) {
        throw new Error('No worksheets found in Excel file');
    }

    const results = [];
    const errors = [];

    // Find the "user" role (case-insensitive)
    const userRole = await roleModel.findOne({ name: { $regex: /^user$/i } });
    if (!userRole) {
        throw new Error('Role "user" not found in database. Please ensure it exists.');
    }

    // Process rows (skipping header row 1)
    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const usernameCell = row.getCell(1).value;
        const emailCell = row.getCell(2).value;

        // Extract value if it's an object (sometimes ExcelJS returns {text, hyperlink} or {result})
        const username = usernameCell && typeof usernameCell === 'object' ? usernameCell.text || usernameCell.result : usernameCell;
        const email = emailCell && typeof emailCell === 'object' ? emailCell.text || emailCell.result : emailCell;

        if (!username || !email) {
            console.log(`Skipping empty row ${i}`);
            continue;
        }

        const cleanUsername = String(username).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        // Generate 16-character random password
        const password = crypto.randomBytes(8).toString('hex'); 

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Check if user already exists
            const existingUser = await userModel.findOne({ 
                $or: [{ username: cleanUsername }, { email: cleanEmail }] 
            });
            
            if (existingUser) {
                results.push({ username: cleanUsername, email: cleanEmail, status: 'skipped', reason: 'User already exists' });
                await session.abortTransaction();
                session.endSession();
                continue;
            }

            const newUser = await userController.CreateAnUser(
                cleanUsername,
                password,
                cleanEmail,
                userRole._id,
                session
            );

            const newCart = new cartModel({
                user: newUser._id
            });
            await newCart.save({ session });

            await session.commitTransaction();
            session.endSession();

            // Send email after successful DB transaction
            try {
                await sendPasswordMail(cleanEmail, cleanUsername, password);
                results.push({ username: cleanUsername, email: cleanEmail, status: 'success' });
            } catch (mailErr) {
                console.error(`User created but email failed for ${cleanEmail}:`, mailErr.message);
                results.push({ username: cleanUsername, email: cleanEmail, status: 'success_no_mail', reason: mailErr.message });
            }

        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            session.endSession();
            console.error(`Error importing user ${cleanUsername}:`, error.message);
            errors.push({ username: cleanUsername, email: cleanEmail, error: error.message });
        }
    }

    return { results, errors };
}

module.exports = { importUsersFromExcel };
