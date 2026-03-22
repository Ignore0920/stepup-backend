const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const Product = require('./models/Product');

// 中間件配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 健康檢查路由
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// 根路由
app.get('/', (req, res) => {
    res.json({
        name: "StepUp Backend API",
        version: "1.0.0",
        description: "Product Management API",
        endpoints: {
            health: "/health",
            products: {
                getAll: "GET /api/products",
                create: "POST /api/products",
                getById: "GET /api/products/:id",
                update: "PUT /api/products/:id",
                delete: "DELETE /api/products/:id"
            }
        },
        status: "running",
        timestamp: new Date().toISOString()
    });
});

// 獲取單個產品
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 創建產品
app.post('/api/products', async (req, res) => {
    try {
        console.log("📦 Data received from frontend:", req.body);
        
        const requiredFields = ['productName', 'brand', 'category', 'price'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: `Missing required fields: ${missingFields.join(', ')}` 
            });
        }
        
        const newProduct = new Product(req.body);
        await newProduct.save();
        
        console.log("✅ Product saved successfully:", newProduct._id);
        res.status(201).json({ 
            message: "Product saved successfully!",
            product: newProduct 
        });
    } catch (err) {
        console.error("❌ Database Save Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

// 獲取所有產品
app.get('/api/products', async (req, res) => {
    try {
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
        res.status(400).json({ error: err.message });
    }
});

// 刪除產品
app.delete('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        res.json({ 
            message: "Product deleted successfully",
            product 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 數據庫連接 - 修復版本（移除不支持的選項）
const dbURI = process.env.MONGO_URI;

if (!dbURI) {
    console.error('❌ MONGO_URI is not defined in .env file');
    process.exit(1);
}

console.log('🔄 Connecting to MongoDB...');

// 重要：移除 useNewUrlParser 和 useUnifiedTopology 選項
mongoose.connect(dbURI)
.then(() => {
    console.log('✅ Connected to StepUp Database');
    
    const port = process.env.PORT || 5000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${port}`);
        console.log(`📝 Local access: http://localhost:${port}`);
        console.log(`📝 API endpoints:`);
        console.log(`   📊 Health:  http://localhost:${port}/health`);
        console.log(`   📦 GET     http://localhost:${port}/api/products`);
        console.log(`   📦 POST    http://localhost:${port}/api/products`);
    });
})
.catch(err => {
    console.error('❌ Database connection error:', err.message);
    console.error('💡 Please check:');
    console.error('   1. Your MongoDB Atlas IP whitelist (add 0.0.0.0/0)');
    console.error('   2. Your username and password in MONGO_URI');
    console.error('   3. Your network connection');
    process.exit(1);
});

// 優雅關閉
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('👋 MongoDB connection closed');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await mongoose.connection.close();
    console.log('👋 MongoDB connection closed');
    process.exit(0);
});