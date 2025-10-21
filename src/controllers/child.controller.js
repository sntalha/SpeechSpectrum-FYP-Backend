import supabase from '../db/db.connect.js';

export default class Child {
    static async createChild(req, res) {
        try {
            const { child_name, date_of_birth, gender } = req.body;
            const parent_id = req.user.id;

            if (!child_name || !date_of_birth || !gender) {
                return res.status(400).json({
                    message: "Child name, date of birth, and gender are required",
                    status: false
                });
            }

            const { data, error } = await supabase
                .from('children')
                .insert([
                    { parent_id, child_name, date_of_birth, gender }
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({
                    message: "Error creating child profile",
                    error: error.message,
                    status: false
                });
            }

            res.status(201).json({
                message: "Child profile created successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error creating child profile",
                error: error.message,
                status: false
            });
        }
    }

    static async getChildren(req, res) {
        try {
            const parent_id = req.user.id;

            const { data, error } = await supabase
                .from('children')
                .select('*')
                .eq('parent_id', parent_id);

            if (error) {
                return res.status(400).json({
                    message: "Error fetching children",
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: "Children fetched successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error fetching children",
                error: error.message,
                status: false
            });
        }
    }

    static async getChild(req, res) {
        try {
            const { child_id } = req.params;
            const parent_id = req.user.id;

            const { data, error } = await supabase
                .from('children')
                .select('*')
                .eq('child_id', child_id)
                .eq('parent_id', parent_id)
                .single();

            if (error) {
                return res.status(400).json({
                    message: "Error fetching child",
                    error: error.message,
                    status: false
                });
            }

            if (!data) {
                return res.status(404).json({
                    message: "Child not found",
                    status: false
                });
            }

            res.status(200).json({
                message: "Child fetched successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error fetching child",
                error: error.message,
                status: false
            });
        }
    }

    static async updateChild(req, res) {
        try {
            const { child_id } = req.params;
            const parent_id = req.user.id;
            const { child_name, date_of_birth, gender } = req.body;

            const updates = {};
            if (child_name) updates.child_name = child_name;
            if (date_of_birth) updates.date_of_birth = date_of_birth;
            if (gender) updates.gender = gender;

            const { data, error } = await supabase
                .from('children')
                .update(updates)
                .eq('child_id', child_id)
                .eq('parent_id', parent_id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({
                    message: "Error updating child profile",
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: "Child profile updated successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error updating child profile",
                error: error.message,
                status: false
            });
        }
    }

    static async deleteChild(req, res) {
        try {
            const { child_id } = req.params;
            const parent_id = req.user.id;

            const { error } = await supabase
                .from('children')
                .delete()
                .eq('child_id', child_id)
                .eq('parent_id', parent_id);

            if (error) {
                return res.status(400).json({
                    message: "Error deleting child profile",
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: "Child profile deleted successfully",
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error deleting child profile",
                error: error.message,
                status: false
            });
        }
    }
}