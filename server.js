const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('./models/Admin');

const app = express();
const Product = require('./models/Product');

const JWT_SECRET = process.env.JWT_SECRET || 'stepup_admin_secret_key_change_in_production';

// 中間件配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 添加啟動日誌
console.log('🚀 StepUp Backend Starting...');
console.log('📦 Node Version:', process.version);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

// 測試路由 - 不依賴數據庫
app.get('/test', (req, res) => {
    res.json({ 
        message: 'Server is working!',
        timestamp: new Date().toISOString()
    });
});

// 健康檢查路由 - 顯示數據庫狀態
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusText = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    }[dbStatus] || 'unknown';
    
    res.status(200).json({ 
        status: 'OK',
        message: 'Server is running',
        database: dbStatusText,
        timestamp: new Date().toISOString()
    });
});

// 根路由
app.get('/', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    res.json({
        name: "StepUp Backend API",
        version: "1.0.0",
        description: "Product Management API",
        status: "running",
        database: dbStatus === 1 ? "connected" : "disconnected",
        endpoints: {
            test: "/test",
            health: "/health",
            products: {
                getAll: "GET /api/products",
                create: "POST /api/products",
                getById: "GET /api/products/:id",
                update: "PUT /api/products/:id",
                delete: "DELETE /api/products/:id"
            }
        },
        timestamp: new Date().toISOString()
    });
});

// ============ Admin Authentication Routes ============

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const token = jwt.sign(
            { id: admin._id, username: admin.username, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        res.json({
            success: true,
            token,
            user: { username: admin.username }
        });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/verify', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        if (!admin) {
            return res.status(401).json({ error: 'Admin not found' });
        }
        res.json({ success: true, user: { username: admin.username } });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// 獲取單個產品
app.get('/api/products/:id', async (req, res) => {
    try {
        // 檢查數據庫連接
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json(product);
    } catch (err) {
        console.error("❌ Fetch Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 創建產品
app.post('/api/products', async (req, res) => {
    try {
        // 檢查數據庫連接
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        
        console.log("📦 Data received:", req.body);
        
        const requiredFields = ['productName', 'brand', 'category', 'price'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: `Missing required fields: ${missingFields.join(', ')}` 
            });
        }
        
        const newProduct = new Product(req.body);
        await newProduct.save();
        
        console.log("✅ Product saved:", newProduct._id);
        res.status(201).json({ 
            message: "Product saved successfully!",
            product: newProduct 
        });
    } catch (err) {
        console.error("❌ Save Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

// 獲取所有產品
app.get('/api/products', async (req, res) => {
    try {
        // 檢查數據庫連接
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        console.error("❌ Fetch Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 更新產品
app.put('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json({ 
            message: "Product updated successfully",
            product 
        });
    } catch (err) {
        console.error("❌ Update Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

// 刪除產品
app.delete('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json({ 
            message: "Product deleted successfully",
            product 
        });
    } catch (err) {
        console.error("❌ Delete Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============ 重要修改：先啟動服務器，再嘗試連接數據庫 ============

// 1. 先啟動服務器（無論數據庫是否連接）
const port = process.env.PORT || 5000;

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${port}`);
    console.log(`📍 Local: http://localhost:${port}`);
    console.log(`📊 Health: http://localhost:${port}/health`);
    console.log(`📝 API: http://localhost:${port}/api/products`);
    console.log(`🧪 Test: http://localhost:${port}/test`);
});

// 2. 然後嘗試連接數據庫（不影響服務器運行）
const dbURI = process.env.MONGO_URI;

if (!dbURI) {
    console.error('⚠️  WARNING: MONGO_URI is not defined in environment variables');
    console.log('💡 Database features will not work until MONGO_URI is set');
    console.log('   Set it in Render Environment section');
} else {
    console.log('🔄 Connecting to MongoDB...');
    console.log('📝 Connection string starts with:', dbURI.substring(0, 30) + '...');
    
    mongoose.connect(dbURI)
    .then(async () => {
        console.log('✅ Connected to StepUp Database');
        
        // Create default admin if none exists
        const adminCount = await Admin.countDocuments();
        if (adminCount === 0) {
            const defaultAdmin = new Admin({
                username: 'admin',
                password: 'admin123' // This will be hashed automatically
            });
            await defaultAdmin.save();
            console.log('✅ Default admin created: username = admin, password = admin123');
        }
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
    });

// 優雅關閉
process.on('SIGINT', async () => {
    console.log('👋 Shutting down...');
    server.close(async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('✅ MongoDB connection closed');
        }
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('👋 Shutting down...');
    server.close(async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('✅ MongoDB connection closed');
        }
        process.exit(0);
    });
});