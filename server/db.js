const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const bcrypt = require('bcrypt');

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
            len: [3, 12] // ตรวจสอบความยาวเหมือนเดิม
        }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    // Sequelize Hooks (ทำงานคล้าย Mongoose middleware)
    hooks: {
        // ก่อนที่จะสร้าง user ใหม่ (Create)
        beforeCreate: async (user) => {
            if (user.password) {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(user.password, salt);
            }
        },
        // ก่อนที่จะอัปเดต user (Update)
        beforeUpdate: async(user) => {
            // เช็คว่า field 'password' มีการเปลี่ยนแปลงหรือไม่
            if (user.changed('password')) {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(user.password, salt);
            }
        }
    }
});

// เพิ่ม method สำหรับเปรียบเทียบรหัสผ่านเข้าไปใน Model
User.prototype.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};


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
        await sequelize.sync({ force: false }); // force: true จะลบตารางเก่าทิ้งทั้งหมด (ใช้ตอน dev)
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
