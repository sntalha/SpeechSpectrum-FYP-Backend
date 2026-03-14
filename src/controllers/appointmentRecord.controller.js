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

async function getAppointment(supabase, appointmentId) {
    return supabase
        .from('appointments')
        .select('appointment_id, parent_id, expert_id, status')
        .eq('appointment_id', appointmentId)
        .single();
}

export default class AppointmentRecord {
    static async createRecord(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { appointmentId } = req.params;
            const { notes, therapy_plan, medication, progress_feedback, next_appointment_notes } = req.body;

            const { data: appointment, error: appointmentError } = await getAppointment(supabase, appointmentId);
            if (appointmentError) {
                return res.status(400).json({ success: false, message: appointmentError.message });
            }

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }

            if (appointment.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (appointment.status !== 'completed') {
                return res.status(400).json({ success: false, message: 'Record can only be created for completed appointments' });
            }

            const payload = {
                appointment_id: appointmentId,
                notes: notes || null,
                therapy_plan: therapy_plan || null,
                medication: medication || null,
                progress_feedback: progress_feedback || null
            };

            if (next_appointment_notes !== undefined) {
                payload.next_appointment_notes = next_appointment_notes;
            }

            const { data, error } = await supabase
                .from('appointment_records')
                .insert([payload])
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

    static async getRecord(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (!['parent', 'expert', 'admin'].includes(auth.role)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { appointmentId } = req.params;
            const { data: appointment, error: appointmentError } = await getAppointment(supabase, appointmentId);

            if (appointmentError) {
                return res.status(400).json({ success: false, message: appointmentError.message });
            }

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }

            if (auth.role === 'parent' && appointment.parent_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (auth.role === 'expert' && appointment.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { data, error } = await supabase
                .from('appointment_records')
                .select('*')
                .eq('appointment_id', appointmentId)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async updateRecord(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { appointmentId, recordId } = req.params;
            const { notes, therapy_plan, medication, progress_feedback, next_appointment_notes } = req.body;

            const { data: appointment, error: appointmentError } = await getAppointment(supabase, appointmentId);
            if (appointmentError) {
                return res.status(400).json({ success: false, message: appointmentError.message });
            }

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }

            if (appointment.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const updates = {};
            if (notes !== undefined) updates.notes = notes;
            if (therapy_plan !== undefined) updates.therapy_plan = therapy_plan;
            if (medication !== undefined) updates.medication = medication;
            if (progress_feedback !== undefined) updates.progress_feedback = progress_feedback;
            if (next_appointment_notes !== undefined) updates.next_appointment_notes = next_appointment_notes;

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ success: false, message: 'No fields provided to update' });
            }

            const { data, error } = await supabase
                .from('appointment_records')
                .update(updates)
                .eq('record_id', recordId)
                .eq('appointment_id', appointmentId)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            if (!data) {
                return res.status(404).json({ success: false, message: 'Record not found' });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
}
