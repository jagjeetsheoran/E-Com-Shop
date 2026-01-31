import mongoose from "mongoose";

const supperCustomerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    legalName:{ type: String, required: true },
    gst:{ type: String, required: true, unique: true },
    companyName:{ type: String, required: true },
    traideLicenseName:{ type: String, required: true },
    companyAddress:{type: String, required: true },
    businessType:[{ type: String }],
    phone:{ type: String, required: true },
    email:{ type: String, required: true },
    isRegistered:{ type: Boolean, default: false },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);
const SupperCustomer = mongoose.model("SupperCustomer", supperCustomerSchema);

export default SupperCustomer;