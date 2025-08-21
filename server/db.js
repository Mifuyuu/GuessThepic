const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');

// กำหนด path ของไฟล์ฐานข้อมูล SQLite
const storagePath = path.join(__dirname, '..', 'data', 'database.sqlite');

// สร้าง instance ของ Sequelize เพื่อเชื่อมต่อกับ SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath, // ระบุว่าจะเก็บ db ไว้ที่ไฟล์ไหน
    logging: false // ปิด log ของ SQL query ใน console (ถ้าต้องการดูให้เปิดเป็น console.log)
});

// --- 1. กำหนด Model 'User' ---
const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            len: [3, 12]
        },
        // SQLite: กำหนด collation เป็น BINARY เพื่อให้ case sensitive
        collate: 'BINARY'
    }
});


// --- 2. กำหนด Model 'Score' ---
const Score = sequelize.define('Score', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // ในที่นี้ username ควรมีแค่ score record เดียว
        references: {
            model: User, // สร้าง Foreign Key ไปที่ตาราง User
            key: 'username'
        }
    },
    score: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    correctStreak: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    mostStreak: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    gameStartTime: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    totalGameTime: {
        type: DataTypes.INTEGER, // เก็บเป็นวินาที
        defaultValue: 60 // 1 นาที
    }
});

// --- 3. สร้างความสัมพันธ์ระหว่างตาราง ---
// User หนึ่งคนมี Score ได้หนึ่งอัน
User.hasOne(Score, { foreignKey: 'username' });
// Score หนึ่งอันเป็นของ User หนึ่งคน
Score.belongsTo(User, { foreignKey: 'username' });


// --- 4. ฟังก์ชันสำหรับเชื่อมต่อและ Sync ตาราง ---
const connectDB = async () => {
    try {
        // .sync() จะสร้างตารางให้ตาม Model ที่เรา define ไว้ ถ้าตารางยังไม่มี
        // ใช้ force: false เพื่อคงข้อมูลเดิมไว้ (เปลี่ยนจาก true เป็น false)
        await sequelize.sync({ force: false }); 
        console.log('SQLite database connected and tables synced.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        process.exit(1);
    }
};

// --- 5. Export ทุกอย่างที่จำเป็น ---
module.exports = {
    sequelize,
    connectDB,
    User,
    Score,
    Op // Export 'Op' สำหรับใช้ใน query ที่ซับซ้อน (เช่น $gt, $lt)
};
