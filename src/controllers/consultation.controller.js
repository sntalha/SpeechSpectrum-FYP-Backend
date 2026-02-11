async function getUserRole(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

export default class Consultation {
    static async requestConsultation(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { expert_id, child_id } = req.body;
            if (!expert_id || !child_id) {
                return res.status(400).json({ message: 'expert_id and child_id are required', status: false });
            }

            const { data: child, error: childError } = await supabase
                .from('children')
                .select('child_id')
                .eq('child_id', child_id)
                .eq('parent_user_id', user.id)
                .single();

            if (childError || !child) {
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            const { data: expert, error: expertError } = await supabase
                .from('expert_users')
                .select('expert_id, approval_status')
                .eq('expert_id', expert_id)
                .single();

            if (expertError || !expert) {
                return res.status(404).json({ message: 'Expert not found', status: false });
            }

            if (expert.approval_status !== 'approved') {
                return res.status(400).json({ message: 'Expert is not approved', status: false });
            }

            const { data: existing, error: existingError } = await supabase
                .from('consultation_requests')
                .select('request_id, status')
                .eq('parent_user_id', user.id)
                .eq('expert_id', expert_id)
                .eq('child_id', child_id)
                .in('status', ['pending', 'approved'])
                .limit(1)
                .maybeSingle();

            if (existingError) {
                return res.status(400).json({ message: 'Error checking existing requests', error: existingError.message, status: false });
            }

            if (existing) {
                return res.status(409).json({ message: 'Consultation request already exists', status: false });
            }

            const { data, error } = await supabase
                .from('consultation_requests')
                .insert([
                    {
                        parent_user_id: user.id,
                        expert_id,
                        child_id,
                        status: 'pending'
                    }
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: 'Error creating consultation request', error: error.message, status: false });
            }

            res.status(201).json({
                message: 'Consultation request created successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error creating consultation request', error: error.message, status: false });
        }
    }

    static async respondConsultation(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { request_id, status } = req.body;
            if (!request_id || !status) {
                return res.status(400).json({ message: 'request_id and status are required', status: false });
            }

            const normalizedStatus = String(status).toLowerCase();
            if (!['approved', 'rejected'].includes(normalizedStatus)) {
                return res.status(400).json({ message: 'status must be approved or rejected', status: false });
            }

            const { data: request, error: requestError } = await supabase
                .from('consultation_requests')
                .select('request_id, parent_user_id, expert_id, child_id, status')
                .eq('request_id', request_id)
                .eq('expert_id', user.id)
                .single();

            if (requestError || !request) {
                return res.status(404).json({ message: 'Consultation request not found', status: false });
            }

            if (request.status === normalizedStatus) {
                return res.status(400).json({ message: `Request already ${normalizedStatus}`, status: false });
            }

            const { data: updated, error: updateError } = await supabase
                .from('consultation_requests')
                .update({ status: normalizedStatus })
                .eq('request_id', request_id)
                .select()
                .single();

            if (updateError) {
                return res.status(400).json({ message: 'Error updating consultation request', error: updateError.message, status: false });
            }

            let linkData = null;
            if (normalizedStatus === 'approved') {
                const { data: link, error: linkError } = await supabase
                    .from('expert_child_links')
                    .upsert([
                        {
                            expert_id: request.expert_id,
                            child_id: request.child_id,
                            parent_user_id: request.parent_user_id
                        }
                    ], { onConflict: 'expert_id,child_id' })
                    .select()
                    .single();

                if (linkError) {
                    return res.status(400).json({ message: 'Consultation approved but link creation failed', error: linkError.message, status: false });
                }
                linkData = link;
            }

            res.status(200).json({
                message: `Consultation request ${normalizedStatus} successfully`,
                data: { request: updated, link: linkData },
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error responding to consultation request', error: error.message, status: false });
        }
    }
}
