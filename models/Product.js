const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },          // product title
    brand: { type: String, required: true },
    model: { type: String, required: true },         // model name (e.g., Air Max 270)
    sizeRange: { type: String, required: true },     // e.g., "7-13"
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    image: { type: String, default: '' },            // image URL
    tag: { type: String, default: '' },              // "NEW", "FEATURED", "SALE", etc.
    collection: { type: String, default: 'Casual' }, // for filtering
    description: { type: String, default: 'Premium athletic footwear with exceptional comfort and style.' }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);