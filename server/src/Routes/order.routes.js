import express from 'express';
import { acceptShopOrderRequest, getOrder, getOrderById, getRefoundOrders, getRefoundOrdersById, refundCompleteProduct, refundOrderProduct, rejectRefundRequest, rejectShopOrderRequest, shopOrderRequest, updateOrderStatus, updateOrderTrackingLink } from '../Controller/order.controller.js';
import authMiddleware from '../lib/middle.layer.js';

const router = express.Router();

router.get("/orders-request", authMiddleware, shopOrderRequest);
router.get("/orders-request/:orderId/:productId/accept", authMiddleware, acceptShopOrderRequest);
router.post("/orders-request/:orderId/:productId/reject", authMiddleware, rejectShopOrderRequest);
// order management
router.post('/usorder', authMiddleware, updateOrderStatus);
router.get('/get-order', authMiddleware, getOrder);
router.get('/orders/:id', authMiddleware, getOrderById);
router.post('/update-tracking', authMiddleware, updateOrderTrackingLink);

// refund order request
router.post('/new-refund-request/:orderId/:productId', authMiddleware, refundOrderProduct);
// admin refund request
router.get('/refund-requests', authMiddleware, getRefoundOrders);
router.get('/refund-request/:orderId/:productId', authMiddleware, getRefoundOrdersById);
// refund processing Note:- complete is done by the order pickup person
router.get("/return-request/:orderId/:productId/complete", authMiddleware, refundCompleteProduct);
router.get("/return-request/:orderId/:productId/accept", authMiddleware, acceptShopOrderRequest);
router.post("/return-request/:orderId/:productId/reject", authMiddleware, rejectRefundRequest);


export default router;