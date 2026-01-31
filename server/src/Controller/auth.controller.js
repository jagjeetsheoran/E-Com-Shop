import User from "../DB-Models/user.model.js";
import bcrypt from "bcrypt";
import generateToken from "../lib/generate.token.js";
import Herobanner from "../DB-Models/herobanner.model.js";
import SupperCustomer from "../DB-Models/supper.customer.model.js";
import fs from "fs/promises";
import path from "path";

export const getSupperCustomers = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { status } = req.query;

    if (
      !status ||
      status.trim() === "" ||
      (status !== "pending" && status !== "approved" && status !== "rejected")
    ) {
      return res
        .status(400)
        .json({ message: "Status query parameter is required" });
    }
    const limit = 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const supperCustomers = await SupperCustomer.find({ status })
      .skip(skip)
      .limit(limit);
    res.status(200).json(supperCustomers);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const acceptSupperCustomerStatus = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { requestId } = req.params;
    if (!requestId) {
      return res.status(400).json({ message: "Request ID is required" });
    }
    const supperCustomerRequest = await SupperCustomer.findById(requestId);
    if (!supperCustomerRequest) {
      return res
        .status(404)
        .json({ message: "Supper customer request not found" });
    }
    const SupperCustomerUser = await User.findById(
      supperCustomerRequest.userId
    );
    if (!SupperCustomerUser) {
      return res.status(404).json({ message: "User not found" });
    }
    SupperCustomerUser.role = "supper-customer";
    SupperCustomerUser.gstNumber = supperCustomerRequest.gst;
    await SupperCustomerUser.save();
    supperCustomerRequest.status = "approved";
    supperCustomerRequest.isRegistered = true;
    const newRequest = await supperCustomerRequest.save();
    res
      .status(200)
      .json({ message: "Status updated successfully", request: newRequest });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const rejectSupperCustomerStatus = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { requestId } = req.params;
    if (!requestId) {
      return res.status(400).json({ message: "Request ID is required" });
    }
    const supperCustomerRequest = await SupperCustomer.findById(requestId);
    if (!supperCustomerRequest) {
      return res
        .status(404)
        .json({ message: "Supper customer request not found" });
    }
    const supperCustomerUser = await User.findOne({
      _id: supperCustomerRequest.userId.toString(),
    });
    if (!supperCustomerUser) {
      return res.status(404).json({ message: "User not found" });
    }
    supperCustomerUser.role = "customer";
    supperCustomerUser.gstNumber = "";
    await supperCustomerUser.save();
    supperCustomerRequest.status = "rejected";
    supperCustomerRequest.isRegistered = false;
    const newRequest = await supperCustomerRequest.save();
    res
      .status(200)
      .json({ message: "Status updated successfully", request: newRequest });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const requestForSupperCustomer = async (req, res) => {
  try {
    const user = req.user;
    const { gst, companyName, email, phone } = req.body;
    if (!gst || !companyName) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const existingRequest = await SupperCustomer.findOne({ gst });
    if (existingRequest && existingRequest.status === "pending") {
      return res.status(409).json({ message: "Your request is still pending" });
    }
    if (existingRequest && existingRequest.status === "approved") {
      return res
        .status(409)
        .json({ message: "You are already a supper customer" });
    }
    const url = `https://sheet.gstincheck.co.in/check/${process.env.GST_API_KEY}/${gst}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API Failed: ${response.status}`);
    }
    const responseData = await response.json();
    const newRequest = new SupperCustomer({
      userId: user._id,
      legalName: responseData.data.lgnm,
      gst: responseData.data.gstin,
      companyName,
      traideLicenseName: responseData.data.tradeNam,
      companyAddress: responseData.data.pradr.adr,
      businessType: responseData.data.nba,
      phone: phone || user.phone,
      email: email || user.email,
      isRegistered: true,
      status: "pending",
    });
    await newRequest.save();
    res.status(201).json({ message: "Request submitted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getgstInfo = async (req, res) => {
  try {
    const user = req.user;
    const { gst } = req.params;
    let isRegistered = false;
    if (!gst) {
      return res.status(400).json({ message: "GST is required" });
    }
    const url = `https://sheet.gstincheck.co.in/check/${process.env.GST_API_KEY}/${gst}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API Failed: ${response.status}`);
    }
    const responseData = await response.json();
    const useexisting = await SupperCustomer.findOne({ gst: gst });
    if (useexisting && useexisting.isRegistered === true) {
      isRegistered = true;
    }
    if (responseData.flag === false) {
      return res.status(404).json({ message: "Invalid GST Number" });
    }
    const gstdata = {
      isRegistered,
      gstin: responseData.data.gstin,
      legalName: responseData.data.lgnm,
      traideLicenseName: responseData.data.tradeNam,
      businessType: responseData.data.nba,
      address: responseData.data.pradr.adr,
      address2: responseData.data.pradr.addr,
    };
    res.status(200).json(gstdata);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const exportUserData = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const users = await User.find({
      role: { $in: ["customer", "supper-customer"] },
    }).select("name email phone");
    res.status(200).json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
export const exportProductData = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const products = await Product.find();
    res.status(200).json(products);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const exportOrderData = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const orders = await Order.find({ status: { $ne: "paymentInitiated" } });
    res.status(200).json(orders);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const exportSuperUsers = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const superUsers = await User.find({ role: "supper-customer" }).select(
      "name email phone role gstNumber"
    );
    res.status(200).json(superUsers);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const exportShopUserData = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const users = await User.find({ role: "shop-user" }).select(
      "name email phone shop"
    );
    res.status(200).json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const exportShopData = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const shops = await Shop.find();
    res.status(200).json(shops);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getDeletedHeroBanners = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const limit = 20; // Add a reasonable limit
    const banners = await Herobanner.find({ isDeleted: true })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.status(200).json({ banners });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const toggleDeleteHeroBanner = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { bannerId } = req.body;
    const banner = await Herobanner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({ message: "Hero banner not found" });
    }
    banner.isDeleted = !banner.isDeleted;
    await banner.save();
    res
      .status(200)
      .json({ message: "Hero banner updated successfully", banner });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getHeroBanners = async (req, res) => {
  try {
    const banners = await Herobanner.find({ isDeleted: false });
    res.status(200).json({ banners });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const addHeroBanner = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const {
      imageUrlDesk,
      imageUrlMobile,
      imageUrlTablet,
      title,
      brand,
      subTitle,
      buttonText,
      buttonLink,
    } = req.body;
    if (
      title.trim() === "" ||
      brand.trim() === "" ||
      subTitle.trim() === "" ||
      buttonLink.trim() === "" ||
      buttonText.trim() === "" ||
      imageUrlDesk.trim() === "" ||
      imageUrlMobile.trim() === "" ||
      imageUrlTablet.trim() === ""
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const oldPathDeskImage = path.join("uploads/temp", imageUrlDesk);
    const newPathDeskImage = path.join(
      "uploads/herobanners",
      imageUrlDesk.replace(
        "temp_",
        `herobanner_${title.replace(" ", "-").toLowerCase()}_desktop`
      )
    );
    await fs.rename(oldPathDeskImage, newPathDeskImage);

    const oldPathMobileImage = path.join("uploads/temp", imageUrlMobile);
    const newPathMobileImage = path.join(
      "uploads/herobanners",
      imageUrlMobile.replace(
        "temp_",
        `herobanner_${title.replace(" ", "-").toLowerCase()}_mobile`
      )
    );
    await fs.rename(oldPathMobileImage, newPathMobileImage);
    const oldPathTabletImage = path.join("uploads/temp", imageUrlTablet);
    const newPathTabletImage = path.join(
      "uploads/herobanners",
      imageUrlTablet.replace(
        "temp_",
        `herobanner_${title.replace(" ", "-").toLowerCase()}_tablet`
      )
    );
    await fs.rename(oldPathTabletImage, newPathTabletImage);

    const newBanner = new Herobanner({
      imageUrlDesk: newPathDeskImage,
      imageUrlMobile: newPathMobileImage,
      imageUrlTablet: newPathTabletImage,
      title,
      subTitle,
      brand,
      buttonText,
      buttonLink,
    });
    await newBanner.save();
    res
      .status(201)
      .json({ message: "Hero banner added successfully", newBanner });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const searchShopUsers = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { query } = req.query;
    if (!query || query.trim() === "") {
      getAllShopUsers(req, res);
      return;
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapeRegex(query), "i");
    const users = await User.find({
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { "shop.shopName": regex },
        { "shop.shopNumber": regex },
      ],
      role: "shop-user",
    });

    res.status(200).json({ users });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const searchShops = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { query } = req.query;
    if (!query || query.trim() === "") {
      getAllShops(req, res);
      return;
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapeRegex(query), "i");

    const shops = await Shop.find({
      $or: [
        { shopName: regex },
        { shopNumber: regex },
        { "contactDetails.email": regex },
        { "contactDetails.phone": regex },
      ],
    });
    res.status(200).json({ shops });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
import qrcode from "qrcode";
import speakeasy from "speakeasy";
import jwt from "jsonwebtoken";
const _TwoFAuthentication = (req, res, user, qrcodeUrl) => {
  try {
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "10min",
    });
    res.cookie("_2faCookie", token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60 * 1000,
    });

    res.status(200).json({
      message: "2FA verification required",
      varificationNeeded: true,
      qrcodeUrl,
    });
  } catch (error) {
    res.status(500).json({ message: "2FA Error", error: error.message });
  }
};
export const verify2FA = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = req.user;
    const isVerified = speakeasy.totp.verify({
      secret: user.ascii,
      encoding: "ascii",
      token: otp,
      window: 1,
    });
    if (!isVerified) {
      return res.status(401).json({ message: "Invalid 2FA code" });
    }
    user.isTwoFAEnabled = true;
    await user.save();
    const { password: _, ...userData } = user.toObject();
    generateToken(userData._id, res);
    return res
      .status(200)
      .json({ message: "2FA verification successful", user: userData });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: "User account is deleted" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // --- ROLE BASED 2FA ---
    if (user.role === "shop-user" || user.role === "admin") {
      // Case 1: No 2FA secret yet → generate and return QR
      if (!user.ascii || user.isTwoFAEnabled === false) {
        const secret = speakeasy.generateSecret({
          name: `Shop-E-com (${user.email})`,
        });

        const qrcodeUrl = await qrcode.toDataURL(secret.otpauth_url);

        user.ascii = secret.ascii;
        await user.save();
        return _TwoFAuthentication(req, res, user, qrcodeUrl);
      }

      // Case 2: User already has 2FA → go to verification step
      return _TwoFAuthentication(req, res, user);
    }

    // NORMAL USER LOGIN
    const { password: _, ...userData } = user.toObject();
    generateToken(userData._id, res);
    return res
      .status(200)
      .json({ message: "Login successful", user: userData });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const adminDashboardData = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const totalUsers = await User.countDocuments({ isDeleted: false });
    const totalShopUsers = await User.countDocuments({
      role: "shop-user",
      isDeleted: false,
    });
    const totalShops = await Shop.countDocuments({ isDeleted: false });
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments({
      status: { $ne: "paymentInitiated" },
    });
    const totalCategories = await Category.countDocuments({ deleted: false });
    const totalBrands = await Brand.countDocuments({ deleted: false });
    const deltedProducts = await Product.countDocuments({ deleted: true });
    const stats = [
      { title: "Total Users", value: totalUsers },
      { title: "Total Products", value: totalProducts },
      { title: "Total Orders", value: totalOrders },
      { title: "Total Categories", value: totalCategories },
      { title: "Total Brands", value: totalBrands },
      { title: "Deleted Products", value: deltedProducts },
      { title: "Total Shops", value: totalShops },
      { title: "Shop Users", value: totalShopUsers },
    ];
    const deliveredOrders = await Order.countDocuments({
      status: "delivered",
    });
    const prepaingoOrders = await Order.countDocuments({
      status: "shipment-preparation",
    });
    const shippedOrders = await Order.countDocuments({
      status: "shipped",
    });
    const pendingOrders = await Order.countDocuments({
      status: "pending",
    });
    const cancelledOrders = await Order.countDocuments({
      status: "cancelled",
    });
    const returnedOrders = await Order.countDocuments({
      status: "returned",
    });
    const orderStatusData = [
      { status: "delivered", count: deliveredOrders },
      { status: "shipment-preparation", count: prepaingoOrders },
      { status: "pending", count: pendingOrders },
      { status: "cancelled", count: cancelledOrders },
      { status: "returned", count: returnedOrders },
      { status: "shipped", count: shippedOrders },
    ];
    res.status(200).json({ stats, orderStatusData });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const register = async (req, res) => {
  try {
    const { name, email, phone, password, profilePicture } = req.body;
    const role = "customer";

    // Validate input
    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, phone, and password are required" });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isDeleted === false) {
      return res.status(409).json({ message: "Email already in use" });
    }
    // todo: upload profile picture
    // if (profilePicture) {
    //   const uploadResult = await cloudinary.uploader.upload(profilePicture, {
    //     folder: "profile_pictures",
    //     allowed_formats: ["jpg", "png", "jpeg"],
    //     transformation: [{ width: 500, height: 500, crop: "limit" }],
    //   });
    //   profilePicture = uploadResult.secure_url;
    // }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      profilePicture,
    });
    await newUser.save();
    const { password: userPassword, ...userData } = newUser.toObject();
    generateToken(userData._id, res);
    res
      .status(201)
      .json({ message: "User registered successfully", user: userData });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const shopuserRegister = async (req, res) => {
  try {
    const requser = req.user;
    const { name, email, password, shopId, phone, role, profilePicture } =
      req.body;
    if (requser.role !== "admin") {
      return res
        .status(404)
        .json({ message: "only admin can create shop user" });
    }

    // Validate input
    if (!name || !email || !password || !shopId) {
      return res
        .status(400)
        .json({ message: "Name, email, Shop, and password are required" });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }
    // todo: upload profile picture
    // if (profilePicture) {
    //   const uploadResult = await cloudinary.uploader.upload(profilePicture, {
    //     folder: "profile_pictures",
    //     allowed_formats: ["jpg", "png", "jpeg"],
    //     transformation: [{ width: 500, height: 500, crop: "limit" }],
    //   });
    //   profilePicture = uploadResult.secure_url;
    // }
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(400).json({ message: "shop data not found" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = new User({
      name,
      email,
      phone,
      shop: {
        shopName: shop.shopName,
        shopNumber: shop.shopNumber,
        shopId: shop._id,
      },
      password: hashedPassword,
      role,
      profilePicture,
    });
    await newUser.save();
    const { password: userPassword, ...userData } = newUser.toObject();
    res
      .status(201)
      .json({ message: "User registered successfully", user: userData });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const shopRegister = async (req, res) => {
  try {
    const user = req.user;
    if (user.role != "admin") {
      return res
        .status(404)
        .json({ message: "only admin can create new shop" });
    }
    const {
      shopName,
      description,
      shopNumber,
      shopLogo,
      email,
      phone,
      number,
      street,
      state,
      city,
      zip,
      facebook,
      instagram,
      twitter,
    } = req.body;
    const country = "India";
    // Validate input
    if (
      !shopName ||
      !shopNumber ||
      !email ||
      !phone ||
      !number ||
      !street ||
      !state ||
      !city ||
      !zip
    ) {
      return res.status(400).json({ message: "all fields are required" });
    }
    const existingshop = await Shop.findOne({ shopName, shopNumber });
    if (existingshop) {
      return res.status(409).json("shop alerady exists");
    }
    const newshop = new Shop({
      shopName,
      shopNumber,
      shopLogo,
      contactDetails: {
        email,
        phone,
      },
      description,
      socialMediaLinks: {
        facebook,
        instagram,
        twitter,
      },
      address: {
        number,
        street,
        state,
        city,
        zip,
        country,
      },
    });
    await newshop.save();
    res
      .status(200)
      .json({ message: "Shop registered successfully", shop: newshop });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getAllShops = async (req, res) => {
  try {
    const user = req.user;
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    if (user.role != "admin") {
      return res
        .status(404)
        .json({ message: "only admin can fetch shop users data" });
    }
    const shops = await Shop.find().skip(skip).limit(limit);
    res.status(200).json({ message: "shop fetched", shops });
  } catch (error) {
    return res.status(500).json({ message: "unable to get the shop data" });
  }
};

export const updateShop = async (req, res) => {
  try {
    const user = req.user;
    if (user.role != "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const {
      shopName,
      description,
      shopNumber,
      shopLogo,
      email,
      phone,
      number,
      street,
      state,
      city,
      zip,
      facebook,
      instagram,
      twitter,
    } = req.body;
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }
    shop.shopName = shopName;
    shop.shopNumber = shopNumber;
    shop.shopLogo = shopLogo;
    shop.description = description;
    shop.contactDetails = { email, phone };
    shop.address = { number, street, state, city, zip, country: "India" };
    shop.socialMediaLinks = { facebook, instagram, twitter };
    await shop.save();
    res.status(200).json({ message: "Shop updated successfully", shop });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const deleteShop = async (req, res) => {
  try {
    const user = req.user;
    if (user.role != "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { shopId } = req.params;
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }
    shop.isDeleted = true;
    shop.deletedAt = new Date();
    await User.updateMany(
      { "shop.shopId": shop._id },
      { isDeleted: true, deletedAt: new Date() }
    );
    const shopusers = await User.find({ "shop.shopId": shop._id });
    await shop.save();
    res
      .status(200)
      .json({ message: "Shop deleted successfully", shop, shopusers });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const restoreShop = async (req, res) => {
  try {
    const user = req.user;
    if (user.role != "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { shopId } = req.params;
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }
    shop.isDeleted = false;
    shop.deletedAt = null;
    await User.updateMany(
      { "shop.shopId": shop._id },
      { isDeleted: false, deletedAt: null }
    );
    const shopusers = await User.find({ "shop.shopId": shop._id });
    await shop.save();
    res
      .status(200)
      .json({ message: "Shop restored successfully", shop, shopusers });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getAllShopUsers = async (req, res) => {
  try {
    const user = req.user;
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Access denied. Only admins can view shop users." });
    }
    const users = await User.find({ role: "shop-user" })
      .skip(skip)
      .limit(limit);
    res.status(200).json({ users });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const deleteShopUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = req.user;
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Access denied. Only admins can delete shop users." });
    }
    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return res.status(404).json({ message: "User not found" });
    }
    if (userToDelete.isDeleted) {
      const shopisdeleted = await Shop.findById(userToDelete.shop.shopId);
      if (shopisdeleted && shopisdeleted.isDeleted) {
        return res.status(400).json({
          message:
            "Cannot restore user of a deleted shop. Please restore the shop first. Or change the shop for this user",
        });
      }
    }
    const deleteStatus = !userToDelete.isDeleted;
    await User.findByIdAndUpdate(userId, {
      isDeleted: deleteStatus,
      deletedAt: new Date(),
    });
    res.status(200).json({ message: "Shop user deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const updateImageforAdmin = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
      message: "Image uploaded successfully",
      url: `${req.file.filename}`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const logout = (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const checkAuth = async (req, res) => {
  try {
    const user = req.user;
    res.status(200).json({ message: "User is authenticated", user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const addAddress = async (req, res) => {
  try {
    const user = req.user;
    const { name, phone, house, street, city, state, zip } = req.body;

    // 1️⃣ Set all existing addresses to recentlyUsed: false
    await User.updateOne(
      { _id: user._id },
      { $set: { "addresses.$[].recentlyUsed": false } }
    );

    // 2️⃣ Create new address
    const newAddress = {
      name,
      phone,
      house,
      street,
      city,
      state,
      zip,
      country: "India",
      recentlyUsed: true,
    };

    // 3️⃣ Add new address
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $push: { addresses: newAddress } },
      { new: true }
    );

    res
      .status(201)
      .json({ message: "Address added successfully", user: updatedUser });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const changeAddress = async (req, res) => {
  try {
    const user = req.user;
    const { addressId } = req.params;
    // 1️⃣ Set all existing addresses to recentlyUsed: false
    await User.updateOne(
      { _id: user._id },
      { $set: { "addresses.$[].recentlyUsed": false } }
    );
    // 2️⃣ Set the selected address to recentlyUsed: true
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, "addresses._id": addressId },
      { $set: { "addresses.$.recentlyUsed": true } },
      { new: true }
    );

    res
      .status(200)
      .json({ message: "Address changed successfully", user: updatedUser });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const setOrderforSuperCoustmorer = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "supper-customer") {
      return res.status(403).json({
        message: "Access denied. Only super customers can place orders.",
      });
    }
    const orderId = _orderId();
    await _createOrderDb(orderId, user._id);
    await _placeOrder(orderId);
    res.status(200).json({
      message: "Order placed successfully -  waiting for confirmation to shop ",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// order related controllers

const _createOrderDb = async (orderId, userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.cart || user.cart.totalItems === 0) {
      throw new Error("Cart is empty");
    }
    const deliveryAddress = user.addresses.find((addr) => addr.recentlyUsed);
    if (!deliveryAddress) throw new Error("No delivery address selected");
    // Fetch product details properly
    const products = [];
    for (const item of user.cart.items) {
      const p = await Product.findById(item.productId);

      // ✅ safer condition (handles boolean or string stock)
      if (p && !p.deleted && p.stock === "in_stock") {
        if (item.quantity >= p.maxQuantity) {
          throw new Error(
            `Quantity for product ${p.title} exceeds maximum order limit`
          );
        }
        let discountedPrice = p.price.regular || 1;
        for (const tear in p.price.discounted) {
          if (item.quantity >= parseInt(p.price.discounted[tear].quantity)) {
            discountedPrice = p.price.discounted[tear].price;
          }
        }
        products.push({
          title: p.title,
          thumbnail: p.thumbnail,
          productId: p._id,
          quantity: item.quantity,
          price: {
            regular: p.price.regular,
            discounted: discountedPrice,
          },
          maxQuantity: p.maxQuantity,
          totalPrice: item.quantity * discountedPrice,
          shop: {
            shopId: p.shop.shopId,
            shopName: p.shop.shopName,
            shopNumber: p.shop.shopNumber,
          },
        });
      }
    }
    if (products.length === 0) {
      throw new Error("No valid products in cart to create order");
    }
    const order = await Order.create({
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone,
      },
      orderId: orderId,
      products: products,
      deliveryAddress: deliveryAddress,
      totalItems: products.map((p) => p.quantity).reduce((a, b) => a + b, 0),
      totalAmount: products.map((p) => p.totalPrice).reduce((a, b) => a + b, 0),
      status: "paymentInitiated",
      paymentType: "onlinepayment",
    });
    return order.totalAmount;
  } catch (error) {
    throw new Error(error.message || "Internal Server Error");
  }
};

export const _placeOrder = async (orderId) => {
  try {
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      throw new Error("Order not found");
    }
    const user = await User.findById(order.user._id);
    if (user.role === "supper-customer") {
      order.include = false;
    }
    // Update order status to "shipment-preparation"
    order.status = "shipment-preparation";
    await User.findByIdAndUpdate(order.user._id, {
      $set: { cart: { items: [], totalItems: 0, totalPrice: 0 } },
    });
    await order.save();
  } catch (error) {
    throw new Error(error.message || "Internal Server Error");
  }
};

export const searchOrders = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "shop-user" && user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Access denied. Only shop users can search orders." });
    }
    const { query } = req.query;
    if (!query || query.trim() === "") {
      getOrder(req, res);
      return;
    }
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapeRegex(query), "i");
    const orders = await Order.find({
      orderId: regex,
      status: { $ne: "paymentInitiated" },
    }).sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};





export const getSupperOrders = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({
        message: "Access denied. Only admins can view supper orders.",
      });
    }
    const orders = await Order.find({
      "user.role": "supper-customer",
      include: false,
      status: "shipment-preparation",
    }).sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const orderToInclude = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { include } = req.body;
    const user = req.user;
    if (!orderId || include === undefined) {
      return res
        .status(400)
        .json({ message: "orderId and include are required" });
    }
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Only shop users can update orders." });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status === "delivered") {
      return res
        .status(400)
        .json({ message: "Cannot update include of a delivered order." });
    }
    if (include === false) {
      order.status = "cancelled";
      order.include = false;
    } else {
      order.status = "shipment-preparation";
      order.include = true;
    }
    await order.save();
    res.status(200).json({
      message: "Order include status updated successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// payment related controllers

import crypto from "crypto";
import dotenv from "dotenv";
import Order from "../DB-Models/order.model.js";
import Product from "../DB-Models/product.model.js";
import Shop from "../DB-Models/shop.model.js";
import Category from "../DB-Models/categori.model.js";
import Brand from "../DB-Models/brand.model.js";
import e from "express";
dotenv.config();

const _orderId = () => {
  const uniqueId = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(uniqueId).digest("hex");
  const orderId = `order_${hash}`;
  return orderId.substring(0, 20);
};

export const getSessionId = async (req, res) => {
  try {
    const orderId = _orderId();
    const user = req.user;
    if (!user.cart || user.cart.totalItems === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    const requestData = {
      order_amount: user.cart.totalPrice,
      order_currency: "INR",
      order_id: orderId,
      customer_details: {
        customer_id: user._id.toString(),
        customer_phone: user.phone,
        customer_email: user.email,
        customer_name: user.name,
      },
      order_meta: {
        return_url: `https://yourwebsite.com/return?order_id=${orderId}`,
      },
    };

    const response = await fetch("https://sandbox.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "x-client-id": process.env.X_CLIENT_ID,
        "x-client-secret": process.env.X_SECRET_KEY,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });

    // Parse JSON response
    const responseData = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(responseData);
    }
    if (!responseData.payment_session_id || !responseData.order_id) {
      return res.status(500).json({
        message: "Failed to create payment session",
        error: "Missing payment_session_id or order_id in response",
      });
    }
    const totalAmount = await _createOrderDb(responseData.order_id, user._id);
    if (totalAmount !== requestData.order_amount) {
      return res.status(500).json({
        message: "Order amount mismatch",
        error: "Calculated order amount does not match requested amount",
      });
    }
    res.status(200).json({
      message: "Order Created successfully",
      payment_session_id: responseData.payment_session_id,
      order_id: responseData.order_id,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message || error,
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { order_id } = req.params; // e.g., from /verify/:order_id
    const user = req.user;
    if (!order_id) {
      return res.status(400).json({ message: "order_id is required" });
    }
    const response = await fetch(
      `https://sandbox.cashfree.com/pg/orders/${order_id}`,
      {
        method: "GET",
        headers: {
          "x-client-id": process.env.X_CLIENT_ID,
          "x-client-secret": process.env.X_SECRET_KEY,
          "x-api-version": "2023-08-01",
          "Content-Type": "application/json",
        },
      }
    );
    const data = await response.json();
    if (response.ok) {
      // Example structure: data.order_status = "PAID"
      if (data.order_status === "PAID") {
        if (
          user._id.toString() === data.customer_details.customer_id.toString()
        ) {
          _placeOrder(order_id);
          return res.status(200).json({ success: true, result: data });
        } else {
          return res.status(403).json({
            success: false,
            message: "Unauthorized payment verification attempt",
          });
        }
      } else {
        // ❌ Payment not completed
        await Order.findOneAndUpdate(
          { orderId: order_id },
          { status: "failed" }
        );
        return res.status(400).json({
          success: false,
          message: "Payment not completed",
          result: data,
        });
      }
    } else {
      await Order.findOneAndUpdate({ orderId: order_id }, { status: "failed" });
      return res
        .status(500)
        .json({ success: false, message: "Failed to verify payment", data });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
