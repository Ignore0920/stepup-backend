const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },          // product title
    brand: { type: String, required: true },
    model: { type: String, required: true },
    sizeRange: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    image: { type: String, default: '' },
    tag: { type: String, default: '' },
    collection: { type: String, default: 'Casual' },
    description: { type: String, default: 'Premium athletic footwear with exceptional comfort and style.' }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);