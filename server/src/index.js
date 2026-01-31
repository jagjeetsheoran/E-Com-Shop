import express from 'express';
import dotenv from 'dotenv';
import authRoutes from './Routes/auth.routes.js';
import orderRoutes from './Routes/order.routes.js';
import connectDB from './lib/connect.db.js';
import productRoute from './Routes/product.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import fs from 'fs';  
import path from 'path';
const __dirname = path.resolve();

// Ensure upload directories exist
fs.mkdirSync(path.join(__dirname, "uploads"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "herobanners"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "product"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "review"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "temp"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "brand"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "uploads", "refunds"), { recursive: true });

dotenv.config(); // Load env variables first

const app = express();

app.use(cookieParser());
const allowedOrigins = process.env.WEBURL.split(",");

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without origin (mobile apps, curl, postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
}));

const PORT = process.env.PORT || 8080;

// Increase payload size limit for file uploads (50MB limit)
app.use(express.json({ limit: '50mb' }));
app.use("/uploads", express.static("uploads"));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/', authRoutes);
app.use('/p', productRoute);
app.use('/od', orderRoutes);

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on port ${PORT}`);
});