import mongoose from "mongoose";

const shopBasicSchema = new mongoose.Schema({
  shopName: { type: String, required: true },
  shopNumber: { type: String, required: true },
  shopLogo: { type: String },
  contactDetails: {
    email: { type: String, required: true },
    phone: { type: String, required: true },
  },
  address: {
    number: String,
    street: String,
    city: String,
    state: String,
    zip: String,
    country: { type: String, default: "India" },
  },
  socialMediaLinks: {
    facebook: { type: String },
    instagram: { type: String },
    twitter: { type: String },
  },
  description: { type: String },
  isDeleted: { type: Boolean, default: false },
  deletedAt:{Date}
});

const Shop = mongoose.model("Shop", shopBasicSchema);

export default Shop;
