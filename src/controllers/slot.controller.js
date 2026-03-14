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

function isValidMode(mode) {
    return ['online', 'physical', 'both'].includes(mode);
}

export default class Slot {
    static async createSlot(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const {
                slot_date,
                start_time,
                end_time,
                mode,
                fee_online,
                fee_physical,
                currency,
                location_id,
                is_recurring,
                recurrence_rule,
                status
            } = req.body;

            if (!slot_date || !start_time || !end_time || !mode) {
                return res.status(400).json({ success: false, message: 'slot_date, start_time, end_time and mode are required' });
            }

            const normalizedMode = String(mode).toLowerCase();
            if (!isValidMode(normalizedMode)) {
                return res.status(400).json({ success: false, message: 'mode must be online, physical, or both' });
            }

            if ((normalizedMode === 'online' || normalizedMode === 'both') && (fee_online === null || fee_online === undefined)) {
                return res.status(400).json({ success: false, message: 'fee_online is required for online/both modes' });
            }

            if ((normalizedMode === 'physical' || normalizedMode === 'both') && (fee_physical === null || fee_physical === undefined)) {
                return res.status(400).json({ success: false, message: 'fee_physical is required for physical/both modes' });
            }

            if ((normalizedMode === 'physical' || normalizedMode === 'both') && !location_id) {
                return res.status(400).json({ success: false, message: 'location_id is required for physical/both modes' });
            }

            if (location_id) {
                const { data: location, error: locationError } = await supabase
                    .from('expert_locations')
                    .select('location_id, expert_id, is_active')
                    .eq('location_id', location_id)
                    .single();

                if (locationError) {
                    return res.status(400).json({ success: false, message: locationError.message });
                }

                if (!location || location.expert_id !== auth.user.id || !location.is_active) {
                    return res.status(400).json({ success: false, message: 'Invalid location_id for this expert' });
                }
            }

            const { data, error } = await supabase
                .from('appointment_slots')
                .insert([
                    {
                        expert_id: auth.user.id,
                        slot_date,
                        start_time,
                        end_time,
                        mode: normalizedMode,
                        fee_online: fee_online ?? null,
                        fee_physical: fee_physical ?? null,
                        currency: currency || 'PKR',
                        location_id: location_id || null,
                        status: status || 'available',
                        is_recurring: Boolean(is_recurring),
                        recurrence_rule: recurrence_rule || null
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

    static async getMySlots(req, res) {
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
                .from('appointment_slots')
                .select('*, expert_locations ( location_id, label, address, city, maps_url )')
                .eq('expert_id', auth.user.id)
                .order('slot_date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async getSlotsByExpert(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'parent') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { expertId } = req.params;

            const { data, error } = await supabase
                .from('appointment_slots')
                .select('*, expert_locations ( location_id, label, address, city, maps_url )')
                .eq('expert_id', expertId)
                .eq('status', 'available')
                .order('slot_date', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async updateSlot(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { slotId } = req.params;
            const {
                slot_date,
                start_time,
                end_time,
                mode,
                fee_online,
                fee_physical,
                currency,
                location_id,
                status,
                is_recurring,
                recurrence_rule
            } = req.body;

            const { data: existingSlot, error: existingError } = await supabase
                .from('appointment_slots')
                .select('slot_id, expert_id, status')
                .eq('slot_id', slotId)
                .single();

            if (existingError) {
                return res.status(400).json({ success: false, message: existingError.message });
            }

            if (!existingSlot) {
                return res.status(404).json({ success: false, message: 'Slot not found' });
            }

            if (existingSlot.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (existingSlot.status === 'booked') {
                return res.status(400).json({ success: false, message: 'Booked slot cannot be updated' });
            }

            const updates = {};
            if (slot_date !== undefined) updates.slot_date = slot_date;
            if (start_time !== undefined) updates.start_time = start_time;
            if (end_time !== undefined) updates.end_time = end_time;
            if (mode !== undefined) {
                const normalizedMode = String(mode).toLowerCase();
                if (!isValidMode(normalizedMode)) {
                    return res.status(400).json({ success: false, message: 'mode must be online, physical, or both' });
                }
                updates.mode = normalizedMode;
            }
            if (fee_online !== undefined) updates.fee_online = fee_online;
            if (fee_physical !== undefined) updates.fee_physical = fee_physical;
            if (currency !== undefined) updates.currency = currency;
            if (status !== undefined) updates.status = status;
            if (is_recurring !== undefined) updates.is_recurring = Boolean(is_recurring);
            if (recurrence_rule !== undefined) updates.recurrence_rule = recurrence_rule;
            if (location_id !== undefined) {
                if (location_id === null) {
                    updates.location_id = null;
                } else {
                    const { data: location, error: locationError } = await supabase
                        .from('expert_locations')
                        .select('location_id, expert_id, is_active')
                        .eq('location_id', location_id)
                        .single();

                    if (locationError) {
                        return res.status(400).json({ success: false, message: locationError.message });
                    }

                    if (!location || location.expert_id !== auth.user.id || !location.is_active) {
                        return res.status(400).json({ success: false, message: 'Invalid location_id for this expert' });
                    }

                    updates.location_id = location_id;
                }
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ success: false, message: 'No fields provided to update' });
            }

            const { data, error } = await supabase
                .from('appointment_slots')
                .update(updates)
                .eq('slot_id', slotId)
                .eq('expert_id', auth.user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async deleteSlot(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { slotId } = req.params;

            const { data: existingSlot, error: existingError } = await supabase
                .from('appointment_slots')
                .select('slot_id, expert_id, status')
                .eq('slot_id', slotId)
                .single();

            if (existingError) {
                return res.status(400).json({ success: false, message: existingError.message });
            }

            if (!existingSlot) {
                return res.status(404).json({ success: false, message: 'Slot not found' });
            }

            if (existingSlot.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (existingSlot.status === 'booked') {
                return res.status(400).json({ success: false, message: 'Booked slot cannot be deleted' });
            }

            const { data, error } = await supabase
                .from('appointment_slots')
                .delete()
                .eq('slot_id', slotId)
                .eq('expert_id', auth.user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async getAllSlots(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { data, error } = await supabase
                .from('appointment_slots')
                .select('*, expert_locations ( location_id, label, address, city, maps_url )')
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
