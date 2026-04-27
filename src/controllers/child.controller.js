const EXPERT_CHILD_ACCESS_STATUSES = ['scheduled', 'confirmed'];

async function getRoleForUser(supabase, userId) {
    return supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
}

async function getExpertAccessibleChildIds(supabase, expertId) {
    const { data, error } = await supabase
        .from('appointments')
        .select('child_id')
        .eq('expert_id', expertId)
        .in('status', EXPERT_CHILD_ACCESS_STATUSES);

    if (error) {
        return { childIds: [], error };
    }

    const childIds = [...new Set((data || []).map((row) => row.child_id).filter(Boolean))];
    return { childIds, error: null };
}

async function canExpertAccessChild(supabase, expertId, childId) {
    const { data, error } = await supabase
        .from('appointments')
        .select('appointment_id')
        .eq('expert_id', expertId)
        .eq('child_id', childId)
        .in('status', EXPERT_CHILD_ACCESS_STATUSES)
        .limit(1)
        .maybeSingle();

    return { allowed: !!data, error };
}

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

            const { data: profile, error: roleError } = await getRoleForUser(supabase, user.id);
            if (roleError || !profile?.role) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            let data = [];
            let error = null;

            if (profile.role === 'parent') {
                const result = await supabase
                    .from('children')
                    .select('*')
                    .eq('parent_user_id', user.id);

                data = result.data || [];
                error = result.error;
            } else if (profile.role === 'expert') {
                const { childIds, error: childIdsError } = await getExpertAccessibleChildIds(supabase, user.id);

                if (childIdsError) {
                    return res.status(400).json({
                        message: 'Error fetching children',
                        error: childIdsError.message,
                        status: false
                    });
                }

                if (!childIds.length) {
                    return res.status(200).json({
                        message: 'Children fetched successfully',
                        data: [],
                        status: true
                    });
                }

                const result = await supabase
                    .from('children')
                    .select('*')
                    .in('child_id', childIds);

                data = result.data || [];
                error = result.error;
            } else {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

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
            const { data: profile, error: roleError } = await getRoleForUser(supabase, user.id);
            if (roleError || !profile?.role) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            if (profile.role === 'expert') {
                const { allowed, error: accessError } = await canExpertAccessChild(supabase, user.id, child_id);

                if (accessError) {
                    return res.status(400).json({
                        message: 'Error validating child access',
                        error: accessError.message,
                        status: false
                    });
                }

                if (!allowed) {
                    return res.status(403).json({
                        message: 'Experts can only access children from scheduled or confirmed appointments',
                        status: false
                    });
                }
            } else if (profile.role !== 'parent') {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            let query = supabase
                .from('children')
                .select('*')
                .eq('child_id', child_id);

            if (profile.role === 'parent') {
                query = query.eq('parent_user_id', user.id);
            }

            const { data, error } = await query.maybeSingle();

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