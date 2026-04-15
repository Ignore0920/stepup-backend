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
const Category = require('./models/Category');
const User = require('./models/User');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'stepup_admin_secret_key_change_in_production';

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const Forecast = require('./models/Forecast');

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

// Helper to check DB connection
function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

// Test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Health check
app.get('/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusText = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }[dbStatus] || 'unknown';
    res.status(200).json({ status: 'OK', message: 'Server is running', database: dbStatusText, timestamp: new Date().toISOString() });
});

// Serve mainpage.html at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mainpage.html'));
});

// API information endpoint
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

// ============ Admin Authentication Routes ============
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

// ============ User Authentication (Public) ============
app.post('/api/users/register', async (req, res) => {
    if (!isMongoConnected()) {
        return res.status(503).json({ error: 'Database not ready. Please try again in a moment.' });
    }
    try {
        const { name, email, password, firstName, lastName, phone } = req.body;
        console.log('Registration attempt:', { name, email, firstName, lastName });
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const user = new User({ name, email, password, firstName, lastName, phone });
        await user.save();
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'user' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone } });
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

app.post('/api/users/login', async (req, res) => {
    if (!isMongoConnected()) {
        return res.status(503).json({ error: 'Database not ready. Please try again.' });
    }
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'user' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ User Profile (Authenticated) ============
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
                id: user._id,
                name: user.name,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                street: user.street,
                city: user.city,
                state: user.state,
                postal: user.postal,
                country: user.country,
                cardLast4: user.cardLast4,
                cardExpiry: user.cardExpiry,
                cardHolderName: user.cardHolderName,
                paymentMethodType: user.paymentMethodType
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

// ============ Product Routes (Public) ============
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
        console.log("📦 Data received:", req.body);
        const requiredFields = ['productName', 'brand', 'category', 'price'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
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

// ============ Order Routes (Public) ============
const Order = require('./models/Order');

app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        if (!orderData.orderId || !orderData.customer?.firstName || !orderData.customer?.email || !orderData.items?.length) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const cleanedItems = orderData.items.map(item => ({
            ...item,
            price: typeof item.price === 'string' ? parseFloat(item.price.replace('MOP $', '')) : item.price,
            productId: item.id
        }));
        const order = new Order({
            orderId: orderData.orderId,
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
        res.status(201).json({ success: true, order });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ error: 'Failed to create order', details: err.message });
    }
});

// ============ Middleware to verify admin token ============
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

// ============ Admin Management (Admin only) ============
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

// ============ Seed Default Products (Admin only) ============
app.post('/api/admin/seed-products', verifyAdminToken, async (req, res) => {
    try {
        const defaultProducts = [
            { name: 'Nike Air Max 270', brand: 'Nike', model: 'Air Max 270', sizeRange: '7-13', price: 189.99, stock: 50, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663381436063/lOZOEbUZRBkODyvf.png', tag: 'FEATURED', collection: 'Casual' },
            { name: 'Nike Elite Runner Pro', brand: 'Nike', model: 'Elite Runner Pro', sizeRange: '8-12', price: 229.99, stock: 45, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/LBUPnoswZhcidJkY.png', tag: 'PREMIUM', collection: 'Running' },
            { name: 'Nike Comfort Walk Plus', brand: 'Nike', model: 'Comfort Walk Plus', sizeRange: '6-11', price: 159.99, stock: 30, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/oNmiTuSXqeoDCyvh.jpeg', tag: 'NEW', collection: 'Casual' },
            { name: 'Nike Urban Flex Sneaker', brand: 'Nike', model: 'Urban Flex', sizeRange: '7-12', price: 179.99, stock: 25, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/WPMbFctvNLFtqdqv.png', tag: 'NEW', collection: 'Casual' },
            { name: 'Nike Classic Trainer', brand: 'Nike', model: 'Classic Trainer', sizeRange: '6-15', price: 149.99, stock: 40, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/jtJqPMOhRFGrvlBZ.png', tag: '', collection: 'Training' },
            { name: 'Jordan 1 Retro', brand: 'Jordan', model: '1 Retro', sizeRange: '7-14', price: 249.99, stock: 20, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/HZDiSqxfpxfavVAe.jpg', tag: 'NEW', collection: 'Basketball' },
            { name: 'Adidas Ultra Boost', brand: 'Adidas', model: 'Ultra Boost', sizeRange: '6-13', price: 239.99, stock: 35, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/XHAmwqukAvqToiZo.png', tag: 'TRENDING', collection: 'Running' },
            { name: 'Puma RS-X', brand: 'Puma', model: 'RS-X', sizeRange: '7-12', price: 169.99, stock: 28, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/EAhzJUEkqDjgMWwe.jpg', tag: 'SALE', collection: 'Casual' },
            { name: 'New Balance 990v6', brand: 'New Balance', model: '990v6', sizeRange: '8-14', price: 189.99, stock: 22, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/OISFcGUaRzULPMhv.jpg', tag: '', collection: 'Running' },
            { name: 'Converse One Star', brand: 'Converse', model: 'One Star', sizeRange: '5-13', price: 149.99, stock: 60, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/OqEvWuXBAyHMsEtW.jpg', tag: '', collection: 'Casual' }
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

// ============ Inventory Management (Admin only) ============
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

// ============ Order Management (Admin only) ============
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

// ============ User Management (Admin only) ============
app.get('/api/admin/users', verifyAdminToken, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Error fetching users:', err);
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

// ============ Dashboard Analytics (Admin only) ============

// Overall stats
app.get('/api/admin/dashboard/stats', verifyAdminToken, async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        const totalRevenueAgg = await Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]);
        const totalRevenue = totalRevenueAgg.length ? totalRevenueAgg[0].total : 0;
        const totalUsers = await User.countDocuments();
        const totalProducts = await Product.countDocuments();
        res.json({
            success: true,
            totalRevenue,
            totalOrders,
            totalUsers,
            totalProducts
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Sales timeline (last 30 days, grouped by day)
app.get('/api/admin/dashboard/sales-timeline', verifyAdminToken, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const pipeline = [
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    total: { $sum: '$total' }
                }
            },
            { $sort: { _id: 1 } }
        ];
        const results = await Order.aggregate(pipeline);
        const data = results.map(item => ({ date: item._id, total: item.total }));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Sales timeline error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Top products by quantity sold
app.get('/api/admin/dashboard/top-products', verifyAdminToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const pipeline = [
            { $unwind: '$items' },
            {
                $group: {
                    _id: { name: '$items.name', brand: '$items.brand' },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    name: '$_id.name',
                    brand: '$_id.brand',
                    totalQuantity: 1,
                    totalRevenue: 1
                }
            }
        ];
        const results = await Order.aggregate(pipeline);
        res.json({ success: true, data: results });
    } catch (err) {
        console.error('Top products error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Recent orders
app.get('/api/admin/dashboard/recent-orders', verifyAdminToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('orderId createdAt customer total status');
        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('Recent orders error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current forecast data
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

// Upload forecast CSV
app.post('/api/admin/dashboard/upload-forecast', verifyAdminToken, upload.single('forecast'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const csv = req.file.buffer.toString('utf-8');
        const lines = csv.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) return res.status(400).json({ error: 'CSV must have at least header and one data row' });

        const headers = lines[0].toLowerCase().split(',');
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const salesIdx = headers.findIndex(h => h.includes('forecast') || h.includes('sales'));
        if (dateIdx === -1 || salesIdx === -1) {
            return res.status(400).json({ error: 'CSV must have columns: date and forecast_sales' });
        }

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

// ============ Helper: Linear regression ============
function linearRegression(points) {
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const x = points[i][0];
        const y = points[i][1];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }
    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

// Helper: format a Date as YYYY-MM-DD in local time (no timezone shift)
function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============ Auto-forecast using local time (no UTC offset) ============
app.get('/api/admin/dashboard/auto-forecast', verifyAdminToken, async (req, res) => {
    try {
        const forecastDays = parseInt(req.query.days) || 7;
        const historyDays = 30;

        // 1. Fetch all orders from the last `historyDays` days (local midnight)
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - historyDays);

        const orders = await Order.find({
            createdAt: { $gte: startDate }
        }).select('total createdAt');

        // 2. Group by local date (YYYY-MM-DD in server's timezone)
        const salesByLocalDate = new Map();
        orders.forEach(order => {
            const localDate = new Date(order.createdAt);
            localDate.setHours(0, 0, 0, 0);
            const dateStr = formatLocalDate(localDate);
            const current = salesByLocalDate.get(dateStr) || 0;
            salesByLocalDate.set(dateStr, current + order.total);
        });

        // 3. Convert to sorted array
        const results = Array.from(salesByLocalDate.entries())
            .map(([date, total]) => ({ date, total }))
            .sort((a, b) => a.date.localeCompare(b.date));

        if (results.length < 3) {
            return res.json({ success: true, data: [], message: 'Not enough data for forecasting (need at least 3 days of sales)' });
        }

        // 4. Linear regression on [index, sales]
        const points = results.map((item, idx) => [idx, item.total]);
        const { slope, intercept } = linearRegression(points);

        // 5. Forecast next `forecastDays` days (starting from tomorrow local time)
        const lastIndex = points.length - 1;
        const forecast = [];
        const todayLocal = new Date();
        todayLocal.setHours(0, 0, 0, 0);
        for (let i = 1; i <= forecastDays; i++) {
            const futureX = lastIndex + i;
            let predictedValue = slope * futureX + intercept;
            predictedValue = Math.max(0, predictedValue); // no negative sales
            const forecastDate = new Date(todayLocal);
            forecastDate.setDate(todayLocal.getDate() + i);
            forecast.push({
                date: formatLocalDate(forecastDate),
                value: predictedValue
            });
        }

        res.json({ success: true, data: forecast });
    } catch (err) {
        console.error('Auto-forecast error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ Start Server – ONLY after database is connected ============
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

// Graceful shutdown
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