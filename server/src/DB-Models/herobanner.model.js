import mongoose from "mongoose";

const heroBannerSchema = new mongoose.Schema({
    imageUrlDesk: { type: String, required: true },
    imageUrlMobile: { type: String, required: true },
    imageUrlTablet: { type: String, required: true },
    title: { type: String },
    subTitle: { type: String },
    brand: { type: String },
    buttonText: { type: String },
    buttonLink: { type: String },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true }
);

const Herobanner = mongoose.model("Herobanner", heroBannerSchema);

export default Herobanner;