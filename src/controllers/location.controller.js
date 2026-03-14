async function getAuthContext(supabase) {
    const { data: authData, error: userError } = await supabase.auth.getUser();
    if (userError || !authData?.user) {
        return { error: 'Unauthorized' };
    }

    const { data: profile, error: roleError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', authData.user.id)
        .single();

    if (roleError || !profile?.role) {
        return { error: 'Forbidden' };
    }

    return { user: authData.user, role: profile.role };
}

export default class Location {
    static async addLocation(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { label, address, city, maps_url, is_active } = req.body;
            if (!label || !address || !city) {
                return res.status(400).json({ success: false, message: 'label, address and city are required' });
            }

            const { data, error } = await supabase
                .from('expert_locations')
                .insert([
                    {
                        expert_id: auth.user.id,
                        label,
                        address,
                        city,
                        maps_url: maps_url || null,
                        is_active: is_active === undefined ? true : Boolean(is_active)
                    }
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(201).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async getMyLocations(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { data, error } = await supabase
                .from('expert_locations')
                .select('*')
                .eq('expert_id', auth.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async updateLocation(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { locationId } = req.params;
            const { label, address, city, maps_url, is_active } = req.body;

            const updates = {};
            if (label !== undefined) updates.label = label;
            if (address !== undefined) updates.address = address;
            if (city !== undefined) updates.city = city;
            if (maps_url !== undefined) updates.maps_url = maps_url;
            if (is_active !== undefined) updates.is_active = Boolean(is_active);

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ success: false, message: 'No fields provided to update' });
            }

            const { data, error } = await supabase
                .from('expert_locations')
                .update(updates)
                .eq('location_id', locationId)
                .eq('expert_id', auth.user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            if (!data) {
                return res.status(404).json({ success: false, message: 'Location not found' });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async deleteLocation(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { locationId } = req.params;

            const { data, error } = await supabase
                .from('expert_locations')
                .delete()
                .eq('location_id', locationId)
                .eq('expert_id', auth.user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            if (!data) {
                return res.status(404).json({ success: false, message: 'Location not found' });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async getExpertLocations(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (!['parent', 'admin'].includes(auth.role)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { expertId } = req.params;

            const { data, error } = await supabase
                .from('expert_locations')
                .select('*')
                .eq('expert_id', expertId)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
}
