import { cloudinary } from "../config/cloudinary-config.js";
import { categoryModel } from "../models/category.schema.js";

export default class Category{
    static async create(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: "Image is required" });
            }
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ message: "Category name is required" });
            }
            const existingCategory = await categoryModel.findOne({ name: name.trim() });
            if (existingCategory) {
                return res.status(400).json({ message: "Category already exists" });
            }
            const category = await categoryModel.create({
                name,
                image: req.file.path,
                adminId: req.user._id
            });
            await category.save();
            res.status(201).json({ message: "Category created", status: true, data: category });
        } catch (error) {
            res.status(500).json({ message: "Error creating category", error: error.message });
        }
    }
    static async getAll(req, res) {
        try {
            const categories = await categoryModel.find();
            res.status(200).json({ message: "Categories fetched successfully", status: true, data: categories });
        } catch (error) {
            res.status(500).json({ message: "Error fetching categories", error: error.message });
        }
    }
    static async delete(req, res) {
        try {
            const { id } = req.params; 
            const category = await categoryModel.findById(id);
            if (!category) {
                return res.status(404).json({ message: "Category not found", status: false });
            }
            const imageId = category.image.split('/').pop().split('.')[0]; 
            if (imageId) {
                await cloudinary.uploader.destroy(`Emart_Cloud_Images/${imageId}`);
            }
            await categoryModel.findByIdAndDelete(id);
            res.status(200).json({ message: "Category deleted successfully", status: true });
        } catch (error) {
            res.status(500).json({ message: "Error deleting category", error: error.message });
        }
    }
    static async update(req, res) {
        try {
            const { id } = req.params;
            const { name } = req.body;
            const category = await categoryModel.findById(id);
            if (!category) {
                return res.status(404).json({ message: "Category not found" });
            }
            if (name){
                category.name = name.trim();
            }
            if (req.file && req.file.path) {
                const imageId = category.image.split('/').pop().split('.')[0];
                if (imageId) {
                    await cloudinary.uploader.destroy(`Emart_Cloud_Images/${imageId}`);
                }
                category.image = req.file.path;
            }
            await category.save();
            res.status(200).json({ message: "Category updated successfully", status: true, data: category });
        } catch (error) {
            res.status(500).json({ message: "Error updating category", error: error.message });
        }
    }
}
