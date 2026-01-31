import mongoose from "mongoose";
import Brand from "../DB-Models/brand.model.js";
import Category from "../DB-Models/categori.model.js";
import Product from "../DB-Models/product.model.js";
import User from "../DB-Models/user.model.js";
import jwt from "jsonwebtoken";
import Order from "../DB-Models/order.model.js";
import fs from "fs";
import path from "path";

export const reviewProduct = async (req, res) => {
  try {
    const user = req.user;
    const { rating, images, comment } = req.body;
    const { productId } = req.params;
    if (!productId || !rating) {
      return res
        .status(400)
        .json({ message: "Product ID and rating are required" });
    }
    const product = await Product.findById(productId);
    if (!product || product.deleted) {
      return res.status(404).json({ message: "Product not found" });
    }
    const orders = await Order.findOne({
      "user._id": user._id,
      "products.productId": productId,
      status: "delivered",
    });
    if (!orders) {
      return res.status(403).json({
        message:
          "You can only review products you have purchased and received.",
      });
    }
    let storedImage = [];
    if (images && images.length > 0) {
      for (const img of images) {
        const oldPath = path.join("uploads/temp", img);
        const newPath = path.join(
          "uploads/review",
          img.replace("temp_", `review_${user._id}_to_${productId}_product_`)
        );
        fs.renameSync(oldPath, newPath);
        storedImage.push(newPath);
      }
    }
    if (comment) {
      const newReview = {
        user: user._id,
        userName: user.name,
        rating,
        images: storedImage,
        comment,
      };
      product.reviews.push(newReview);
    }

    const totalratings = product.ratings.total + 1;
    product.ratings.average = Number(
      (
        (product.ratings.average * product.ratings.total + rating) /
        totalratings
      ).toFixed(2)
    );
    product.ratings.total = totalratings;
    await product.save();
    res.status(201).json({ message: "Review added successfully", product });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const { query, maxprice, brand, categories, minrating } = req.query;

    const limit = 12;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query is required" });
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(escapeRegex(query), "i");

    // --------------------
    // Build Dynamic Filters
    // --------------------
    const filters = {
      deleted: false,
      status: "active",
      $or: [
        { title: regex },
        { description: regex },
        { "specification.value": regex },
        { "category.supercategory": regex },
        { "category.category": regex },
        { "category.subcategory": regex },
        { "brand.name": regex },
      ],
    };

    // Add price filter only if provided
    if (maxprice) {
      filters["price.discounted.0"] = { $lte: Number(maxprice) };
    }

    // Add brand filter only if provided
    if (brand) {
      filters["brand.name"] = brand;
    }

    // Add categories filter (comma separated list)
    if (categories) {
      const list = categories.split(",");
      filters["category.category"] = { $in: list };
    }

    // Rating filter
    if (minrating) {
      filters["ratings.average"] = { $gte: Number(minrating) };
    }

    // --------------------
    // Query
    // --------------------
    const products = await Product.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const searchProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const products = await Product.find({
      deleted: false,
      status: "active",
      $or: [
        { supercategory: category },
        { category: category },
        { subcategory: category },
      ],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const searchProductsForAdmin = async (req, res) => {
  try {
    const user = req.user; // Retrieved from authMiddleware
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. You are not authorized to perform this action.",
      });
    }
    const { searchTerm, category, subcategory, subSubcategory, status, brand } =
      req.body;
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    // Helper function to check if a value is valid (not empty, not 'all')
    const isValid = (value) => {
      return value && value.trim() !== "" && value !== "all";
    };

    let products = [];

    if (isValid(searchTerm)) {
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapeRegex(searchTerm), "i");
      const all = await Product.find({
        $or: [
          { title: regex },
          { description: regex },
          { "specification.value": regex },
          { "category.supercategory": regex },
          { "category.category": regex },
          { "category.subcategory": regex },
          { "brand.name": regex },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Apply additional filters only if they are valid
      products = all.filter((p) => {
        const matchesCategory =
          !isValid(category) || p.category.supercategory === category;
        const matchesSubcategory =
          !isValid(subcategory) || p.category.category === subcategory;
        const matchesSubSubcategory =
          !isValid(subSubcategory) || p.category.subcategory === subSubcategory;
        const matchesStatus = !isValid(status) || p.status === status;
        const matchesBrand = !isValid(brand) || p.brand.name === brand;

        return (
          matchesCategory &&
          matchesSubcategory &&
          matchesSubSubcategory &&
          matchesStatus &&
          matchesBrand
        );
      });
    } else if (isValid(category)) {
      const all = await Product.find({ "category.supercategory": category })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      products = all.filter((p) => {
        const matchesSubcategory =
          !isValid(subcategory) || p.category.category === subcategory;
        const matchesSubSubcategory =
          !isValid(subSubcategory) || p.category.subcategory === subSubcategory;
        const matchesStatus = !isValid(status) || p.status === status;
        const matchesBrand = !isValid(brand) || p.brand.name === brand;

        return (
          matchesSubcategory &&
          matchesSubSubcategory &&
          matchesStatus &&
          matchesBrand
        );
      });
    } else if (isValid(subcategory)) {
      const all = await Product.find({ "category.category": subcategory })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      products = all.filter((p) => {
        const matchesSubSubcategory =
          !isValid(subSubcategory) || p.category.subcategory === subSubcategory;
        const matchesStatus = !isValid(status) || p.status === status;
        const matchesBrand = !isValid(brand) || p.brand.name === brand;

        return matchesSubSubcategory && matchesStatus && matchesBrand;
      });
    } else if (isValid(subSubcategory)) {
      const all = await Product.find({ "category.subcategory": subSubcategory })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      products = all.filter((p) => {
        const matchesStatus = !isValid(status) || p.status === status;
        const matchesBrand = !isValid(brand) || p.brand.name === brand;

        return matchesStatus && matchesBrand;
      });
    } else if (isValid(status)) {
      const all = await Product.find({ status: status })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      products = all.filter((p) => {
        const matchesBrand = !isValid(brand) || p.brand.name === brand;
        return matchesBrand;
      });
    } else if (isValid(brand)) {
      const all = await Product.find({ "brand.name": brand })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      products = all;
    } else {
      getAllProducts(req, res);
      return;
    }

    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getHomeProducts = async (req, res) => {
  try {
    const products = [];
    const categories = await Category.find({});
    for (const cat of categories) {
      const catProducts = await Product.find({
        "category.supercategory": cat.name,
        deleted: false,
        status: "active",
      })
        .sort({ createdAt: -1 })
        .limit(10);
      products.push(...catProducts);
    }
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// client routes
export const getProducts = async (req, res) => {
  try {
    const limit = 10; // Number of products per page
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const products = await Product.find({ deleted: false, status: "active" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getRelatedProducts = async (req, res) => {
  try {
    const { category } = req.params;
    const matchproducts = await Product.aggregate([
      {
        $match: {
          "category.category": category,
          deleted: false,
          status: "active",
        },
      },
      { $sample: { size: 10 } }, // randomly pick 10 docs
    ]);
    const topratedproducts = await Product.find({
      "category.category": category,
      deleted: false,
      status: "active",
    })
      .sort({ rating: -1 }) // sort by highest rating first
      .limit(10);
    res.status(200).json({ matchproducts, topratedproducts });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getSingleProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    const token = req.cookies?.token;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select("-password");
        if (
          (user.role === "admin" && user.role === "shop-user") ||
          user.isDeleted === false
        ) {
          return res
            .status(200)
            .json({ product: await Product.findById(productId) });
        }
        if (user) {
          // Check if product already exists in recentlyViewed
          const alreadyViewed = user.recentlyViewed.find(
            (item) => item.productId.toString() === productId
          );

          if (alreadyViewed) {
            // Update timestamp if already viewed
            await User.updateOne(
              { _id: user._id, "recentlyViewed.productId": productId },
              { $set: { "recentlyViewed.$.viewedAt": new Date() } }
            );
          } else {
            // Add new entry with viewedAt timestamp
            await User.findByIdAndUpdate(user._id, {
              $push: {
                recentlyViewed: {
                  productId,
                  viewedAt: new Date(),
                },
              },
            });
          }
        }
      } catch (err) {
        res.status(401).json({ message: "Invalid token." });
        return;
      }
    }

    const product = await Product.findById(productId);

    if (!product || product.deleted) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({ product });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getRecentlyViewedProducts = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.recentlyViewed) {
      return res.status(200).json({ recentlyViewedProducts: [] });
    }

    // Sort by viewedAt DESCENDING (most recent first)
    const recentlyViewedIds = user.recentlyViewed
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .map((item) => item.productId)
      .slice(1, 10);

    if (recentlyViewedIds.length === 0) {
      return res.status(200).json({ recentlyViewedProducts: [] });
    }

    // Fetch products that match those IDs
    const products = await Product.find({
      _id: { $in: recentlyViewedIds },
      deleted: false,
      status: "active",
    }).lean();

    // Reorder products to match recentlyViewedIds order
    const recentlyViewedProducts = recentlyViewedIds
      .map((id) => products.find((p) => p._id.toString() === id.toString()))
      .filter(Boolean); // remove nulls if any missing

    res.status(200).json({ recentlyViewedProducts });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const addToCart = async (req, res) => {
  try {
    const user = req.user;
    const { productId, quantity } = req.body;
    const product = await Product.findById(productId);

    if (!product) throw new Error("Product not found");

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }
    if (product.stock !== "in_stock") {
  return res.status(400).json({ message: "Not enough stock available" });
}

    if (quantity > product.maxQuantity) {
      return res
        .status(400)
        .json({
          message: `Cannot add more than ${product.maxQuantity} items of this product to the cart.`,
        });
    }
    // Initialize cart if empty
    if (!user.cart) {
      user.cart = { items: [], totalItems: 0, totalPrice: 0 };
    }

    // Check if product already exists in the cart
    const existingItem = user.cart.items.find(
      (item) => item.productId.toString() === productId.toString()
    );

    if (existingItem) {
      // Update quantity
      if (existingItem.quantity + quantity > product.maxQuantity) {
        return res
          .status(400)
          .json({
            message: `Cannot add more than ${product.maxQuantity} items of this product to the cart.`,
          });
      }
      existingItem.quantity += quantity;
      let realPrice = existingItem.price.discounted;
      for (const tier of product.price.discounted) {
        if (existingItem.quantity >= tier.quantity) {
          realPrice = tier.price;
        }
      }
      existingItem.price.discounted = realPrice;
    } else {
      let realPrice = product.price.regular||0;
      for (const tier of product.price.discounted) {
        if (quantity >= tier.quantity) {
          realPrice = tier.price;
        }
      }

      // Add new item
      user.cart.items.push({
        productId,
        title: product.title,
        thumbnail: product.thumbnail,
        price: {
          regular: product.price.regular,
          discounted: realPrice,
        },
        maxQuantity: product.maxQuantity,
        shop: product.shop,
        quantity,
        inStock: product.stock !== "in_stock" ? false : true,
      });
    }

    // Update totalItems and totalPrice
    user.cart.totalItems = user.cart.items.reduce(
      (acc, item) => acc + item.quantity,
      0
    );

    user.cart.totalPrice = user.cart.items.reduce(
      (acc, item) => acc + item.price.discounted * item.quantity,
      0
    );

    await user.save();

    res.status(200).json({ message: "Item added to cart", user: user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "unable to add to cart", error: error.message });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const user = req.user;

    const { cartItemId } = req.body;

    if (!user.cart || user.cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is already empty" });
    }
    if (!cartItemId) {
      return res.status(400).json({ message: "cartItemId is required" });
    }

    let updatedItems = [...user.cart.items];

    // ✅ Remove entire item if cartItemId provided
    if (cartItemId) {
      updatedItems = updatedItems.filter(
        (item) => item._id.toString() !== cartItemId.toString()
      );
    }

    // ✅ Recalculate totals
    const totalItems = updatedItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const totalPrice = updatedItems.reduce(
      (sum, item) => sum + item.price.discounted * item.quantity,
      0
    );

    // ✅ Save updates
    user.cart.items = updatedItems;
    user.cart.totalItems = totalItems;
    user.cart.totalPrice = totalPrice;
    await user.save();

    res.status(200).json({
      message: "Item removed from cart successfully",
      user: user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Unable to remove from cart",
      error: error.message,
    });
  }
};

export const updateCartItemQuantity = async (req, res) => {
  try {
    const { cartItemId, change } = req.body; // change = +1 or -1
    if (!cartItemId || change < 0) {
      return res.status(400).json({
        message: "cartItemId and valid change are required",
      });
    }

    const user = req.user;
    if (!user.cart || user.cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Find the cart item
    const cartItem = user.cart.items.find(
      (item) => item._id.toString() === cartItemId.toString()
    );

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }
    if (cartItem.quantity + change > cartItem.maxQuantity) {
      return res
        .status(400)
        .json({
          message: `Cannot add more than ${cartItem.maxQuantity} items of this product to the cart.`,
        });
    }

// Check stock availability
    const product = await Product.findById(cartItem.productId);
    if (product.stock !== "in_stock") {
      cartItem.inStock = false;
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // Update quantity
    cartItem.quantity = change;

    // If quantity becomes 0 or less, remove the item
    if (cartItem.quantity <= 0) {
      user.cart.items = user.cart.items.filter(
        (item) => item._id.toString() !== cartItemId.toString()
      );
    }
    
    for(const tier of product.price.discounted){
      if(cartItem.quantity>=tier.quantity){
        cartItem.price.discounted=tier.price;
      }
    }

    // Recalculate totals
    user.cart.totalItems = user.cart.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    user.cart.totalPrice = user.cart.items.reduce(
      (sum, item) => sum + item.price.discounted * item.quantity,
      0
    );

    await user.save();

    res.status(200).json({
      message: "Cart item quantity updated successfully",
      user: user,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// shopper and admin routes
export const createProduct = async (req, res) => {
  try {
    const user = req.user; // Retrieved from authMiddleware
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message: "Access denied. Only shoppers and admins can create products.",
      });
    }
    const {
      title,
      description,
      price,
      category,
      brand,
      thumbnail,
      image,
      stock,
      paymentType,
      specification,
      variations,
      status,
      maxQuantity,
    } = req.body;
    if (
      !title ||
      !description ||
      !price ||
      !category ||
      !brand?.name ||
      !thumbnail ||
      !stock ||
      !maxQuantity
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }
    if (variations && !Array.isArray(variations)) {
      return res.status(400).json({ message: "Variations must be an array" });
    }
    if (
      price?.regular == null ||
      !Array.isArray(price.discounted) ||
      price.discounted.length === 0
    ) {
      return res.status(400).json({
        message: "Price must include regular and at least one discounted entry",
      });
    }

    let storeThumbnailPath;
    if (thumbnail) {
      if (thumbnail.startsWith("uploads\\product")) {
        storeThumbnailPath = thumbnail;
      } else {
        const oldPath = path.join("uploads/temp", thumbnail);
        storeThumbnailPath = path.join(
          "uploads/product",
          thumbnail.replace("temp_", `product_thumbnail_`)
        );
        fs.renameSync(oldPath, storeThumbnailPath);
      }
    }
    let storedImagePaths = [];
    if (image && Array.isArray(image)) {
      for (const img of image) {
        if (img.startsWith("uploads\\product")) {
          storedImagePaths.push(img);
        } else {
          const oldPath = path.join("uploads/temp", img);
          const newPath = path.join(
            "uploads/product",
            img.replace("temp_", `product_image_`)
          );
          fs.renameSync(oldPath, newPath);
          storedImagePaths.push(newPath);
        }
      }
    }

    const newProduct = new Product({
      title,
      addedBy: {
        _id: user._id,
        name: user.name,
        email: user.email,
        shop: {
          shopId: user.shop.shopId,
          shopName: user.shop.shopName,
          shopNumber: user.shop.shopNumber,
        },
        phone: user.phone,
        role: user.role,
      },
      description,
      price,
      category,
      variations,
      brand: {
        name: brand.name,
        _id: brand?._id || null,
      },
      shop: {
        shopId: user.shop.shopId,
        shopName: user.shop.shopName,
        shopNumber: user.shop.shopnumber,
      },
      maxQuantity,
      thumbnail: storeThumbnailPath,
      image: storedImagePaths,
      specification,
      status,
      stock,
      paymentType,
    });
    if (variations) {
      for (const variation of variations) {
        const p = await Product.findById(variation);
        if (!p) {
          return res.status(400).json({
            message: `Variation product with ID ${variation} not found`,
          });
        }
        p.variations.push(newProduct._id);
        await p.save();
      }
    }

    await newProduct.save();
    res
      .status(201)
      .json({ message: "Product created successfully", product: newProduct });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getDeletedProducts = async (req, res) => {
  try {
    const limit = 10; // Number of products per page
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const user = req.user; // Retrieved from authMiddleware
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can view deleted products.",
      });
    }
    const products = await Product.find({ deleted: true })
      .skip(skip)
      .limit(limit);
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getDeletedCategories = async (req, res) => {
  try {
    const limit = 10; // Number of categories per page
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const user = req.user; // Retrieved from authMiddleware
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can view deleted categories.",
      });
    }

    const categories = await Category.find({ deleted: true })
      .skip(skip)
      .limit(limit);
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getDeletedBrands = async (req, res) => {
  try {
    const limit = 10; // Number of brands per page
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const user = req.user; // Retrieved from authMiddleware
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can view deleted brands.",
      });
    }

    const brands = await Brand.find({ deleted: true }).skip(skip).limit(limit);
    res.status(200).json({ brands });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const restore = async (req, res) => {
  try {
    const user = req.user; // Retrieved from authMiddleware
    const { id, restoreType } = req.body;

    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can restore products.",
      });
    }
    if (restoreType === "product") {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found." });
      }

      product.deleted = false;
      product.deletedBy = null;
      product.deletedAt = null;
      await product.save();
      return res
        .status(200)
        .json({ message: "Product restored successfully", product });
    } else if (restoreType === "category") {
      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      category.deleted = false;
      category.deletedBy = null;
      category.deletedAt = null;
      await category.save();
      return res
        .status(200)
        .json({ message: "Category restored successfully", category });
    } else if (restoreType === "brand") {
      const brand = await Brand.findById(id);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found." });
      }
      brand.deleted = false;
      brand.deletedBy = null;
      brand.deletedAt = null;
      await brand.save();
      return res
        .status(200)
        .json({ message: "Brand restored successfully", brand });
    } else {
      return res.status(400).json({ message: "Invalid restore type." });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getProductVariations = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    const variations = await Product.find({
      _id: { $in: product.variations },
    }).select("title name price discountedPrice thumbnail deleted");

    res.status(200).json({ variations });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const user = req.user; // Retrieved from authMiddleware
    const { productId } = req.params;
    const updates = req.body;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-user can update products.",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    if (
      user.role === "Shop-user" &&
      product.addedBy._id.toString() !== user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "Access denied. Shop-users can only update their own products.",
      });
    }
    if (updates.status === "deleted") {
      updates.deleted = true;
      updates.deletedBy = user._id;
      updates.deletedAt = new Date();
    }
    if (updates.status && updates.status !== "deleted") {
      updates.deleted = false;
      updates.deletedBy = null;
      updates.deletedAt = null;
    }
    if (updates.thumbnail) {
      if (updates.thumbnail.startsWith("uploads\\product")) {
        // Already stored image, skip renaming
        updates.thumbnail = updates.thumbnail;
      } else {
        const oldPath = path.join("uploads/temp", updates.thumbnail);
        const storeThumbnailPath = path.join(
          "uploads/product",
          updates.thumbnail.replace("temp_", `product_thumbnail_`)
        );
        fs.renameSync(oldPath, storeThumbnailPath);
        updates.thumbnail = storeThumbnailPath;
      }
    }

    if (updates.image && Array.isArray(updates.image)) {
      const storedImagePaths = [];
      for (const img of updates.image) {
        if (img.startsWith("uploads\\product")) {
          storedImagePaths.push(img);
          continue; // Skip already stored images
        }
        const oldPath = path.join("uploads/temp", img);
        const newPath = path.join(
          "uploads/product",
          img.replace("temp_", `product_image_`)
        );
        fs.renameSync(oldPath, newPath);
        storedImagePaths.push(newPath);
      }
      updates.image = storedImagePaths;
    }
    if (updates.price) {
      if (
        updates.price.regular == null ||
        !Array.isArray(updates.price.discounted) ||
        updates.price.discounted.length === 0
      ) {
        return res.status(400).json({
          message:
            "Price must include regular and at least one discounted entry",
        });
      }
    }

    const newProduct = await Product.findByIdAndUpdate(
      productId,
      {
        $set: updates,
      },
      {
        new: true,
      }
    );

    res
      .status(200)
      .json({ message: "Product updated successfully", product: newProduct });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const user = req.user; // Retrieved from authMiddleware
    const { productId } = req.params;

    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can delete products.",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }
    if (
      user.role === "shop-user" &&
      product.addedBy._id.toString() !== user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "Access denied. Shop-users can only delete their own products.",
      });
    }
    product.deleted = true;
    product.deletedBy = user._id;
    product.deletedAt = new Date();
    await product.save();
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const limit = 10; // Number of products per page
    const page = parseInt(req.query.page) || 1;
    const skip = parseInt(page - 1) * limit || 0;
    const user = req.user; // Retrieved from authMiddleware

    if (
      user.role !== "shop-user" &&
      user.deleted === false &&
      user.role !== "admin"
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can view all products.",
      });
    }
    if (user.role === "shop-user") {
      const products = await Product.find({ "shop.shopId": user.shop.shopId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      return res.status(200).json({ products });
    }
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const newSupperCategories = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { supercategory } = req.body;
    if (!supercategory) {
      return res.status(400).json({ message: "Supercategory is required" });
    }

    let superCat = await Category.findOne({ name: supercategory });

    if (superCat) {
      return res.status(200).json({
        flag: "red",
        message: "Supercategory already exists",
        category: superCat,
      });
    }

    const newSuperCat = new Category({
      name: supercategory,
      category: [],
      createdBy: user._id,
    });
    await newSuperCat.save();
    res.status(201).json({
      flag: "green",
      message: "New supercategory created",
      category: newSuperCat,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const newSubCategories = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied! only admins and shop-users can create categories.",
      });
    }
    const { subcategory, category, supercategory } = req.body;
    if (!subcategory || !category || !supercategory) {
      return res.status(400).json({
        message: "Subcategory, Category and Supercategory are required",
      });
    }

    // Check if subcategory already exists
    let subcategoryExists = await Category.findOne({
      name: supercategory,
      category: {
        $elemMatch: {
          name: category,
          subcategory: { $elemMatch: { name: subcategory } },
        },
      },
    });

    if (subcategoryExists) {
      return res.status(200).json({ message: "Subcategory already exists" });
    }

    const newSubcategory = {
      name: subcategory,
      createdBy: user._id,
    };

    const result = await Category.updateOne(
      { name: supercategory },
      {
        $addToSet: {
          "category.$[cat].subcategory": newSubcategory,
        },
      },
      {
        arrayFilters: [{ "cat.name": category }],
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Supercategory or Category not found" });
    }

    res.status(201).json({
      message: "New subcategory created",
      subcategory: newSubcategory,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const newCategories = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied! only admins and shop-users can create categories.",
      });
    }

    const { category, supercategory } = req.body;
    if (!category || !supercategory) {
      return res
        .status(400)
        .json({ message: "Category and Supercategory are required" });
    }

    // Check if the supercategory exists
    let superCat = await Category.findOne({ name: supercategory });

    if (!superCat) {
      return res.status(404).json({
        message:
          "Supercategory not found. Please create the supercategory first.",
      });
    }

    // Check if category already exists in this supercategory
    const categoryExists = superCat.category?.some(
      (cat) => cat.name === category
    );

    if (categoryExists) {
      return res
        .status(200)
        .json({ message: "Category already exists in this supercategory" });
    }

    // Add the new category to the supercategory's category array
    const newCategory = {
      name: category,
      createdBy: user._id,
      subcategory: [],
    };

    await Category.updateOne(
      { name: supercategory },
      {
        $push: {
          category: newCategory,
        },
      }
    );

    res
      .status(201)
      .json({ message: "New category created", category: newCategory });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const toggleDeleteBrand = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message: "Access denied. Only admins and shop-users can delete brands.",
      });
    }
    const { brandId } = req.params;

    // Find the brand by ID
    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    // Toggle the deleted status
    brand.deleted = !brand.deleted;
    await brand.save();

    res.status(200).json({ message: "Brand deleted status updated", brand });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// category routes for toggle delete

export const toggleDeleteSupperCategory = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can delete categories.",
      });
    }
    const { suppercategoryId } = req.params;
    if (!suppercategoryId) {
      return res.status(400).json({ message: "Supercategory ID is required" });
    }
    // Find the category by ID
    const category = await Category.findById(suppercategoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Toggle the deleted status
    category.deleted = !category.deleted;
    category.deletedAt = category.deleted ? new Date() : null;
    category.deletedBy = category.deleted ? user._id : null;
    await category.save();

    res
      .status(200)
      .json({ message: "Category deleted status updated", category });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const toggleDeleteCategory = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can delete categories.",
      });
    }
    const { suppercategoryId, categoryId } = req.params;
    if (!suppercategoryId || !categoryId) {
      return res
        .status(400)
        .json({ message: "Supercategory ID and Category ID are required" });
    }
    // Find the category by ID
    const suppercategory = await Category.findById(suppercategoryId);
    if (!suppercategory) {
      return res.status(404).json({ message: "Supercategory not found" });
    }

    const category = suppercategory.category.find(
      (cat) => cat._id.toString() === categoryId
    );
    if (!category) {
      return res.status(404).json({ message: "category not found" });
    }

    // Protection: Prevent restoring category if parent supercategory is deleted
    if (category.deleted && suppercategory.deleted) {
      return res.status(400).json({
        message:
          "Cannot restore category. Parent supercategory is deleted. Please restore the parent supercategory first.",
      });
    }

    // Toggle the deleted status
    category.deleted = !category.deleted;
    category.deletedAt = category.deleted ? new Date() : null;
    category.deletedBy = category.deleted ? user._id : null;

    // If deleting the category, also delete all its subcategories
    if (
      category.deleted &&
      category.subcategory &&
      category.subcategory.length > 0
    ) {
      category.subcategory.forEach((subcat) => {
        subcat.deleted = true;
        subcat.deletedAt = new Date();
        subcat.deletedBy = user._id;
      });
    }

    // If restoring the category, also restore all its subcategories
    if (
      !category.deleted &&
      category.subcategory &&
      category.subcategory.length > 0
    ) {
      category.subcategory.forEach((subcat) => {
        subcat.deleted = false;
        subcat.deletedAt = null;
        subcat.deletedBy = null;
      });
    }

    await suppercategory.save();

    res
      .status(200)
      .json({ message: "Category deleted status updated", category });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const toggleDeleteSubCategory = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message:
          "Access denied. Only admins and shop-users can delete subcategories.",
      });
    }
    const { suppercategoryId, categoryId, subcategoryId } = req.params;
    if (!suppercategoryId || !categoryId || !subcategoryId) {
      return res.status(400).json({
        message:
          "Supercategory ID, Category ID and Subcategory ID are required",
      });
    }
    // Find the supercategory by ID
    const suppercategory = await Category.findById(suppercategoryId);
    if (!suppercategory) {
      return res.status(404).json({ message: "Supercategory not found" });
    }
    const category = suppercategory.category.find(
      (cat) => cat._id.toString() === categoryId
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const subcategory = category.subcategory.find(
      (sub) => sub._id.toString() === subcategoryId
    );

    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    // Protection: Prevent restoring subcategory if parent category is deleted
    if (subcategory.deleted && category.deleted) {
      return res.status(400).json({
        message:
          "Cannot restore subcategory. Parent category is deleted. Please restore the parent category first.",
      });
    }

    // Toggle the deleted status
    subcategory.deleted = !subcategory.deleted;
    subcategory.deletedAt = subcategory.deleted ? new Date() : null;
    subcategory.deletedBy = subcategory.deleted ? user._id : null;
    await suppercategory.save();

    res.status(200).json({
      message: "Subcategory deleted status updated",
      category: suppercategory,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { supercategoryId, categoryId, subcategoryId, name } = req.body;

    // change in subcategory name
    if (supercategoryId && categoryId && subcategoryId) {
      const supercategory = await Category.findById(supercategoryId);
      if (!supercategory) {
        return res.status(404).json({ message: "Supercategory not found" });
      }
      const category = supercategory.category.find(
        (cat) => cat._id.toString() === categoryId
      );
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const subcategory = category.subcategory.find(
        (sub) => sub._id.toString() === subcategoryId
      );
      if (!subcategory) {
        return res.status(404).json({ message: "Subcategory not found" });
      }

      // Update the category details
      subcategory.name = name || subcategory.name;
      await supercategory.save();
      await Product.updateMany(
        {
          "category.supercategoryId": supercategoryId,
          "category.categoryId": categoryId,
          "category.subcategoryId": subcategoryId,
        },
        { "category.subcategoryName": name }
      );
    } else if (supercategoryId && categoryId) {
      // change in category name
      const supercategory = await Category.findById(supercategoryId);
      if (!supercategory) {
        return res.status(404).json({ message: "Supercategory not found" });
      }
      const category = supercategory.category.find(
        (cat) => cat._id.toString() === categoryId
      );
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Update the category details
      category.name = name || category.name;
      await supercategory.save();
      await Product.updateMany(
        {
          "category.supercategoryId": supercategoryId,
          "category.categoryId": categoryId,
        },
        { "category.categoryName": name }
      );
    } else if (supercategoryId) {
      // change in supercategory name
      const supercategory = await Category.findById(supercategoryId);
      if (!supercategory) {
        return res.status(404).json({ message: "Supercategory not found" });
      }

      // Update the supercategory details
      supercategory.name = name || supercategory.name;
      await supercategory.save();
      await Product.updateMany(
        { "category.supercategoryId": supercategoryId },
        { "category.supercategoryName": name }
      );
    } else {
      return res
        .status(400)
        .json({ message: "At least one ID must be provided for update" });
    }
    const category = await Category.findById(supercategoryId);
    res
      .status(200)
      .json({ message: "Category updated successfully", category });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const editBrand = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({
        message: "Access denied. Only admins and shop-users can edit brands.",
      });
    }
    const { brandId } = req.params;
    const { name, logo } = req.body;

    // Find the brand by ID
    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    if (logo) {
      if (brand.logo) {
        const oldLogoPath = path.join(
          "uploads/brand",
          brand.logo
            .replace("uploads/brand/", "")
            .replace("uploads\\brand\\", "")
        );

        if (fs.existsSync(oldLogoPath)) {
          try {
            fs.unlinkSync(oldLogoPath);
          } catch (err) {}
        }
      }
      const oldPath = path.join("uploads/temp", logo);
      const storeLogoPath = path.join(
        "uploads/brand",
        logo.replace("temp_", `brand_logo_`)
      );

      try {
        fs.renameSync(oldPath, storeLogoPath);
      } catch (err) {}

      brand.logo = storeLogoPath;
    }

    brand.name = name || brand.name;
    await brand.save();
    await Product.updateMany(
      { "category.brandId": brandId },
      { "category.brandName": name }
    );

    res.status(200).json({ message: "Brand updated successfully", brand });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ deleted: false });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const getBrands = async (req, res) => {
  try {
    const brands = await Brand.find({ deleted: false });
    res.status(200).json({ brands });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const newBrands = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "admin" && user.role !== "shop-user") ||
      user.deleted === false
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    let { name, logo } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Brand name is required" });
    }
    let brand = await Brand.findOne({ name });
    if (brand) {
      return res.status(200).json({ message: "Brand already exists", brand });
    } else {
      if (logo) {
        const oldPath = path.join("uploads/temp", logo);
        const storeLogoPath = path.join(
          "uploads/brand",
          logo.replace("temp_", `brand_logo_`)
        );
        fs.renameSync(oldPath, storeLogoPath);
        logo = storeLogoPath;
      }
      const newBrand = new Brand({
        name,
        logo,
        createdBy: user._id,
      });
      await newBrand.save();
      return res
        .status(201)
        .json({ message: "New brand created", brand: newBrand });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
