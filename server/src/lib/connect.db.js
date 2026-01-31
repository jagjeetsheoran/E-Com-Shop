import mongoose from "mongoose";

const connectDB = async () => {
  mongoose.connect(process.env.MONGO_URI).then(()=>{
    console.log("MongoDB connected successfully " + mongoose.connection.host);
  }).catch((error)=>{
    console.error("MongoDB connection error:", error);
  });
};

export default connectDB;
