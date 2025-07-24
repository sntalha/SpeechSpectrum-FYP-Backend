import { cloudinary } from "../config/cloudinary-config.js";
import {categoryModel} from "../models/category.schema.js";
import {productModel} from "../models/products.schema.js";

export default class Product {
    static async create(req, res) {
        try {
            const { name, price, description, stock, colors, categoryId } = req.body;
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ message: "At least one image is required" });
            }
            if (!name || !price || !description || !stock || !colors || !categoryId) {
                return res.status(400).json({ message: "All fields are required" });
            }
            const category = await categoryModel.findById(categoryId);
            if (!category) {
                return res.status(400).json({ message: "Category not found" });
            }
            const product = await productModel.create({
                name,
                images: req.files.map(file => file.path),
                price,
                description,
                stock,
                colors,
                categoryId,
                adminId: req.user._id
            });
            await product.save();
            res.status(201).json({ message: "Product created", status: true, data: product });
        } catch (error) {
            res.status(500).json({ message: "Error creating product", error: error.message });
        }
    }
    static async update(req, res) {
        try {
            const { id } = req.params;
            const { name, price, description, stock, colors, categoryId } = req.body;
            const product = await productModel.findById(id);
            if (!product) {
                return res.status(404).json({ message: "Product not found" });
            }
            if (categoryId) {
                const category = await categoryModel.findById(categoryId);
                if (!category) {
                    return res.status(400).json({ message: "Category not found" });
                }
                product.categoryId = categoryId || product.categoryId;
            }
            product.name = name || product.name;
            product.price = price || product.price;
            product.description = description || product.description;
            product.stock = stock || product.stock;
            product.colors = colors || product.colors;
            if (req.files && req.files.length > 0) {
                const imageIds = product.images.map(image => image.split('/').pop().split('.')[0]);
                await cloudinary.api.delete_resources(imageIds.map(id => `Emart_Cloud_Images/${id}`));
                product.images = req.files.map(file => file.path);
            }
            await product.save();
            res.status(200).json({ message: "Product updated", status: true, data: product });
        } catch (error) {
            res.status(500).json({ message: "Error updating product", error: error.message });
        }
    }
    static async getAll(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const size = parseInt(req.query.size) || 10;

            const skip = (page - 1) * size;
            const limit = size;

            const products = await productModel.find().skip(skip).limit(limit);

            const totalProducts = await productModel.countDocuments();
            const totalPages = Math.ceil(totalProducts / size);


            res.status(200).json({
                message: "All categories fetched successfully",
                status: "success",
                data: products,
                pagination: {
                    totalProducts,
                    totalPages,
                    currentPage: page,
                    pageSize: size
                }

            });
        } catch (error) {
            res.status(500).json({ message: "Error fetching products", error: error.message });
        }
    }
    static async delete(req, res) {
        try {
            const { id } = req.params;
            const product = await productModel.findById(id);
            if (!product) {
                return res.status(404).json({ message: "Product not found" });
            }
            const imageIds = product.images.map(image => image.split('/').pop().split('.')[0]);
            if (imageIds.length > 0) {
                await cloudinary.api.delete_resources(imageIds.map(id => `Emart_Cloud_Images/${id}`));
            }
            await productModel.findByIdAndDelete(id);
            res.status(200).json({ message: "Product deleted successfully", status: true });
        } catch (error) {
            res.status(500).json({ message: "Error deleting product", error: error.message });
        }
    }

}