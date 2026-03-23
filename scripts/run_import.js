const mongoose = require('mongoose');
const { importUsersFromExcel } = require('../utils/importService');
const roleModel = require('../schemas/roles');
const path = require('path');

async function run() {
    try {
        console.log("--- STARTING IMPORT SCRIPT ---");
        
        // 1. Kết nối Database
        await mongoose.connect('mongodb://localhost:27017/NNPTUD-C2');
        console.log("√ Connected to MongoDB");

        // 2. Tự động kiểm tra và tạo Role "user" nếu chưa có
        let userRole = await roleModel.findOne({ name: { $regex: /^user$/i } });
        if (!userRole) {
            console.log("! Role 'user' not found. Creating it now...");
            userRole = await roleModel.create({ 
                name: 'user', 
                description: 'Default user role created by import script' 
            });
            console.log("√ Role 'user' created successfully.");
        } else {
            console.log("√ Role 'user' already exists.");
        }

        // 3. Thực hiện Import
        console.log("... Parsing user.xlsx and importing users ...");
        const filePath = path.join(__dirname, '../uploads/user.xlsx');
        const summary = await importUsersFromExcel(filePath);

        // 4. Hiển thị kết quả
        console.log("\n--- IMPORT SUMMARY ---");
        if (summary.results.length > 0) {
            console.log("SUCCESSFUL IMPORTS:");
            summary.results.forEach(u => console.log(` - ${u.username} (${u.email}) [${u.status}]`));
        }
        
        if (summary.errors.length > 0) {
            console.log("\nERRORS:");
            summary.errors.forEach(e => console.log(` - ${e.username}: ${e.error}`));
        }

        console.log("\n√ DONE! Go to your Mailtrap dashboard and click on 'Email' tab to see results.");
        
        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("\nCRITICAL ERROR:", error.message);
        if (mongoose.connection.readyState !== 0) {
            mongoose.connection.close();
        }
        process.exit(1);
    }
}

run();
