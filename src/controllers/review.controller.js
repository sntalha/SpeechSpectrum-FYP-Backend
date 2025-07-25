import { orderModel } from "../models/order.schema.js";
import { productModel } from "../models/products.schema.js";
import { reviewModel } from "../models/review.schema.js";

const updateProductRating = async (productId) => {
    const reviews = await reviewModel.find({ productId });
    const totalRatings = reviews.length ?? 0;
    const sumRatings = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = Math.round(sumRatings / totalRatings);
    await productModel.findByIdAndUpdate(productId, { rating: averageRating });
};
const validateUserOrder = async ({ userId, productId }) => {
    const orders = await orderModel.find({
        userId,
        products: { $elemMatch: { id: productId } }
    });
    return orders.length > 0;
}

export default class Review {
    static async create(req, res) {
        try {
            const { review, rating, productId } = req.body;
            if (!review || !rating || !productId) {
                res.status(400).json({ message: "Missing required fields", status: "failed" })
            }

            const product = await productModel.findById(productId);
            if (!product) {
                res.status(404).json({ message: "Product Not Found", status: "failed" })
            }

            const hasOrdered = await validateUserOrder({
                userId: req?.user?._id,
                productId
            });

            if (!hasOrdered) {
                res.status(403).json({ message: "Access denied, you have not purchased this product", status: "failed" })
            }

            const newReview = new reviewModel({
                review,
                rating,
                productId,
                userId: req?.user?._id
            })

            await newReview.save();
            await updateProductRating(productId);

            res.status(201).json({ message: "Rating submitted successfully", status: "success" })

        } catch (error) {
            console.log(error);
            res.status(500).json({ message: "Interval Server Error", status: "failed" })
        }
    }


    static async remove(req, res) {
        try {
            const { id } = req.params;
            const review = await reviewModel.findById(id);
            if (!review) {
                res.status(404).json({ message: "Review Not Found", status: "failed" })
            }

            if (review.userId.toString() !== req?.user?._id.toString()) {
                res.status(403).json({ message: "Access denied, Not your review", status: "failed" })
            }
            const { productId } = review;
            await reviewModel.findByIdAndDelete(id);
            await updateProductRating(productId);
            res.status(200).json({ message: "Review removed successfully", status: "success" })
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: "Interval Server Error", status: "failed" })
        }
    }

    static async getProductRatings(req, res) {
        try {
            const { productId } = req.params;
            const product = await productModel.findById(productId);
            console.log(product);
            
            if (!product) {
                res.status(404).json({ message: "Product Not Found", status: "failed" })
            }
            const reviews = await reviewModel.find({ productId }).populate("userId", "name");
            res.status(200).json({ message: "Reviews fetch successfully", status: "success", reviews })
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: "Interval Server Error", status: "failed" })
        }
    }
}