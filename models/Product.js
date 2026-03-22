const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    productName: { type: String, required: true },
    brand: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    availableSizes: [Number],
    stockQuantity: { type: Number, default: 0 },
    photoURL: String
});

module.exports = mongoose.model('Product', productSchema);