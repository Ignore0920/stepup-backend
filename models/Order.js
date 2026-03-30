const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    brand: String,
    price: Number,
    quantity: Number,
    size: String,
    image: String
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true }, // e.g., ORD-123456
    customer: {
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
        address: {
            street: String,
            city: String,
            state: String,
            postal: String,
            country: String
        }
    },
    items: [orderItemSchema],
    subtotal: Number,
    shipping: Number,
    total: Number,
    status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);