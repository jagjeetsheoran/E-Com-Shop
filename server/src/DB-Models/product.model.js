import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  shop: {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
    shopName: { type: String },
    shopNumber: { type: String },
  },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, enum: ["shop-user", "admin"], default: "shop-user" },
});

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    addedBy: userSchema,

    specification: [
      {
        key: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],

    description: { type: String, required: true },

    price: {
      regular: { type: Number, required: true },
      discounted: [
        {
          quantity: { type: Number, required: true },
          price: { type: Number, required: true },
        },
      ],
    },

    maxQuantity:{ type: Number, required: true },

    category: {
      supercategory: { type: String, required: true },
      category: { type: String, required: true },
      subcategory: { type: String, required: true },
    },

    brand: {
      name: { type: String, required: true },
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
      },
    },

    thumbnail: { type: String },
    shop: {
      shopId: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" },
      shopName: { type: String },
      shopNumber: { type: String },
    },
    image: [{ type: String }],

    stock: {
      type: String,
      enum: ["in_stock", "out_of_stock", "pre_order"],
      default: "in_stock",
      required: true,
    },

    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      total: { type: Number, default: 0 },
    },

    reviews: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        userName: { type: String, required: true },
        image: [{ type: String }],
        comment: { type: String, required: true },
        rating: { type: Number, required: true, min: 0, max: 5 },
      },
    ],

    variations: [{ type: String }],
    paymentType: [
      {
        type: String,
        enum: ["cashondelivery", "onlinepayment"],
        default: "onlinepayment",
        required: true,
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
      required: true,
    },

    deleted: { type: Boolean, default: false },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

export default Product;
