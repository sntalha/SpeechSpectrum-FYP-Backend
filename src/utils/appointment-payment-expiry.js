import { createClient } from '@supabase/supabase-js';
import Constants from '../constant.js';
import { notifyAppointmentCancelled, notifyPaymentStatus } from '../services/notification-events.service.js';

export const PAYMENT_DEADLINE_HOURS = 24;
export const AUTO_PAYMENT_TIMEOUT_REASON = 'Auto-cancelled: payment not completed within 24 hours of expert confirmation';

function getServiceSupabaseClient() {
    const supabaseKey = Constants.SUPABASE_SERVICE_KEY || Constants.SUPABASE_API_KEY;

    if (!Constants.SUPABASE_URL || !supabaseKey) {
        throw new Error('Supabase service credentials are not configured');
    }

    return createClient(Constants.SUPABASE_URL, supabaseKey);
}

function getCutoffIso() {
    return new Date(Date.now() - PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000).toISOString();
}

export async function expireUnpaidConfirmedAppointments() {
    const supabase = getServiceSupabaseClient();
    const cutoffIso = getCutoffIso();

    const { data: overdueCandidates, error: fetchError } = await supabase
        .from('appointments')
        .select('appointment_id, slot_id, parent_id, expert_id')
        .eq('status', 'confirmed')
        .or('payment_status.eq.pending,payment_status.is.null')
        .lte('updated_at', cutoffIso);

    if (fetchError) {
        throw fetchError;
    }

    if (!overdueCandidates?.length) {
        return {
            cancelledAppointments: 0,
            releasedSlots: 0,
            cancelledPayments: 0
        };
    }

    const appointmentIds = overdueCandidates.map((row) => row.appointment_id);
    const nowIso = new Date().toISOString();

    const { data: cancelledAppointments, error: cancelAppointmentsError } = await supabase
        .from('appointments')
        .update({
            status: 'cancelled',
            cancelled_by: 'system',
            cancellation_reason: AUTO_PAYMENT_TIMEOUT_REASON,
            cancelled_at: nowIso,
            updated_at: nowIso
        })
        .in('appointment_id', appointmentIds)
        .eq('status', 'confirmed')
        .or('payment_status.eq.pending,payment_status.is.null')
        .select('appointment_id, slot_id, parent_id, expert_id');

    if (cancelAppointmentsError) {
        throw cancelAppointmentsError;
    }

    if (!cancelledAppointments?.length) {
        return {
            cancelledAppointments: 0,
            releasedSlots: 0,
            cancelledPayments: 0
        };
    }

    const cancelledAppointmentIds = cancelledAppointments.map((row) => row.appointment_id);
    const slotIds = [...new Set(cancelledAppointments.map((row) => row.slot_id).filter(Boolean))];

    let releasedSlots = 0;
    if (slotIds.length > 0) {
        const { data: releasedSlotRows, error: releaseSlotsError } = await supabase
            .from('appointment_slots')
            .update({ status: 'available' })
            .in('slot_id', slotIds)
            .eq('status', 'booked')
            .select('slot_id');

        if (releaseSlotsError) {
            throw releaseSlotsError;
        }

        releasedSlots = releasedSlotRows?.length || 0;
    }

    const { data: cancelledPayments, error: updatePaymentsError } = await supabase
        .from('payments')
        .update({ status: 'cancelled', updated_at: nowIso })
        .in('appointment_id', cancelledAppointmentIds)
        .eq('status', 'pending')
        .select('payment_id');

    if (updatePaymentsError) {
        throw updatePaymentsError;
    }

    for (const appointment of cancelledAppointments) {
        notifyAppointmentCancelled(appointment, 'system').catch((error) => {
            console.error('notifyAppointmentCancelled(system) failed:', error?.message || error);
        });
        notifyPaymentStatus(
            appointment.appointment_id,
            'payment.expired',
            'Payment deadline missed',
            'Your appointment was auto-cancelled because payment was not completed in time.'
        ).catch((error) => {
            console.error('notifyPaymentStatus(payment.expired) failed:', error?.message || error);
        });
    }

    return {
        cancelledAppointments: cancelledAppointments.length,
        releasedSlots,
        cancelledPayments: cancelledPayments?.length || 0
    };
}