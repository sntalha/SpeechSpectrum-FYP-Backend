import { cloudinary } from '../config/cloudinary-config.js';

export default class Storage {
    static async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'Image file is required', status: false });
            }

            // Extract public_id from Cloudinary file
            const image_public_id = req.file.filename;

            if (!image_public_id) {
                return res.status(400).json({ message: 'Failed to upload image file', status: false });
            }

            res.status(201).json({
                message: 'Image uploaded successfully',
                data: { image_public_id },
                status: true
            });

        } catch (error) {
            // Clean up uploaded file on error
            if (req.file?.filename) {
                try {
                    await cloudinary.uploader.destroy(`${req.file.filename}`);
                } catch (deleteErr) {
                    console.error('Error deleting file from Cloudinary:', deleteErr.message);
                }
            }

            res.status(500).json({
                message: 'Error uploading image',
                error: error.message,
                status: false
            });
        }
    }

    static async uploadDocument(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'Document file is required', status: false });
            }

            // Extract public_id from Cloudinary file
            const document_public_id = req.file.filename;

            if (!document_public_id) {
                return res.status(400).json({ message: 'Failed to upload document file', status: false });
            }

            res.status(201).json({
                message: 'Document uploaded successfully',
                data: { document_public_id },
                status: true
            });

        } catch (error) {
            // Clean up uploaded file on error
            if (req.file?.filename) {
                try {
                    await cloudinary.uploader.destroy(`${req.file.filename}`);
                } catch (deleteErr) {
                    console.error('Error deleting file from Cloudinary:', deleteErr.message);
                }
            }

            res.status(500).json({
                message: 'Error uploading document',
                error: error.message,
                status: false
            });
        }
    }

    static async deleteImage(req, res) {
        try {
            const { image_public_id } = req.body;

            if (!image_public_id) {
                return res.status(400).json({ message: 'Image public ID is required', status: false });
            }

            // Delete file from Cloudinary
            const { result } = await cloudinary.uploader.destroy(image_public_id);

            if (result !== 'ok') {
                console.warn(`Warning: File deletion from Cloudinary may have failed for public_id: ${image_public_id}`);
            }

            res.status(200).json({
                message: 'Image deleted successfully',
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: 'Error deleting image',
                error: error.message,
                status: false
            });
        }
    }

    static async deleteDocument(req, res) {
        try {
            const { document_public_id } = req.body;

            if (!document_public_id) {
                return res.status(400).json({ message: 'Document public ID is required', status: false });
            }

            // Delete file from Cloudinary
            const { result } = await cloudinary.uploader.destroy(document_public_id);

            if (result !== 'ok') {
                console.warn(`Warning: File deletion from Cloudinary may have failed for public_id: ${document_public_id}`);
            }

            res.status(200).json({
                message: 'Document deleted successfully',
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: 'Error deleting document',
                error: error.message,
                status: false
            });
        }
    }
}
