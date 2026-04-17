// seed.js - Generate sample data for StepUp e-commerce (with userId)
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const User = require('./models/User');
const Order = require('./models/Order');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stepup';

// ---------------------------
// 1. Sample Products (20 items) - 尺码统一为 35-45
// ---------------------------
const productsData = [
    // Nike
    { name: 'Nike Air Max 270', brand: 'Nike', model: 'Air Max 270', sizeRange: '35-45', price: 189.99, stock: 45, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663381436063/lOZOEbUZRBkODyvf.png', tag: 'FEATURED', collection: 'Casual', description: 'Iconic Air Max cushioning with a modern silhouette.' },
    { name: 'Nike Elite Runner Pro', brand: 'Nike', model: 'Elite Runner Pro', sizeRange: '35-45', price: 229.99, stock: 32, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/LBUPnoswZhcidJkY.png', tag: 'PREMIUM', collection: 'Running', description: 'Designed for marathon runners with responsive foam.' },
    { name: 'Nike Comfort Walk Plus', brand: 'Nike', model: 'Comfort Walk Plus', sizeRange: '35-45', price: 159.99, stock: 28, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/oNmiTuSXqeoDCyvh.jpeg', tag: 'NEW', collection: 'Casual', description: 'All-day walking comfort with soft padding.' },
    { name: 'Nike Urban Flex Sneaker', brand: 'Nike', model: 'Urban Flex', sizeRange: '35-45', price: 179.99, stock: 19, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/WPMbFctvNLFtqdqv.png', tag: 'NEW', collection: 'Casual', description: 'Street-style sneaker with flexible outsole.' },
    { name: 'Nike Classic Trainer', brand: 'Nike', model: 'Classic Trainer', sizeRange: '35-45', price: 149.99, stock: 37, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/jtJqPMOhRFGrvlBZ.png', tag: '', collection: 'Training', description: 'Versatile trainer for gym and daily wear.' },
    // Jordan
    { name: 'Jordan 1 Retro', brand: 'Jordan', model: '1 Retro', sizeRange: '35-45', price: 249.99, stock: 15, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/HZDiSqxfpxfavVAe.jpg', tag: 'NEW', collection: 'Basketball', description: 'Classic high-top with premium leather.' },
    { name: 'Jordan 4 Retro', brand: 'Jordan', model: '4 Retro', sizeRange: '35-45', price: 279.99, stock: 12, image: 'https://via.placeholder.com/400?text=Jordan+4', tag: 'LIMITED', collection: 'Basketball', description: 'Iconic silhouette with visible Air cushioning.' },
    // Adidas
    { name: 'Adidas Ultra Boost', brand: 'Adidas', model: 'Ultra Boost', sizeRange: '35-45', price: 239.99, stock: 41, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/XHAmwqukAvqToiZo.png', tag: 'TRENDING', collection: 'Running', description: 'Responsive Boost foam for energy return.' },
    { name: 'Adidas Superstar', brand: 'Adidas', model: 'Superstar', sizeRange: '35-45', price: 129.99, stock: 53, image: 'https://via.placeholder.com/400?text=Superstar', tag: '', collection: 'Casual', description: 'Classic shell-toe sneaker.' },
    { name: 'Adidas NMD R1', brand: 'Adidas', model: 'NMD R1', sizeRange: '35-45', price: 169.99, stock: 27, image: 'https://via.placeholder.com/400?text=NMD+R1', tag: 'SALE', collection: 'Casual', description: 'Modern streetwear with sock-like fit.' },
    // Puma
    { name: 'Puma RS-X', brand: 'Puma', model: 'RS-X', sizeRange: '35-45', price: 169.99, stock: 22, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/EAhzJUEkqDjgMWwe.jpg', tag: 'SALE', collection: 'Casual', description: 'Chunky silhouette with bold colors.' },
    { name: 'Puma Suede Classic', brand: 'Puma', model: 'Suede Classic', sizeRange: '35-45', price: 99.99, stock: 48, image: 'https://via.placeholder.com/400?text=Puma+Suede', tag: '', collection: 'Casual', description: 'Timeless suede sneaker.' },
    // New Balance
    { name: 'New Balance 990v6', brand: 'New Balance', model: '990v6', sizeRange: '35-45', price: 189.99, stock: 18, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/OISFcGUaRzULPMhv.jpg', tag: '', collection: 'Running', description: 'Made in USA with superior cushioning.' },
    { name: 'New Balance 327', brand: 'New Balance', model: '327', sizeRange: '35-45', price: 119.99, stock: 34, image: 'https://via.placeholder.com/400?text=NB+327', tag: 'TRENDING', collection: 'Casual', description: 'Retro-inspired angular design.' },
    // Converse
    { name: 'Converse One Star', brand: 'Converse', model: 'One Star', sizeRange: '35-45', price: 149.99, stock: 62, image: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663370729728/OqEvWuXBAyHMsEtW.jpg', tag: '', collection: 'Casual', description: 'Suede low-top with star logo.' },
    { name: 'Converse Chuck Taylor All Star', brand: 'Converse', model: 'Chuck Taylor', sizeRange: '35-45', price: 79.99, stock: 89, image: 'https://via.placeholder.com/400?text=Chuck+Taylor', tag: 'BESTSELLER', collection: 'Casual', description: 'The original canvas sneaker.' },
    // Under Armour
    { name: 'Under Armour HOVR Phantom', brand: 'Under Armour', model: 'HOVR Phantom', sizeRange: '35-45', price: 159.99, stock: 25, image: 'https://via.placeholder.com/400?text=UA+HOVR', tag: '', collection: 'Running', description: 'Connected running shoe with energy return.' },
    // Asics
    { name: 'Asics Gel-Kayano 29', brand: 'Asics', model: 'Gel-Kayano 29', sizeRange: '35-45', price: 199.99, stock: 20, image: 'https://via.placeholder.com/400?text=Gel-Kayano', tag: '', collection: 'Running', description: 'Maximum stability for overpronators.' },
    // Reebok
    { name: 'Reebok Nano X2', brand: 'Reebok', model: 'Nano X2', sizeRange: '35-45', price: 139.99, stock: 31, image: 'https://via.placeholder.com/400?text=Nano+X2', tag: '', collection: 'Training', description: 'Cross-training shoe for gym workouts.' },
    // On Running
    { name: 'On Running Cloudstratus', brand: 'On Running', model: 'Cloudstratus', sizeRange: '35-45', price: 229.99, stock: 14, image: 'https://via.placeholder.com/400?text=Cloudstratus', tag: 'PREMIUM', collection: 'Running', description: 'Dual-layer CloudTec for long distances.' }
];

// ---------------------------
// 2. Sample Users (30)
// ---------------------------
const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Walker', 'Hall'];

const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin', 'Macau', 'Hong Kong', 'Singapore', 'London', 'Toronto'];
const countries = ['USA', 'USA', 'USA', 'USA', 'USA', 'USA', 'China', 'China', 'Singapore', 'UK', 'Canada'];

const generateUsers = (count) => {
    const users = [];
    for (let i = 1; i <= count; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const name = `${firstName} ${lastName}`;
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
        const phone = `+1 555-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const city = cities[Math.floor(Math.random() * cities.length)];
        const country = countries[Math.floor(Math.random() * countries.length)];
        const street = `${Math.floor(100 + Math.random() * 9000)} ${['Main St', 'Oak Ave', 'Maple Rd', 'Pine Ln', 'Cedar Blvd'][Math.floor(Math.random() * 5)]}`;
        const postal = Math.floor(10000 + Math.random() * 90000).toString();
        const hasCard = Math.random() > 0.3;
        users.push({
            name,
            email,
            password: 'password123',
            firstName,
            lastName,
            phone,
            street,
            city,
            state: 'State',
            postal,
            country,
            cardLast4: hasCard ? Math.floor(1000 + Math.random() * 9000).toString() : '',
            cardExpiry: hasCard ? `0${Math.floor(1 + Math.random() * 12)}/${Math.floor(24 + Math.random() * 4)}` : '',
            cardHolderName: hasCard ? name : '',
            paymentMethodType: hasCard ? (Math.random() > 0.5 ? 'credit' : 'wallet') : 'credit',
            createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
            lastLogin: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        });
    }
    return users;
};

// ---------------------------
// 3. Generate Orders (80-120) - 关键修改：尺码随机范围为 35-45，并关联 userId
// ---------------------------
const orderStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const getRandomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

const generateOrders = (users, products, minOrders = 80, maxOrders = 120) => {
    const orders = [];
    const numOrders = Math.floor(Math.random() * (maxOrders - minOrders + 1) + minOrders);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    const endDate = new Date();

    for (let i = 0; i < numOrders; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const numItems = Math.floor(Math.random() * 4) + 1;
        const selectedProducts = [];
        let subtotal = 0;
        for (let j = 0; j < numItems; j++) {
            const product = products[Math.floor(Math.random() * products.length)];
            const quantity = Math.floor(Math.random() * 3) + 1;
            const price = product.price;
            subtotal += price * quantity;
            // 随机尺码：35 到 45 之间的整数
            const randomSize = Math.floor(Math.random() * 11) + 35; // 35 ~ 45
            selectedProducts.push({
                productId: product._id,
                name: product.name,
                brand: product.brand,
                price: price,
                quantity: quantity,
                size: randomSize.toString(),
                image: product.image
            });
        }
        const shipping = Math.random() > 0.7 ? 15.00 : 0;
        const total = subtotal + shipping;
        const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
        const createdAt = getRandomDate(startDate, endDate);
        const orderId = `ORD-${createdAt.getFullYear()}${(createdAt.getMonth()+1).toString().padStart(2,'0')}${createdAt.getDate().toString().padStart(2,'0')}-${Math.floor(1000 + Math.random() * 9000)}`;

        orders.push({
            orderId,
            userId: user._id,   // 关联用户
            customer: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                street: user.street,
                city: user.city,
                state: user.state,
                postal: user.postal,
                country: user.country
            },
            items: selectedProducts,
            subtotal,
            shipping,
            total,
            status,
            paymentMethod: user.paymentMethodType || (Math.random() > 0.5 ? 'credit' : 'wallet'),
            createdAt,
            updatedAt: createdAt
        });
    }
    orders.sort((a,b) => a.createdAt - b.createdAt);
    return orders;
};

// ---------------------------
// 4. Main seeding function
// ---------------------------
async function seedDatabase() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 如需清空旧数据，取消下面三行的注释
        // await Product.deleteMany({});
        // await User.deleteMany({});
        // await Order.deleteMany({});
        // console.log('🗑️ Cleared existing data');

        const insertedProducts = await Product.insertMany(productsData);
        console.log(`📦 Inserted ${insertedProducts.length} products`);

        const usersData = generateUsers(30);
        const insertedUsers = await User.insertMany(usersData);
        console.log(`👥 Inserted ${insertedUsers.length} users`);

        const ordersData = generateOrders(insertedUsers, insertedProducts, 90, 130);
        const insertedOrders = await Order.insertMany(ordersData);
        console.log(`📋 Inserted ${insertedOrders.length} orders`);

        const totalRevenue = insertedOrders.reduce((sum, o) => sum + o.total, 0);
        const completedOrders = insertedOrders.filter(o => o.status === 'delivered').length;
        console.log('\n📊 Summary:');
        console.log(`   Total orders: ${insertedOrders.length}`);
        console.log(`   Total revenue: MOP ${totalRevenue.toFixed(2)}`);
        console.log(`   Completed orders: ${completedOrders}`);
        console.log(`   Products: ${insertedProducts.length}`);
        console.log(`   Users: ${insertedUsers.length}`);

        await mongoose.disconnect();
        console.log('✅ Seeding complete.');
    } catch (err) {
        console.error('❌ Seeding error:', err);
        process.exit(1);
    }
}

seedDatabase();