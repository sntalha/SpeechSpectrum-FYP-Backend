async function getUserRole(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

export default class Link {
    static async createLink(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (!['expert', 'admin'].includes(role)) return res.status(403).json({ message: 'Forbidden', status: false });

            const { parent_user_id, child_id, expert_id } = req.body;
            const resolvedExpertId = role === 'expert' ? user.id : expert_id;

            if (!resolvedExpertId || !parent_user_id || !child_id) {
                return res.status(400).json({ message: 'expert_id, parent_user_id, and child_id are required', status: false });
            }

            const { data: approvedRequest, error: approvedError } = await supabase
                .from('consultation_requests')
                .select('request_id, status')
                .eq('parent_user_id', parent_user_id)
                .eq('expert_id', resolvedExpertId)
                .eq('child_id', child_id)
                .eq('status', 'approved')
                .maybeSingle();

            if (approvedError) {
                return res.status(400).json({ message: 'Error validating consultation request', error: approvedError.message, status: false });
            }

            if (!approvedRequest) {
                return res.status(400).json({ message: 'No approved consultation request found', status: false });
            }

            const { data: link, error: linkError } = await supabase
                .from('expert_child_links')
                .upsert([
                    { expert_id: resolvedExpertId, child_id, parent_user_id }
                ], { onConflict: 'expert_id,child_id' })
                .select()
                .single();

            if (linkError) {
                return res.status(400).json({ message: 'Error creating expert-child link', error: linkError.message, status: false });
            }

            res.status(201).json({
                message: 'Expert-child link created successfully',
                data: link,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error creating expert-child link', error: error.message, status: false });
        }
    }

    static async getParentLinks(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('expert_child_links')
                .select('link_id, linked_at, expert_id, child_id, parent_user_id, children ( child_id, child_name ), expert_users ( expert_id, full_name, specialization, organization, contact_email, phone )')
                .eq('parent_user_id', user.id)
                .order('linked_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching links', error: error.message, status: false });
            }

            res.status(200).json({ message: 'Links fetched successfully', data, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching links', error: error.message, status: false });
        }
    }

    static async getExpertLinks(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('expert_child_links')
                .select('link_id, linked_at, expert_id, child_id, parent_user_id, children ( child_id, child_name )')
                .eq('expert_id', user.id)
                .order('linked_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching links', error: error.message, status: false });
            }

            res.status(200).json({ message: 'Links fetched successfully', data, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching links', error: error.message, status: false });
        }
    }
}
