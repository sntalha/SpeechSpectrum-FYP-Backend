import ZoomService from '../utils/zoom-service.js';

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

function combineDateAndTime(slotDate, startTime) {
    const scheduledAt = new Date(`${slotDate}T${startTime}`);
    return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt.toISOString();
}

function getDurationMinutes(startTime, endTime) {
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }

    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) {
        return null;
    }

    return Math.floor(diffMs / 60000);
}

function resolveFee(slot, bookedMode) {
    if (bookedMode === 'online') {
        return slot.fee_online;
    }

    if (bookedMode === 'physical') {
        return slot.fee_physical;
    }

    return null;
}

function canUseMode(slotMode, bookedMode) {
    return slotMode === 'both' || slotMode === bookedMode;
}

async function getAppointmentByIdWithRelations(supabase, appointmentId) {
    return supabase
        .from('appointments')
        .select(`
            appointment_id,
            slot_id,
            expert_id,
            parent_id,
            child_id,
            booked_mode,
            fee_charged,
            currency,
            scheduled_at,
            duration_minutes,
            status,
            meet_link,
            cancelled_by,
            cancellation_reason,
            cancelled_at,
            created_at,
            updated_at,
            appointment_slots (
                slot_id,
                slot_date,
                start_time,
                end_time,
                mode,
                status,
                location_id,
                expert_locations (
                    location_id,
                    label,
                    address,
                    city,
                    maps_url
                )
            ),
            children (
                child_id,
                child_name
            ),
            expert_users (
                expert_id,
                full_name,
                specialization,
                contact_email,
                phone
            )
        `)
        .eq('appointment_id', appointmentId)
        .single();
}

export default class Appointment {
    static async bookAppointment(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'parent') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { slot_id, child_id, booked_mode } = req.body;

            if (!slot_id || !child_id || !booked_mode) {
                return res.status(400).json({ success: false, message: 'slot_id, child_id and booked_mode are required' });
            }

            const normalizedMode = String(booked_mode).toLowerCase();
            if (!['online', 'physical'].includes(normalizedMode)) {
                return res.status(400).json({ success: false, message: 'booked_mode must be online or physical' });
            }

            const { data: child, error: childError } = await supabase
                .from('children')
                .select('child_id, parent_user_id')
                .eq('child_id', child_id)
                .single();

            if (childError) {
                return res.status(400).json({ success: false, message: childError.message });
            }

            if (!child || child.parent_user_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'You can only book appointments for your own child' });
            }

            const { data: slot, error: slotError } = await supabase
                .from('appointment_slots')
                .select('slot_id, expert_id, slot_date, start_time, end_time, mode, fee_online, fee_physical, currency, status')
                .eq('slot_id', slot_id)
                .single();

            if (slotError) {
                return res.status(400).json({ success: false, message: slotError.message });
            }

            if (!slot) {
                return res.status(404).json({ success: false, message: 'Slot not found' });
            }

            if (slot.status !== 'available') {
                return res.status(400).json({ success: false, message: 'Slot is not available' });
            }

            if (!canUseMode(slot.mode, normalizedMode)) {
                return res.status(400).json({ success: false, message: 'Requested booking mode is not supported for this slot' });
            }

            const feeCharged = resolveFee(slot, normalizedMode);
            if (feeCharged === null || feeCharged === undefined) {
                return res.status(400).json({ success: false, message: 'Selected slot does not have a fee for this mode' });
            }

            const scheduledAt = combineDateAndTime(slot.slot_date, slot.start_time);
            if (!scheduledAt) {
                return res.status(400).json({ success: false, message: 'Invalid slot date/time' });
            }

            const durationMinutes = getDurationMinutes(slot.start_time, slot.end_time);
            if (!durationMinutes) {
                return res.status(400).json({ success: false, message: 'Invalid slot duration' });
            }

            const { data: bookedSlot, error: updateSlotError } = await supabase
                .from('appointment_slots')
                .update({ status: 'booked' })
                .eq('slot_id', slot.slot_id)
                .eq('status', 'available')
                .select('slot_id')
                .maybeSingle();

            if (updateSlotError) {
                return res.status(400).json({ success: false, message: updateSlotError.message });
            }

            if (!bookedSlot) {
                const { data: latestSlot, error: latestSlotError } = await supabase
                    .from('appointment_slots')
                    .select('slot_id, status')
                    .eq('slot_id', slot.slot_id)
                    .maybeSingle();

                if (latestSlotError) {
                    return res.status(400).json({ success: false, message: latestSlotError.message });
                }

                if (latestSlot && latestSlot.status === 'available') {
                    return res.status(403).json({
                        success: false,
                        message: 'Booking failed due to slot update permission (RLS policy). Slot is still available.'
                    });
                }

                return res.status(400).json({ success: false, message: 'Slot is no longer available' });
            }

            const { data: appointment, error: insertAppointmentError } = await supabase
                .from('appointments')
                .insert([
                    {
                        slot_id: slot.slot_id,
                        expert_id: slot.expert_id,
                        parent_id: auth.user.id,
                        child_id,
                        booked_mode: normalizedMode,
                        fee_charged: feeCharged,
                        currency: slot.currency || 'PKR',
                        scheduled_at: scheduledAt,
                        duration_minutes: durationMinutes,
                        status: 'scheduled'
                    }
                ])
                .select()
                .single();

            if (insertAppointmentError) {
                const { error: revertError } = await supabase
                    .from('appointment_slots')
                    .update({ status: 'available' })
                    .eq('slot_id', slot.slot_id);

                if (revertError) {
                    return res.status(400).json({
                        success: false,
                        message: `Appointment creation failed and slot rollback failed: ${insertAppointmentError.message}`
                    });
                }

                return res.status(400).json({ success: false, message: insertAppointmentError.message });
            }

            return res.status(201).json({ success: true, data: appointment });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async getMyAppointments(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (!['parent', 'expert'].includes(auth.role)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            let query = supabase
                .from('appointments')
                .select(`
                    appointment_id,
                    slot_id,
                    expert_id,
                    parent_id,
                    child_id,
                    booked_mode,
                    fee_charged,
                    currency,
                    scheduled_at,
                    duration_minutes,
                    status,
                    meet_link,
                    cancelled_by,
                    cancellation_reason,
                    cancelled_at,
                    created_at,
                    updated_at,
                    children ( child_id, child_name ),
                    expert_users ( expert_id, full_name, specialization ),
                    appointment_slots ( slot_id, slot_date, start_time, end_time, mode, location_id )
                `)
                .order('scheduled_at', { ascending: false });

            if (auth.role === 'parent') {
                query = query.eq('parent_id', auth.user.id);
            } else {
                query = query.eq('expert_id', auth.user.id);
            }

            const { data, error } = await query;
            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async getAppointmentById(req, res) {
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

            const { data: appointment, error } = await getAppointmentByIdWithRelations(supabase, appointmentId);

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
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

            return res.status(200).json({ success: true, data: appointment });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async confirmAppointment(req, res) {
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

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, expert_id, status')
                .eq('appointment_id', appointmentId)
                .single();

            if (appointmentError) {
                return res.status(400).json({ success: false, message: appointmentError.message });
            }

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }

            if (appointment.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (appointment.status === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Cancelled appointment cannot be confirmed' });
            }

            const { data, error } = await supabase
                .from('appointments')
                .update({ status: 'confirmed' })
                .eq('appointment_id', appointmentId)
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

    static async completeAppointment(req, res) {
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

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, expert_id, status')
                .eq('appointment_id', appointmentId)
                .single();

            if (appointmentError) {
                return res.status(400).json({ success: false, message: appointmentError.message });
            }

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }

            if (appointment.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (appointment.status === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Cancelled appointment cannot be completed' });
            }

            const { data, error } = await supabase
                .from('appointments')
                .update({ status: 'completed' })
                .eq('appointment_id', appointmentId)
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

    static async cancelAppointment(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (!['parent', 'expert'].includes(auth.role)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { appointmentId } = req.params;
            const { cancellation_reason } = req.body;

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, slot_id, parent_id, expert_id, status')
                .eq('appointment_id', appointmentId)
                .single();

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

            if (appointment.status === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Appointment is already cancelled' });
            }

            const { data, error: cancelError } = await supabase
                .from('appointments')
                .update({
                    status: 'cancelled',
                    cancelled_by: auth.role,
                    cancellation_reason: cancellation_reason || null,
                    cancelled_at: new Date().toISOString()
                })
                .eq('appointment_id', appointmentId)
                .select()
                .single();

            if (cancelError) {
                return res.status(400).json({ success: false, message: cancelError.message });
            }

            const { error: revertSlotError } = await supabase
                .from('appointment_slots')
                .update({ status: 'available' })
                .eq('slot_id', appointment.slot_id);

            if (revertSlotError) {
                return res.status(400).json({ success: false, message: revertSlotError.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async markNoShow(req, res) {
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

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, expert_id, status')
                .eq('appointment_id', appointmentId)
                .single();

            if (appointmentError) {
                return res.status(400).json({ success: false, message: appointmentError.message });
            }

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found' });
            }

            if (appointment.expert_id !== auth.user.id) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            if (appointment.status === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Cancelled appointment cannot be marked as no_show' });
            }

            const { data, error } = await supabase
                .from('appointments')
                .update({ status: 'no_show' })
                .eq('appointment_id', appointmentId)
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

    static async getAllAppointments(req, res) {
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
                .from('appointments')
                .select(`
                    appointment_id,
                    slot_id,
                    expert_id,
                    parent_id,
                    child_id,
                    booked_mode,
                    fee_charged,
                    currency,
                    scheduled_at,
                    duration_minutes,
                    status,
                    meet_link,
                    cancelled_by,
                    cancellation_reason,
                    cancelled_at,
                    created_at,
                    updated_at,
                    children ( child_id, child_name ),
                    expert_users ( expert_id, full_name, specialization ),
                    appointment_slots ( slot_id, slot_date, start_time, end_time, mode )
                `)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ success: false, message: error.message });
            }

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    static async generateZoomLink(req, res) {
        try {
            const supabase = req.supabase;
            const auth = await getAuthContext(supabase);

            if (auth.error === 'Unauthorized') {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            if (auth.role !== 'expert') {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }

            const { topic, start_time, duration, timezone } = req.body;

            if (!topic || !start_time) {
                return res.status(400).json({ success: false, message: 'topic and start_time are required' });
            }

            const parsedDate = new Date(start_time);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({ success: false, message: 'Invalid start_time format' });
            }

            const meetingDetails = await ZoomService.createMeeting({
                topic,
                start_time,
                duration: duration || 30,
                timezone: timezone || 'UTC'
            });

            return res.status(200).json({
                success: true,
                data: {
                    join_url: meetingDetails.join_url,
                    meeting_id: meetingDetails.meeting_id,
                    password: meetingDetails.password
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
}
