import mongoose from "mongoose"


const shopBasicSchema = new mongoose.Schema({
shopName: { type: String, required: true },
shopLogo: { type: String, required: true },
contactDetails: {
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true }
},
socialMediaLinks: {
    facebook: { type: String },
    twitter: { type: String },
    instagram: { type: String },
    linkedin: { type: String }
},

deletedBanner: [ { 
    imageUrl: { type: String, required: true },
    heading: { type: String },
    subHeading: { type: String },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
} ],

}, { timestamps: true })

const ShopBasic = mongoose.model("ShopBasic", shopBasicSchema)

export default ShopBasic