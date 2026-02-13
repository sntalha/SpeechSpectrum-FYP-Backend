async function getUserRole(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

export default class Expert {
    static async getAllExperts(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Get pagination parameters
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            // Optional filters
            const { specialization, approval_status } = req.query;

            // Build query
            let query = supabase
                .from('expert_users')
                .select('expert_id, full_name, specialization, organization, contact_email, phone, pmdc_number, profile_image_public_id, approval_status, created_at', { count: 'exact' });

            // Apply filters
            if (specialization) {
                query = query.ilike('specialization', `%${specialization}%`);
            }

            if (approval_status) {
                query = query.eq('approval_status', approval_status);
            } else {
                // By default, only show approved experts
                query = query.eq('approval_status', 'approved');
            }

            // Apply pagination
            query = query
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            const { data, error, count } = await query;

            if (error) {
                return res.status(400).json({ message: 'Error fetching experts', error: error.message, status: false });
            }

            const totalPages = Math.ceil(count / limit);

            res.status(200).json({
                message: 'Experts fetched successfully',
                data: {
                    experts: data,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalCount: count,
                        limit,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1
                    }
                },
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching experts', error: error.message, status: false });
        }
    }
}
