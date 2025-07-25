import mongoose from "mongoose";


const reviewSchema = mongoose.Schema({
    review: {type: String, required: true},
    rating: { type: Number, default: 0, min: 0, max: 5 },
    productId: {type: mongoose.Schema.Types.ObjectId, ref: "Product"},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: "User"},
});

export const reviewModel = mongoose.model("Review", reviewSchema)