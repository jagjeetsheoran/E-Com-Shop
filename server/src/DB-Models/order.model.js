import mongoose from "mongoose";
const productInOrderSchema = new mongoose.Schema(
    {
        title: {
          type: String,
          required: true,
        },
        thumbnail: {
          type: String,
          required: true,
        },
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          regular: {
            type: Number,
            required: true,
          },
          discounted: {
            type: Number,
            required: true,
          },
        },
        maxQuantity: {
          type: Number,
          required: true,
        },
        totalPrice: {
          type: Number,
          required: true,
        },
        shop: {
          shopId: { type: mongoose.Schema.Types.ObjectId, ref: "Shop" ,required:true}, 
          shopName: { type: String },
          shopNumber: { type: String },
        },
        productStatus: {
          type: String,

          enum: [
            "pending",
            "shipment-preparation",
            "shipped",
            "delivered",
            "cancelled",
            "returned",
            "return-requested",
            "requested",
            "refund-approved",
            "refund-rejected",
            "refunded",
            "failed",
          ],
          default: "pending",
        },
        shopApproved: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        return:{
        returnReason: { type: String },
        returnDescription: { type: String },
        returnRequestDate: { type: Date },
        returnApprovedDate: { type: Date },
        returnRejectedDate: { type: Date },
        images: [{ type: String }],
        rejectionReason: { type: String},
        },
        trackingLink: { type: String },
        approvedBy:{
          _id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          name: { type: String },
        },
        description: { type: String },
      },
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      role: {
        type: String,
        required: true,
        enum: ["customer", "supper-customer"],
        default: "customer",
      },
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },
    // invoiceNo: {
    //   type: String,
    //   required: true,
    //   unique: true,
    // },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    include: {
      type: Boolean,
      default: true,
    },
    products: [productInOrderSchema],
    deliveryAddress: {
      name: String,
      phone: String,
      house: String,
      street: String,
      city: String,
      state: String,
      zip: String,
    },
    totalItems: {
      type: Number,
      required: true,
    },
    trackingLink: {
      type: String,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,

      enum: [
        "paymentInitiated",
        "partial-pending",
        "pending",
        "partial-shipment-preparation",
        "shipment-preparation",
        "partial-shipped",
        "shipped",
        "partial-delivered",
        "delivered",
        "partial-cancelled",
        "cancelled",
        "partial-returned",
        "returned",
        "partial-refunded",
        "refunded",
        "failed",
        "rejected",
      ],
      default: "paymentInitiated",
    },
    paymentType: {
      type: String,
      enum: ["cashondelivery", "onlinepayment"],
      default: "onlinepayment",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);
const Order = mongoose.model("Order", orderSchema);

export default Order;
