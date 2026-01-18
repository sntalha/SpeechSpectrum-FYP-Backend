import supabase from '../db/db.connect.js';

export default class Child {
    static async createChild(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { child_name, date_of_birth, gender } = req.body;
            const parent_user_id = user.id;

            if (!child_name || !date_of_birth || !gender) {
                return res.status(400).json({
                    message: "Child name, date of birth, and gender are required",
                    status: false
                });
            }

            // Validate gender and date
            const allowedGenders = ['male', 'female', 'other'];
            if (!allowedGenders.includes(String(gender).toLowerCase())) {
                return res.status(400).json({ message: 'Gender must be one of: male, female, other', status: false });
            }

            const dob = new Date(date_of_birth);
            if (isNaN(dob.getTime())) {
                return res.status(400).json({ message: 'Invalid date_of_birth format', status: false });
            }

            const { data, error } = await supabase
                .from('children')
                .insert([
                    { parent_user_id, child_name, date_of_birth, gender: String(gender).toLowerCase() }
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
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const parent_user_id = user.id;

            const { data, error } = await supabase
                .from('children')
                .select('*')
                .eq('parent_user_id', parent_user_id);

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
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { child_id } = req.params;
            const parent_user_id = user.id;

            const { data, error } = await supabase
                .from('children')
                .select('*')
                .eq('child_id', child_id)
                .eq('parent_user_id', parent_user_id)
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
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { child_id } = req.params;
            const parent_user_id = user.id;
            const { child_name, date_of_birth, gender } = req.body;

            // Validate gender/date if provided
            const allowedGenders = ['male', 'female', 'other'];
            if (gender && !allowedGenders.includes(String(gender).toLowerCase())) {
                return res.status(400).json({ message: 'Gender must be one of: male, female, other', status: false });
            }
            if (date_of_birth) {
                const dob = new Date(date_of_birth);
                if (isNaN(dob.getTime())) {
                    return res.status(400).json({ message: 'Invalid date_of_birth format', status: false });
                }
            }

            const updates = {};
            if (child_name) updates.child_name = child_name;
            if (date_of_birth) updates.date_of_birth = date_of_birth;
            if (gender) updates.gender = String(gender).toLowerCase();

            const { data, error } = await supabase
                .from('children')
                .update(updates)
                .eq('child_id', child_id)
                .eq('parent_user_id', parent_user_id)
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
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { child_id } = req.params;
            const parent_user_id = user.id;

            const { error } = await supabase
                .from('children')
                .delete()
                .eq('child_id', child_id)
                .eq('parent_user_id', parent_user_id);

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