import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
  name: String,
  phone: String,
  house: String,
  street: String,
  city: String,
  state: String,
  zip: String,
  country: { type: String, default: "India" },
  recentlyUsed: { type: Boolean, default: false },
});

const cartSchema = new mongoose.Schema({
  thumbnail: String,
  title: String,
  price: {
    regular: { type: Number, required: true },
    discounted: { type: Number, required: true },
  },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  quantity: { type: Number, default: 1 },
  inStock: { type: Boolean, default: true },
});


const userSchema = new mongoose.Schema(
  {
    ascii: {
      type: String,
      default: "",
    },
    isTwoFAEnabled: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    shop: {
      shopId: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
      shopName: { type: String },
      shopNumber: { type: String },
    },
    password: {
      type: String,
      required: true,
    },
    resentPasswords: [{ type: String }],
    role: {
      type: String,
      enum: ["customer","supper-customer", "shop-user", "admin"],
      default: "customer",
    },
    profilePicture: {
      type: String,
      default: "",
    },
    gstNumber: {
      type: String,
      default: "",
    },
    cart: {
      items: [cartSchema],
      totalItems: {
        type: Number,
        default: 0,
      },
      totalPrice: {
        type: Number,
        default: 0,
      },
    },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    addresses: [addressSchema],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    recentlyViewed: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
