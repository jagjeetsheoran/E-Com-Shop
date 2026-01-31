import path from "path";
import Order from "../DB-Models/order.model.js";
import fs from "fs";

const STATUS_RANK = {
  pending: 1,
  "partial-pending": 2,

  "shipment-preparation": 3,
  "partial-shipment-preparation": 4,

  shipped: 5,
  "partial-shipped": 6,

  delivered: 7,
  "partial-delivered": 8,

  returned: 9,
  "partial-returned": 10,

  refunded: 11,
  "partial-refunded": 12,

  cancelled: 0,
  failed: 0,
  rejected: 0,
};

// *** get Shop Order Requests *** //
export const shopOrderRequest = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Not a shop user & admin." });
    }
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    if (user.role === "shop-user") {
      let orders = await Order.find({
        $and: [
          { "products.shop.shopId": user.shop.shopId },
          { status: { $nin: ["paymentInitiated", "failed"] } },
          { "products.shopApproved": "pending" },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "_id orderId products._id products.shop products.title products.productStatus products.quantity products.totalPrice products.price products.shopApproved products.thumbnail products.trackingLink products.productId deliveryAddress paymentType updatedAt invoiceNo"
        );
      if (!orders || orders.length === 0) {
        return res.status(204).json({ rorders: [] });
      }

      let filteredProdutsOrders = orders.map((order) => {
        const filteredProducts = order.products.filter((product) => {
          if (
            product.shop.shopId.toString() === user.shop.shopId.toString() &&
            product.shopApproved === "pending"
          )
            return product;
        });
        return { ...order.toObject(), products: filteredProducts };
      });

      filteredProdutsOrders = filteredProdutsOrders.filter(
        (order) => order.products.length > 0
      );
      res.status(200).json({ rorders: filteredProdutsOrders });
    } else if (user.role === "admin") {
      let orders = await Order.find({
        $and: [
          { status: { $ne: "paymentInitiated" } },
          { "products.shopApproved": "pending" },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "_id orderId products._id products.shop products.title products.productStatus products.quantity products.totalPrice products.price products.shopApproved products.thumbnail products.trackingLink products.productId deliveryAddress paymentType updatedAt invoiceNo"
        );
      if (!orders || orders.length === 0) {
        return res.status(204).json({ rorders: [] });
      }
      res.status(200).json({ rorders: orders });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const _updateOrderStatusBasedOnProducts = (order) => {
  const currentRank = STATUS_RANK[order.status];

  let approved = 0;
  let rejected = 0;
  let pending = 0;

  for (const p of order.products) {
    if (p.shopApproved === "approved") approved++;
    else if (p.shopApproved === "rejected") rejected++;
    else pending++;
  }

  const total = order.products.length;

  let nextStatus = order.status;

  if (approved + rejected === total) {
    nextStatus = "pending";
  } else if (approved > 0) {
    nextStatus = "partial-pending";
  } else if (rejected === total) {
    nextStatus = "rejected";
  } else if (rejected > 0) {
    nextStatus = "partial-pending";
  }

  // 🔒 HARD LOCK: prevent backward movement
  if (STATUS_RANK[nextStatus] > currentRank) {
    order.status = nextStatus;
  }

  return order;
};

// *** accept Shop Order Requests *** //
export const acceptShopOrderRequest = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Not a shop user & admin." });
    }
    const { orderId, productId } = req.params;
    let order = await Order.findOne({ _id: orderId });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    const product = order.products.id(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    product.shopApproved = "approved";
    product.approvedBy = { _id: user._id, name: user.name };
    order = _updateOrderStatusBasedOnProducts(order);
    await order.save();
    res.status(200).json({ message: "Product order approved successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const rejectShopOrderRequest = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Not a shop user & admin." });
    }
    const { orderId, productId } = req.params;
    const { reason } = req.body;
    if (!reason || reason.trim() === "") {
      return res.status(400).json({ message: "Rejection reason is required." });
    }
    let order = await Order.findOne({ _id: orderId });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    const product = order.products.id(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    product.shopApproved = "rejected";
    product.description = reason;
    if (order.paymentType === "cash-on-delivery") {
      product.status = "rejected";
    } else if (order.paymentType === "online-payment") {
      product.status = "refund-in-progress";
    }
    order = _updateOrderStatusBasedOnProductsForUpdateFunction();
    order = _updateOrderStatusBasedOnProducts(order);
    product.approvedBy = { _id: user._id, name: user.name };
    await order.save();
    res.status(200).json({ message: "Product order rejected successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// *** Get Order Helpers *** //
const _adminGetOrders = async (user, status, skip, limit, res) => {
  try {
    let orders;
    if (user.role === "shop-user") {
      if (
        status &&
        [
          "pending",
          "shipment-preparation",
          "shipped",
          "delivered",
          "cancelled",
        ].includes(status)
      ) {
        orders = await Order.find({
          $or: [
            { "products.shop.shopId": user.shop.shopId },
            { "products.productStatus": { $eq: status } },
            { status: { $ne: "paymentInitiated" } },
          ],
          "products.shopApproved": { $eq: "approved" },
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);

        let filteredProdutsOrders = orders.map((order) => {
          const filteredProducts = order.products.filter((product) => {
            if (
              product.shop.shopId.toString() === user.shop.shopId.toString() &&
              product.shopApproved === "approved"
            )
              return product;
          });
          return { ...order.toObject(), products: filteredProducts };
        });
        return res.status(200).json({ orders: filteredProdutsOrders });
      } else {
        orders = await Order.find({
          $and: [
            { "products.shop.shopId": user.shop.shopId },
            { status: { $ne: "paymentInitiated" } },
            { "products.shopApproved": { $eq: "approved" } },
          ],
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);
        let filteredProdutsOrders = orders.map((order) => {
          const filteredProducts = order.products.filter((product) => {
            if (
              product.shop.shopId.toString() === user.shop.shopId.toString() &&
              product.shopApproved === "approved"
            )
              return product;
          });
          return { ...order.toObject(), products: filteredProducts };
        });
        return res.status(200).json({ orders: filteredProdutsOrders });
      }
    } else if (user.role === "admin") {
      if (
        status &&
        [
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
        ].includes(status)
      ) {
        orders = await Order.find({
          status: status,
          "products.shopApproved": { $eq: "approved" },
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);
      } else {
        orders = await Order.find({
          status: { $ne: "paymentInitiated" },
          "products.shopApproved": { $eq: "approved" },
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);
      }
      const filteredProdutsOrders = orders.map((order) => {
        const filteredProducts = order.products.filter((product) => {
          if (product.shopApproved === "approved") return product;
        });
        return { ...order.toObject(), products: filteredProducts };
      });
      return res.status(200).json({ orders: filteredProdutsOrders });
    }
  } catch {
    throw new Error("Internal Server Error");
  }
};

export const getOrder = async (req, res) => {
  try {
    const user = req.user;
    const status = req.query.status;
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    let orders;
    if (user.role === "shop-user" || user.role === "admin") {
      return _adminGetOrders(user, status, skip, limit, res);
    }
    if (
      status &&
      [
        "pending",
        "shipment-preparation",
        "shipped",
        "delivered",
        "cancelled",
      ].includes(status)
    ) {
      orders = await Order.find({ "user._id": user._id, status: status })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit);
    } else {
      orders = await Order.find({
        "user._id": user._id,
        status: { $ne: "paymentInitiated" },
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }
    res.status(200).json({ orders });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (
      user.role !== "shop-user" &&
      user.role !== "admin" &&
      order.user._id.toString() !== user._id.toString()
    ) {
      return res.status(403).json({
        message: "Access denied. You are not authorized to view this order.",
      });
    }
    if (order.status === "paymentInitiated") {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json({ order });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// *** Update Order Helpers *** //
const _updateOrderStatusBasedOnProductsForUpdateFunction = (order) => {
  const statusCounts = {
    shipment: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
  };
  let totalProducts = 0;
  for (const p of order.products) {
    if (p.productStatus === "shipment-preparation") statusCounts.shipment++;
    else if (p.productStatus === "shipped") statusCounts.shipped++;
    else if (p.productStatus === "delivered") statusCounts.delivered++;
    else if (p.productStatus === "cancelled") statusCounts.cancelled++;
    else if (p.productStatus === "returned") statusCounts.returned++;
    if (p.shopApproved === "approved") {
      totalProducts++;
    }
  }

  if (statusCounts.returned === totalProducts) {
    order.status = "returned";
  } else if (statusCounts.cancelled === totalProducts) {
    order.status = "cancelled";
  } else if (statusCounts.delivered === totalProducts) {
    order.status = "delivered";
  } else if (statusCounts.shipped === totalProducts) {
    order.status = "shipped";
  } else if (statusCounts.shipment === totalProducts) {
    order.status = "shipment-preparation";
  } else if (statusCounts.returned > 0) {
    order.status = "partial-returned";
  } else if (statusCounts.cancelled > 0) {
    order.status = "partial-cancelled";
  } else if (statusCounts.delivered > 0) {
    order.status = "partial-delivered";
  } else if (statusCounts.shipped > 0) {
    order.status = "partial-shipped";
  } else if (statusCounts.shipment > 0) {
    order.status = "partial-shipment-preparation";
  }
  return order;
};
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status, productId } = req.body;
    const user = req.user;
    if (!orderId || !status || !productId) {
      return res
        .status(400)
        .json({ message: "orderId, productId and status are required" });
    }

    if (
      ![
        "shipment-preparation",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
        "refunded",
        "failed",
      ].includes(status)
    ) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Only shop users can update orders." });
    }
    let order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.status === "delivered") {
      return res
        .status(400)
        .json({ message: "Cannot update status of a delivered order." });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (product.shopApproved !== "approved") {
      return res.status(400).json({
        message: "Cannot update status of a unapproved product order.",
      });
    }
    if (
      user.role === "shop-user" &&
      product.shop.shopId.toString() !== user.shop.shopId.toString()
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    product.productStatus = status;
    order = _updateOrderStatusBasedOnProductsForUpdateFunction(order);
    await order.save();
    res.status(200).json({
      message: "Order status updated successfully",
      orderId: order._id,
      status: order.status,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const updateOrderTrackingLink = async (req, res) => {
  try {
    const { orderId, productId, trackingLink } = req.body;
    const user = req.user;
    if (!orderId || !trackingLink || !productId) {
      return res
        .status(400)
        .json({ message: "orderId, productId and trackingLink are required" });
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
        .json({ message: "Cannot update tracking of a delivered order." });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (
      user.role === "shop-user" &&
      product.shop.shopId.toString() !== user.shop.shopId.toString()
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    product.trackingLink = trackingLink;
    await order.save();
    res.status(200).json({
      message: "Order tracking link updated successfully",
      orderId: order._id,
      trackingLink: order.trackingLink,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getRefoundOrders = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Only admin can access this." });
    }
    const limit = 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    let orders;
    if (user.role === "shop-user") {
      orders = await Order.find({
        $and: [
          { "products.shop.shopId": user.shop.shopId },
          { "products.productStatus": "return-requested" },
          { "products.shopApproved": "approved" },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      let filteredProdutsOrders = orders.map((order) => {
        const filteredProducts = order.products.filter((product) => {
          if (
            product.shop.shopId.toString() === user.shop.shopId.toString() &&
            product.shopApproved === "approved" &&
            product.productStatus === "return-requested"
          )
            return product;
        });
        return { ...order.toObject(), products: filteredProducts };
      });
      filteredProdutsOrders = filteredProdutsOrders.filter(
        (order) => order.products.length > 0
      );
      return res.status(200).json({ orders: filteredProdutsOrders });
    } else if (user.role === "admin") {
      orders = await Order.find({
        $and: [
          { status: { $in: ["refunded", "partial-refunded"] } },
          { "products.shopApproved": "approved" },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      const filteredProdutsOrders = orders.map((order) => {
        const filteredProducts = order.products.filter((product) => {
          if (
            product.shopApproved === "approved" &&
            (product.productStatus === "refunded" ||
              product.productStatus === "partial-refunded")
          )
            return product;
        });
        return { ...order.toObject(), products: filteredProducts };
      });
      return res.status(200).json({ orders: filteredProdutsOrders });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const refundOrderProduct = async (req, res) => {
  try {
    const user = req.user;
    const { orderId, productId } = req.params;
    const { quantity, images } = req.body;
    if (
      orderId === undefined ||
      productId === undefined ||
      quantity === undefined
    ) {
      return res
        .status(400)
        .json({ message: "orderId, productId and quantity are required." });
    }
    if (quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Refund quantity must be greater than zero." });
    }
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        message: "Access denied. You are not authorized to refund this order.",
      });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (product.productStatus === "return-requested") {
      res.status(400).json({ message: "Return in progress." });
    }
    if (quantity > product.quantity) {
      return res
        .status(400)
        .json({ message: "Refund quantity exceeds purchased quantity." });
    }
    if (images && !Array.isArray(images)) {
      return res.status(400).json({ message: "Images must be an array." });
    }
    if (product.productStatus === "returned") {
      return res
        .status(400)
        .json({ message: "Product already returned. Cannot refund now." });
    }
    let storedImage = [];
    if (images) {
      for (let img of images) {
        const oldPath = path.join("uploads/temp", img);
        const newPath = path.join(
          "uploads/refunds",
          img.replace("temp_", `refund_${user._id}_to_${productId}_product_`)
        );
        fs.renameSync(oldPath, newPath);
        storedImage.push(newPath);
      }
    }
    product.return.images = storedImage;
    product.return.returnRequestDate = new Date();
    product.return.returnRejectedDate = null;
    product.return.returnApprovedDate = null;
    product.return.returnReason = req.body.reason || "";
    product.return.returnDescription = req.body.description || "";
    product.productStatus = "return-requested";
    _updateOrderStatusBasedOnProductsForUpdateFunction(order);
    await order.save();
    res.status(200).json({ message: "Refund process initiated successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const refundCompleteProduct = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const user = req.user;
    if (!orderId || !productId) {
      return res
        .status(400)
        .json({ message: "orderId and productId are required" });
    }
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Only shop users can update orders." });
    }
    let order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (
      user.role !== "admin" &&
      product.shop.shopId.toString() !== user.shop.shopId.toString()
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (product.productStatus !== "return-requested") {
      return res.status(400).json({
        message:
          "Cannot complete refund for a product not in return-requested status.",
      });
    }
    product.productStatus = "refunded";
    order = _updateOrderStatusBasedOnProductsForUpdateFunction(order);
    await order.save();
    res.status(200).json({
      message: "Product refund completed successfully",
      orderId: order._id,
      status: order.status,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const approveRefundRequest = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Not a shop user & admin." });
    }
    const { orderId, productId } = req.params;
    if (!orderId || !productId) {
      return res.status(400).json({ message: "orderId and productId are required." });
    }
    let order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (
      user.role === "shop-user" &&
      product.shop.shopId.toString() !== user.shop.shopId.toString()
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (product.productStatus !== "return-requested") {
      return res
        .status(400)
        .json({ message: "This product is not in return-requested status." });
    }
    product.productStatus = "refund-approved";
    product.return.returnApprovedDate = new Date();
    product.return.returnRejectedDate = null;
    order = _updateOrderStatusBasedOnProductsForUpdateFunction(order);
    await order.save();
    res.status(200).json({
      message: "Refund request approved successfully",
      orderId: order._id,
      status: order.status,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const rejectRefundRequest = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Not a shop user & admin." });
    }
    const { orderId, productId } = req.params;
    if (!orderId || !productId) {
      return res
        .status(400)
        .json({ message: "orderId and productId are required." });
    }
    const { reason } = req.body;
    if (!reason || reason.trim() === "") {
      return res.status(400).json({ message: "Rejection reason is required." });
    }
    let order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (
      user.role === "shop-user" &&
      product.shop.shopId.toString() !== user.shop.shopId.toString()
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (product.productStatus !== "return-requested") {
      return res
        .status(400)
        .json({ message: "This product is not in return-requested status." });
    }
    product.productStatus = "refund-rejected";
    product.return.rejectionReason = reason;
    product.return.returnApprovedDate = null;

    product.return.returnRejectedDate = new Date();
    order = _updateOrderStatusBasedOnProductsForUpdateFunction(order);
    await order.save();
    res.status(200).json({
      message: "Refund request rejected successfully",
      orderId: order._id,
      status: order.status,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

export const getRefoundOrdersById = async (req, res) => {
  try {
    const user = req.user;
    if (
      (user.role !== "shop-user" && user.role !== "admin") ||
      user.deleted === false
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Only admin can access this." });
    }
    const { orderId, productId } = req.params;
    let order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    const product = order.products.find(
      (p) => p.productId.toString() === productId
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found in order." });
    }
    if (
      product.shop.shopId.toString() !== user.shop.shopId.toString() &&
      user.role === "shop-user"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (
      product.productStatus !== "returned" &&
      product.productStatus !== "return-requested" &&
      product.productStatus !== "refunded"
    ) {
      return res.status(400).json({
        message: "This product is not refunded.",
      });
    }
    const filteredOrder = { ...order.toObject(), products: [product] };
    res.status(200).json({ order: filteredOrder });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
