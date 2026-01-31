import express from 'express';
import { addAddress, addHeroBanner, adminDashboardData, changeAddress, checkAuth, deleteShop, deleteShopUser, exportSuperUsers, exportOrderData, exportProductData, exportShopData, exportShopUserData, exportUserData, getAllShops, getAllShopUsers, getDeletedHeroBanners, getHeroBanners, getSessionId, login, logout, register, restoreShop, searchShops, searchShopUsers, shopRegister, shopuserRegister, toggleDeleteHeroBanner, updateImageforAdmin,  updateShop, verify2FA, verifyPayment, requestForSupperCustomer, getgstInfo, getSupperCustomers, acceptSupperCustomerStatus, rejectSupperCustomerStatus, setOrderforSuperCoustmorer, orderToInclude, getSupperOrders } from '../Controller/auth.controller.js';
import authMiddleware from '../lib/middle.layer.js';
import _2faMiddleware from '../lib/_2faMiddle.layer.js';
import upload from '../lib/multer.uploader.js';
const router = express.Router();


router.post('/verify-2fa', _2faMiddleware, verify2FA);

// exporting routes
router.get('/users', authMiddleware, exportUserData);
router.get('/products', authMiddleware, exportProductData);
router.get('/orders', authMiddleware, exportOrderData);
router.get('/super-users', authMiddleware, exportSuperUsers);
router.get('/exportshops', authMiddleware, exportShopData);
router.get('/shop-users', authMiddleware, exportShopUserData);


router.get('/search', authMiddleware, searchShopUsers);
router.get('/searchshop', authMiddleware, searchShops);
router.get('/dashboard', authMiddleware, adminDashboardData);

// hero banner routes
router.get('/hero-banner', getHeroBanners);
router.post('/hero-banner', authMiddleware, addHeroBanner);
router.delete('/hero-banner',authMiddleware, toggleDeleteHeroBanner);
router.get('/hero-banner-deleted', authMiddleware, getDeletedHeroBanners);


// register routes

router.post('/register', register);
router.post('/shop-user-register', authMiddleware, shopuserRegister);
router.post('/shop-register', authMiddleware, shopRegister);

// supper customer request
router.get("/super-customer-requests", authMiddleware, getSupperCustomers);
router.put("/super-customer-requests/:requestId/accept", authMiddleware, acceptSupperCustomerStatus);
router.put("/super-customer-requests/:requestId/reject", authMiddleware, rejectSupperCustomerStatus);
router.post("/request", authMiddleware, requestForSupperCustomer);
router.get("/verify-gst/:gst", authMiddleware, getgstInfo);

router.get("/shops", authMiddleware, getAllShops);
router.put("/shops/:shopId", authMiddleware, updateShop);
router.delete("/shops/:shopId", authMiddleware, deleteShop);
router.put("/restore-shop/:shopId", authMiddleware, restoreShop);

router.post('/login', login);
router.get('/logout', authMiddleware, logout);
router.get('/check-auth', authMiddleware, checkAuth);
router.get('/shop-user', authMiddleware, getAllShopUsers);
router.delete('/shop-user/:userId', authMiddleware, deleteShopUser);
router.post('/upload', authMiddleware, upload.single('image'), updateImageforAdmin);
router.put('/address', authMiddleware, addAddress);
router.put('/address/:addressId', authMiddleware, changeAddress);




// payment gateway or order routes
// todo: change the route names
router.post('/order/super-customer', authMiddleware, setOrderforSuperCoustmorer);
router.get('/order/super-customer', authMiddleware, getSupperOrders);
router.post('/accept-order/:orderId', authMiddleware, orderToInclude);
router.get('/create-checkout-session', authMiddleware, getSessionId);
router.get('/verify-payment/:order_id', authMiddleware, verifyPayment);

export default router;