import mongoose from "mongoose";

const orderSchema = mongoose.Schema({
    userId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: [{
        id:  {type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, required: true }
    }],
    totalAmount: {type:Number , required: true},
    paymentMethod: {type:String, default: "Cash on Delivery"},
    status: {type: String, default: "Pending", enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"]},
    createdAt: {type: Date, default: Date.now}
})

export const orderModel = mongoose.model("Order", orderSchema);