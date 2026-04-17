const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx'); // 引入 xlsx 模块

// Models
const Admin = require('./models/Admin');
const Product = require('./models/Product');
const Category = require('./models/Category');
const User = require('./models/User');
const Order = require('./models/Order');
const Forecast = require('./models/Forecast');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'stepup_admin_secret_key_change_in_production';

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // 只定义一次

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://stepup-backend-j8h1.onrender.com'] 
        : '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

console.log('🚀 StepUp Backend Starting...');
console.log('📦 Node Version:', process.version);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

function getUserIdFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('🔐 No valid Authorization header');
        return null;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`🔐 Token decoded, userId: ${decoded.id}`);
        return decoded.id;
    } catch (err) {
        console.log('🔐 Token verification failed:', err.message);
        return null;
    }
}

// ---------- 基础路由 ----------
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusText = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }[dbStatus] || 'unknown';
    res.status(200).json({ status: 'OK', message: 'Server is running', database: dbStatusText, timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mainpage.html'));
});

app.get('/api/info', (req, res) => {
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

// ============ 管理员认证 ============
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(401).json({ error: 'Invalid username or password' });
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid username or password' });
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

// ============ 用户认证 ============
app.post('/api/users/register', async (req, res) => {
    if (!isMongoConnected()) return res.status(503).json({ error: 'Database not ready' });
    try {
        const { name, email, password, firstName, lastName, phone } = req.body;
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const user = new User({ name, email, password, firstName, lastName, phone });
        await user.save();
        const token = jwt.sign({ id: user._id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone } });
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 11000) return res.status(400).json({ error: 'Email already registered' });
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    if (!isMongoConnected()) return res.status(503).json({ error: 'Database not ready' });
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });
        const token = jwt.sign({ id: user._id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 用户中间件 ============
const verifyUserToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

app.get('/api/users/profile', verifyUserToken, async (req, res) => {
    try {
        const user = req.user;
        res.json({
            success: true,
            user: {
                id: user._id, name: user.name, email: user.email, firstName: user.firstName, lastName: user.lastName,
                phone: user.phone, street: user.street, city: user.city, state: user.state, postal: user.postal, country: user.country,
                cardLast4: user.cardLast4, cardExpiry: user.cardExpiry, cardHolderName: user.cardHolderName, paymentMethodType: user.paymentMethodType
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/users/profile', verifyUserToken, async (req, res) => {
    try {
        const user = req.user;
        const { firstName, lastName, phone, street, city, state, postal, country, cardLast4, cardExpiry, cardHolderName, paymentMethodType } = req.body;
        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;
        if (phone !== undefined) user.phone = phone;
        if (street !== undefined) user.street = street;
        if (city !== undefined) user.city = city;
        if (state !== undefined) user.state = state;
        if (postal !== undefined) user.postal = postal;
        if (country !== undefined) user.country = country;
        if (cardLast4 !== undefined) user.cardLast4 = cardLast4;
        if (cardExpiry !== undefined) user.cardExpiry = cardExpiry;
        if (cardHolderName !== undefined) user.cardHolderName = cardHolderName;
        if (paymentMethodType !== undefined) user.paymentMethodType = paymentMethodType;
        await user.save();
        res.json({ success: true, message: 'Profile updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 用户订单 ============
app.get('/api/users/orders', verifyUserToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 }).select('orderId createdAt total status items');
        console.log(`📦 Found ${orders.length} orders for user ${req.user.email}`);
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Error fetching user orders:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/users/orders/:id', verifyUserToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.userId && order.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.json({ success: true, order });
    } catch (err) {
        console.error('Error fetching order detail:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 商品路由 ============
app.get('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
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
        if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
        const requiredFields = ['name', 'brand', 'price'];
        const missingFields = requiredFields.filter(field => req.body[field] === undefined);
        if (missingFields.length > 0) {
            return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
        }
        const newProduct = new Product(req.body);
        await newProduct.save();
        console.log("✅ Product saved:", newProduct._id);
        res.status(201).json({ message: "Product saved successfully!", product: newProduct });
    } catch (err) {
        console.error("❌ Save Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, count: products.length, data: products });
    } catch (err) {
        console.error("❌ Fetch Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json({ message: "Product updated successfully", product });
    } catch (err) {
        console.error("❌ Update Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json({ message: "Product deleted successfully", product });
    } catch (err) {
        console.error("❌ Delete Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============ 订单创建 ============
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData.orderId || !orderData.customer?.firstName || !orderData.customer?.email || !orderData.items?.length) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const userId = getUserIdFromToken(req);
        console.log(`🛒 Creating order, userId from token: ${userId || 'none (guest)'}`);

        const cleanedItems = orderData.items.map(item => ({
            ...item,
            price: typeof item.price === 'string' ? parseFloat(item.price.replace('MOP $', '')) : item.price,
            productId: item.id
        }));

        const order = new Order({
            orderId: orderData.orderId,
            userId: userId || undefined,
            customer: {
                firstName: orderData.customer.firstName,
                lastName: orderData.customer.lastName,
                email: orderData.customer.email,
                phone: orderData.customer.phone,
                street: orderData.customer.street,
                city: orderData.customer.city,
                state: orderData.customer.state,
                postal: orderData.customer.postal,
                country: orderData.customer.country
            },
            items: cleanedItems,
            subtotal: orderData.subtotal,
            shipping: orderData.shipping,
            total: orderData.total,
            status: orderData.status || 'pending',
            paymentMethod: orderData.paymentMethod || 'credit'
        });

        await order.save();
        console.log(`✅ Order ${order.orderId} saved with userId: ${order.userId || 'none'}`);
        res.status(201).json({ success: true, order });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ error: 'Failed to create order', details: err.message });
    }
});

// ============ 管理员中间件 ============
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

// ============ 管理员管理 ============
app.get('/api/admins', verifyAdminToken, async (req, res) => {
    try {
        const admins = await Admin.find().select('-password');
        res.json({ success: true, data: admins });
    } catch (err) {
        console.error('Error fetching admins:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admins', verifyAdminToken, async (req, res) => {
    try {
        const { username, password } = req.body;
        const existing = await Admin.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username already exists' });
        const newAdmin = new Admin({ username, password });
        await newAdmin.save();
        res.status(201).json({ success: true, admin: { id: newAdmin._id, username: newAdmin.username } });
    } catch (err) {
        console.error('Error creating admin:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

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
        console.error('Error updating admin:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admins/:id', verifyAdminToken, async (req, res) => {
    try {
        const admin = await Admin.findByIdAndDelete(req.params.id);
        if (!admin) return res.status(404).json({ error: 'Admin not found' });
        res.json({ success: true, message: 'Admin deleted' });
    } catch (err) {
        console.error('Error deleting admin:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 种子数据 ============
app.post('/api/admin/seed-products', verifyAdminToken, async (req, res) => {
    try {
        const defaultProducts = [
            { name: 'Nike Air Max 270', brand: 'Nike', model: 'Air Max 270', sizeRange: '35-45', price: 189.99, stock: 50, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663381436063/lOZOEbUZRBkODyvf.png', tag: 'FEATURED', collection: 'Casual' },
            { name: 'Nike Elite Runner Pro', brand: 'Nike', model: 'Elite Runner Pro', sizeRange: '35-45', price: 229.99, stock: 45, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/LBUPnoswZhcidJkY.png', tag: 'PREMIUM', collection: 'Running' },
            { name: 'Nike Comfort Walk Plus', brand: 'Nike', model: 'Comfort Walk Plus', sizeRange: '35-45', price: 159.99, stock: 30, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/oNmiTuSXqeoDCyvh.jpeg', tag: 'NEW', collection: 'Casual' },
            { name: 'Nike Urban Flex Sneaker', brand: 'Nike', model: 'Urban Flex', sizeRange: '35-45', price: 179.99, stock: 25, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/WPMbFctvNLFtqdqv.png', tag: 'NEW', collection: 'Casual' },
            { name: 'Nike Classic Trainer', brand: 'Nike', model: 'Classic Trainer', sizeRange: '35-45', price: 149.99, stock: 40, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/jtJqPMOhRFGrvlBZ.png', tag: '', collection: 'Training' },
            { name: 'Jordan 1 Retro', brand: 'Jordan', model: '1 Retro', sizeRange: '35-45', price: 249.99, stock: 20, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/HZDiSqxfpxfavVAe.jpg', tag: 'NEW', collection: 'Basketball' },
            { name: 'Adidas Ultra Boost', brand: 'Adidas', model: 'Ultra Boost', sizeRange: '35-45', price: 239.99, stock: 35, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/XHAmwqukAvqToiZo.png', tag: 'TRENDING', collection: 'Running' },
            { name: 'Puma RS-X', brand: 'Puma', model: 'RS-X', sizeRange: '35-45', price: 169.99, stock: 28, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/EAhzJUEkqDjgMWwe.jpg', tag: 'SALE', collection: 'Casual' },
            { name: 'New Balance 990v6', brand: 'New Balance', model: '990v6', sizeRange: '35-45', price: 189.99, stock: 22, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/OISFcGUaRzULPMhv.jpg', tag: '', collection: 'Running' },
            { name: 'Converse One Star', brand: 'Converse', model: 'One Star', sizeRange: '35-45', price: 149.99, stock: 60, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/OqEvWuXBAyHMsEtW.jpg', tag: '', collection: 'Casual' }
        ];
        let inserted = 0, skipped = 0;
        for (const prod of defaultProducts) {
            const exists = await Product.findOne({ name: prod.name, brand: prod.brand });
            if (!exists) {
                await Product.create(prod);
                inserted++;
            } else {
                skipped++;
            }
        }
        res.json({ success: true, message: `Seeding complete. Inserted: ${inserted}, Skipped: ${skipped}` });
    } catch (err) {
        console.error('Seed error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ 库存管理 ============
app.get('/api/admin/inventory/products', verifyAdminToken, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, data: products });
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/inventory/products/:id', verifyAdminToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true, product });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/inventory/products', verifyAdminToken, async (req, res) => {
    try {
        const { name, brand, model, sizeRange, price, stock, image, tag, collection } = req.body;
        if (!name || !brand || !model || !sizeRange || price === undefined || stock === undefined) {
            return res.status(400).json({ error: 'Missing required fields: name, brand, model, sizeRange, price, stock' });
        }
        const product = new Product({ name, brand, model, sizeRange, price, stock, image: image || '', tag: tag || '', collection: collection || 'Casual' });
        await product.save();
        res.status(201).json({ success: true, product });
    } catch (err) {
        console.error('Error creating product:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/inventory/products/:id', verifyAdminToken, async (req, res) => {
    try {
        const { name, brand, model, sizeRange, price, stock, image, tag, collection } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        if (name !== undefined) product.name = name;
        if (brand !== undefined) product.brand = brand;
        if (model !== undefined) product.model = model;
        if (sizeRange !== undefined) product.sizeRange = sizeRange;
        if (price !== undefined) product.price = price;
        if (stock !== undefined) product.stock = stock;
        if (image !== undefined) product.image = image;
        if (tag !== undefined) product.tag = tag;
        if (collection !== undefined) product.collection = collection;
        await product.save();
        res.json({ success: true, product });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/inventory/products/:id', verifyAdminToken, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 批量导入商品 (CSV / Excel) - 修复重复 upload 声明
app.post('/api/admin/inventory/import', verifyAdminToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileBuffer = req.file.buffer;
        let rows = [];

        const fileName = req.file.originalname.toLowerCase();
        if (fileName.endsWith('.csv')) {
            const csvString = fileBuffer.toString('utf-8');
            const workbook = XLSX.read(csvString, { type: 'string' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        } else {
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        }

        if (rows.length < 2) {
            return res.status(400).json({ error: 'File must contain at least a header row and one data row' });
        }

        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const missingRequired = ['name', 'brand', 'model', 'sizerange', 'price', 'stock'].filter(f => !headers.includes(f));
        if (missingRequired.length > 0) {
            return res.status(400).json({ error: `Missing required columns: ${missingRequired.join(', ')}` });
        }

        let inserted = 0, updated = 0, errors = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => cell === undefined || cell === null || String(cell).trim() === '')) continue;

            try {
                const productData = {};
                headers.forEach((header, idx) => {
                    let value = row[idx];
                    if (value !== undefined && value !== null) value = String(value).trim();
                    else value = '';
                    
                    if (header === 'sizerange') productData.sizeRange = value;
                    else if (header === 'price') productData.price = parseFloat(value) || 0;
                    else if (header === 'stock') productData.stock = parseInt(value) || 0;
                    else if (header === 'image') productData.image = value;
                    else if (header === 'tag') productData.tag = value;
                    else if (header === 'collection') productData.collection = value || 'Casual';
                    else if (header === 'description') productData.description = value || 'Premium athletic footwear.';
                    else productData[header] = value;
                });

                if (!productData.name || !productData.brand || !productData.model || !productData.sizeRange || isNaN(productData.price) || isNaN(productData.stock)) {
                    errors++;
                    continue;
                }

                const existing = await Product.findOne({ name: productData.name, brand: productData.brand, model: productData.model });
                if (existing) {
                    Object.assign(existing, productData);
                    await existing.save();
                    updated++;
                } else {
                    const newProduct = new Product(productData);
                    await newProduct.save();
                    inserted++;
                }
            } catch (rowErr) {
                console.error(`Error processing row ${i}:`, rowErr);
                errors++;
            }
        }

        res.json({ success: true, inserted, updated, errors, total: rows.length - 1 });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: 'Server error during import' });
    }
});

// ============ 订单管理（管理员） ============
app.get('/api/admin/orders', verifyAdminToken, async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/orders/:id', verifyAdminToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ success: true, order });
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/orders/:id', verifyAdminToken, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status required' });
        const order = await Order.findByIdAndUpdate(req.params.id, { status, updatedAt: Date.now() }, { new: true });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ success: true, order });
    } catch (err) {
        console.error('Error updating order:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/orders/:id', verifyAdminToken, async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status: 'cancelled', updatedAt: Date.now() }, { new: true });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ success: true, message: 'Order cancelled', order });
    } catch (err) {
        console.error('Error cancelling order:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 用户管理（管理员） ============
app.get('/api/admin/users', verifyAdminToken, async (req, res) => {
    try {
        const users = await User.aggregate([
            { $lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' } },
            { $addFields: { orderCount: { $size: '$orders' } } },
            { $project: { password: 0, orders: 0 } },
            { $sort: { createdAt: -1 } }
        ]);
        console.log(`👥 Admin fetched ${users.length} users, first user orderCount: ${users[0]?.orderCount || 0}`);
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Error fetching users with order count:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/users', verifyAdminToken, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already exists' });
        const user = new User({ name, email, password });
        await user.save();
        const userObj = user.toObject();
        delete userObj.password;
        res.status(201).json({ success: true, user: userObj });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/users/:id', verifyAdminToken, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (name) user.name = name;
        if (email) user.email = email;
        if (password) user.password = password;
        await user.save();
        const userObj = user.toObject();
        delete userObj.password;
        res.json({ success: true, user: userObj });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/users/:id', verifyAdminToken, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'User deleted' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 数据迁移：修复旧订单 userId ============
app.post('/api/admin/migrate-orders-userid', verifyAdminToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: { $exists: false } });
        let updated = 0, skipped = 0;
        for (const order of orders) {
            const email = order.customer?.email;
            if (email) {
                const user = await User.findOne({ email: email.toLowerCase() });
                if (user) {
                    order.userId = user._id;
                    await order.save();
                    updated++;
                    console.log(`✅ Updated order ${order.orderId} -> user ${user.email}`);
                } else {
                    skipped++;
                    console.log(`⚠️ No user found for email: ${email}, order ${order.orderId}`);
                }
            } else {
                skipped++;
                console.log(`⚠️ Order ${order.orderId} has no customer email`);
            }
        }
        res.json({ success: true, message: `Migration complete. Updated: ${updated}, Skipped: ${skipped}` });
    } catch (err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 仪表盘分析 ============
function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

app.get('/api/admin/dashboard/stats', verifyAdminToken, async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        const totalRevenueAgg = await Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]);
        const totalRevenue = totalRevenueAgg.length ? totalRevenueAgg[0].total : 0;
        const totalUsers = await User.countDocuments();
        const totalProducts = await Product.countDocuments();
        res.json({ success: true, totalRevenue, totalOrders, totalUsers, totalProducts });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/dashboard/sales-timeline', verifyAdminToken, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - days);
        const orders = await Order.find({ createdAt: { $gte: startDate } }).select('total createdAt');
        const salesByLocalDate = new Map();
        orders.forEach(order => {
            const localDate = new Date(order.createdAt);
            localDate.setHours(0, 0, 0, 0);
            const dateStr = formatLocalDate(localDate);
            salesByLocalDate.set(dateStr, (salesByLocalDate.get(dateStr) || 0) + order.total);
        });
        const data = Array.from(salesByLocalDate.entries()).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Sales timeline error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/dashboard/top-products', verifyAdminToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const pipeline = [
            { $unwind: '$items' },
            { $group: { _id: { name: '$items.name', brand: '$items.brand' }, totalQuantity: { $sum: '$items.quantity' }, totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
            { $sort: { totalQuantity: -1 } },
            { $limit: limit },
            { $project: { _id: 0, name: '$_id.name', brand: '$_id.brand', totalQuantity: 1, totalRevenue: 1 } }
        ];
        const results = await Order.aggregate(pipeline);
        res.json({ success: true, data: results });
    } catch (err) {
        console.error('Top products error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/dashboard/recent-orders', verifyAdminToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const orders = await Order.find().sort({ createdAt: -1 }).limit(limit).select('orderId createdAt customer total status');
        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('Recent orders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/dashboard/forecast', verifyAdminToken, async (req, res) => {
    try {
        const forecast = await Forecast.find().sort({ date: 1 });
        const data = forecast.map(f => ({ date: f.date.toISOString().slice(0,10), value: f.value }));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Forecast fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/dashboard/upload-forecast', verifyAdminToken, upload.single('forecast'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const csv = req.file.buffer.toString('utf-8');
        const lines = csv.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) return res.status(400).json({ error: 'CSV must have at least header and one data row' });
        const headers = lines[0].toLowerCase().split(',');
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const salesIdx = headers.findIndex(h => h.includes('forecast') || h.includes('sales'));
        if (dateIdx === -1 || salesIdx === -1) return res.status(400).json({ error: 'CSV must have columns: date and forecast_sales' });
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 2) continue;
            const dateStr = cols[dateIdx].trim();
            const valueStr = cols[salesIdx].trim();
            if (!dateStr || !valueStr) continue;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) continue;
            const value = parseFloat(valueStr);
            if (isNaN(value)) continue;
            parsed.push({ date, value });
        }
        if (parsed.length === 0) return res.status(400).json({ error: 'No valid data rows found' });
        await Forecast.deleteMany({});
        await Forecast.insertMany(parsed);
        res.json({ success: true, message: `Uploaded ${parsed.length} forecast points` });
    } catch (err) {
        console.error('Forecast upload error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

function linearRegression(points) {
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const x = points[i][0], y = points[i][1];
        sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    }
    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

app.get('/api/admin/dashboard/auto-forecast', verifyAdminToken, async (req, res) => {
    try {
        const forecastDays = parseInt(req.query.days) || 7;
        const includeToday = req.query.includeToday === 'true';
        const historyDays = 30;
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - historyDays);
        const orders = await Order.find({ createdAt: { $gte: startDate } }).select('total createdAt');
        const salesByLocalDate = new Map();
        orders.forEach(order => {
            const localDate = new Date(order.createdAt);
            localDate.setHours(0, 0, 0, 0);
            const dateStr = formatLocalDate(localDate);
            salesByLocalDate.set(dateStr, (salesByLocalDate.get(dateStr) || 0) + order.total);
        });
        const results = Array.from(salesByLocalDate.entries()).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
        if (results.length < 3) return res.json({ success: true, data: [], message: 'Not enough data' });
        const points = results.map((item, idx) => [idx, item.total]);
        const { slope, intercept } = linearRegression(points);
        const lastIndex = points.length - 1;
        const forecast = [];
        const todayLocal = new Date();
        todayLocal.setHours(0, 0, 0, 0);
        const startOffset = includeToday ? 0 : 1;
        for (let i = startOffset; i < startOffset + forecastDays; i++) {
            const futureX = lastIndex + i;
            let predictedValue = slope * futureX + intercept;
            predictedValue = Math.max(0, predictedValue);
            const forecastDate = new Date(todayLocal);
            forecastDate.setDate(todayLocal.getDate() + i);
            forecast.push({ date: formatLocalDate(forecastDate), value: predictedValue });
        }
        res.json({ success: true, data: forecast });
    } catch (err) {
        console.error('Auto-forecast error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ 启动服务器 ============
const port = process.env.PORT || 5000;
const dbURI = process.env.MONGO_URI;

if (!dbURI) {
    console.error('❌ MONGO_URI is not defined in environment variables. Server cannot start.');
    process.exit(1);
}

console.log('🔄 Connecting to MongoDB...');
mongoose.connect(dbURI)
    .then(async () => {
        console.log('✅ Connected to StepUp Database');
        const adminCount = await Admin.countDocuments();
        if (adminCount === 0) {
            const defaultAdmin = new Admin({ username: 'admin', password: 'admin123' });
            await defaultAdmin.save();
            console.log('✅ Default admin created: username = admin, password = admin123');
        }
        app.listen(port, '0.0.0.0', () => {
            console.log(`✅ Server is running on port ${port}`);
            console.log(`📍 Local: http://localhost:${port}`);
            console.log(`📊 Health: http://localhost:${port}/health`);
            console.log(`📝 API: http://localhost:${port}/api/products`);
            console.log(`🧪 Test: http://localhost:${port}/test`);
        });
    })
    .catch(err => {
        console.error('❌ Database connection error:', err.message);
        console.error('💡 Please check your MONGO_URI in .env file');
        process.exit(1);
    });

process.on('SIGINT', async () => {
    console.log('👋 Shutting down...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('👋 Shutting down...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
});