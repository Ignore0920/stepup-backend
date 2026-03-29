const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Models
const Admin = require('./models/Admin');
const Product = require('./models/Product');
const User = require('./models/User');   // <-- import User model

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'stepup_admin_secret_key_change_in_production';

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

console.log('🚀 StepUp Backend Starting...');
console.log('📦 Node Version:', process.version);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

// Test route
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is working!',
        timestamp: new Date().toISOString()
    });
});

// Health check
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

// Root
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
        res.json({ success: true, token, user: { username: admin.username } });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/verify', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        if (!admin) return res.status(401).json({ error: 'Admin not found' });
        res.json({ success: true, user: { username: admin.username } });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// ============ User Authentication (Public) ============
app.post('/api/users/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        console.log('Registration attempt:', { name, email });
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        const user = new User({ name, email, password });
        await user.save();
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'user' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.status(201).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'user' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ Product Routes ============
app.get('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(product);
    } catch (err) {
        console.error("❌ Fetch Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
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

app.get('/api/products', async (req, res) => {
    try {
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
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json({
            message: "Product updated successfully",
            product
        });
    } catch (err) {
        console.error("❌ Update Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: "Database not connected" });
        }
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json({
            message: "Product deleted successfully",
            product
        });
    } catch (err) {
        console.error("❌ Delete Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Middleware to verify admin token
const verifyAdminToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        if (!admin) return res.status(401).json({ error: 'Admin not found' });
        req.admin = admin;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// GET all admins (excluding passwords)
app.get('/api/admins', verifyAdminToken, async (req, res) => {
    try {
        const admins = await Admin.find().select('-password');
        res.json({ success: true, data: admins });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST create a new admin
app.post('/api/admins', verifyAdminToken, async (req, res) => {
    try {
        const { username, password } = req.body;
        const existing = await Admin.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username already exists' });
        const newAdmin = new Admin({ username, password });
        await newAdmin.save();
        res.status(201).json({ success: true, admin: { id: newAdmin._id, username: newAdmin.username } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT update an admin (username and optional password)
app.put('/api/admins/:id', verifyAdminToken, async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findById(req.params.id);
        if (!admin) return res.status(404).json({ error: 'Admin not found' });
        if (username) admin.username = username;
        if (password) admin.password = password;
        await admin.save();
        res.json({ success: true, admin: { id: admin._id, username: admin.username } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE an admin
app.delete('/api/admins/:id', verifyAdminToken, async (req, res) => {
    try {
        const admin = await Admin.findByIdAndDelete(req.params.id);
        if (!admin) return res.status(404).json({ error: 'Admin not found' });
        res.json({ success: true, message: 'Admin deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// ============ Start Server ============
const port = process.env.PORT || 5000;
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${port}`);
    console.log(`📍 Local: http://localhost:${port}`);
    console.log(`📊 Health: http://localhost:${port}/health`);
    console.log(`📝 API: http://localhost:${port}/api/products`);
    console.log(`🧪 Test: http://localhost:${port}/test`);
});

// Connect to MongoDB
const dbURI = process.env.MONGO_URI;
if (!dbURI) {
    console.error('⚠️  WARNING: MONGO_URI is not defined in environment variables');
    console.log('💡 Database features will not work until MONGO_URI is set');
} else {
    console.log('🔄 Connecting to MongoDB...');
    mongoose.connect(dbURI)
        .then(async () => {
            console.log('✅ Connected to StepUp Database');
            const adminCount = await Admin.countDocuments();
            if (adminCount === 0) {
                const defaultAdmin = new Admin({
                    username: 'admin',
                    password: 'admin123'
                });
                await defaultAdmin.save();
                console.log('✅ Default admin created: username = admin, password = admin123');
            }
        })
        .catch(err => {
            console.error('❌ Database connection error:', err.message);
        });
}

// Graceful shutdown
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