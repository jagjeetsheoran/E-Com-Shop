import express from "express";
import authMiddleware from "../lib/middle.layer.js";
import { addToCart, createProduct, editBrand, getAllProducts, getBrands, getCategories, getDeletedBrands, getDeletedCategories, getDeletedProducts, getHomeProducts, getProducts, getProductVariations, getRecentlyViewedProducts, getRelatedProducts, getSingleProduct, newBrands, newCategories, newSubCategories, newSupperCategories, removeFromCart, restore, reviewProduct, searchProducts, searchProductsByCategory, searchProductsForAdmin, toggleDeleteBrand, toggleDeleteCategory, toggleDeleteSubCategory, toggleDeleteSupperCategory, updateCartItemQuantity, updateCategory, updateProduct } from "../Controller/product.controller.js";
import { searchOrders } from "../Controller/auth.controller.js";

const router = express.Router();

// client routes
router.get("/", getHomeProducts);
router.get("/products", getProducts);
router.get("/product/:productId", getSingleProduct);
router.get("/product/variation/:productId", getProductVariations);
router.get("/search", searchProducts);
router.get("/search/category", searchProductsByCategory);
router.get("/searchorder",authMiddleware, searchOrders);
router.get("/related-products/:category", getRelatedProducts);
router.get("/recently-viewed/", authMiddleware,getRecentlyViewedProducts);
router.post('/review/:productId', authMiddleware, reviewProduct);

// shopper and admin routes
router.post("/newproduct", authMiddleware, createProduct);
router.put("/product/:productId", authMiddleware, updateProduct);



// bin routes
router.get("/bin/products", authMiddleware, getDeletedProducts);
router.get("/bin/categories", authMiddleware, getDeletedCategories);
router.get("/bin/brands", authMiddleware, getDeletedBrands);
router.put("/bin/", authMiddleware, restore);



router.get("/allproducts", authMiddleware, getAllProducts);
router.post("/searchproduct", authMiddleware, searchProductsForAdmin);


// category routes
router.post("/newsuppercategory", authMiddleware, newSupperCategories);
router.post("/newcategory", authMiddleware, newCategories);
router.post("/newsubcategory", authMiddleware, newSubCategories);
router.put("/category", authMiddleware, updateCategory);
router.get("/categories", getCategories);
router.delete("/category/:suppercategoryId", authMiddleware, toggleDeleteSupperCategory);
router.delete("/category/:suppercategoryId/:categoryId", authMiddleware, toggleDeleteCategory);
router.delete("/category/:suppercategoryId/:categoryId/:subcategoryId", authMiddleware, toggleDeleteSubCategory);


// brand routes
router.post("/newbrand", authMiddleware, newBrands);
router.get("/brands", getBrands);
router.delete("/brand/:brandId", authMiddleware, toggleDeleteBrand);
router.put("/brand/:brandId", authMiddleware, editBrand);



router.put("/cart", authMiddleware, addToCart);
router.put("/rcart", authMiddleware, removeFromCart);
router.put("/ucart", authMiddleware, updateCartItemQuantity);
export default router;