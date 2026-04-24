import { createClient } from '@supabase/supabase-js';
import Constants from '../constant.js';
import { scheduleNotification, sendNotification } from './notification.service.js';

function getServiceSupabaseClient() {
    const serviceKey = Constants.SUPABASE_SERVICE_KEY || Constants.SUPABASE_API_KEY;
    return createClient(Constants.SUPABASE_URL, serviceKey);
}

export async function notifyExpertNewAppointment(appointment) {
    if (!appointment?.expert_id || !appointment?.appointment_id) return;
    await sendNotification({
        recipientUserId: appointment.expert_id,
        eventType: 'appointment.booked',
        title: 'New appointment booking',
        body: 'A parent has booked a new appointment slot.',
        entityType: 'appointment',
        entityId: appointment.appointment_id,
        deepLink: `speechspectrum://appointments/${appointment.appointment_id}`,
        webPath: `/appointments/${appointment.appointment_id}`,
        payload: {
            appointment_id: String(appointment.appointment_id)
        }
    });
}

export async function notifyParentAppointmentConfirmed(appointment) {
    if (!appointment?.parent_id || !appointment?.appointment_id) return;
    await sendNotification({
        recipientUserId: appointment.parent_id,
        eventType: 'appointment.confirmed',
        title: 'Appointment confirmed',
        body: 'Your expert confirmed the appointment. Please complete payment within 24 hours.',
        entityType: 'appointment',
        entityId: appointment.appointment_id,
        deepLink: `speechspectrum://appointments/${appointment.appointment_id}`,
        webPath: `/appointments/${appointment.appointment_id}`
    });
}

export async function scheduleAppointmentReminders(appointment, recipientIds = []) {
    if (!appointment?.appointment_id || !appointment?.scheduled_at) return;

    const scheduleOffsets = [
        { label: '24h', ms: 24 * 60 * 60 * 1000, title: 'Appointment reminder', body: 'Your appointment is in 24 hours.' },
        { label: '1h', ms: 60 * 60 * 1000, title: 'Appointment reminder', body: 'Your appointment starts in 1 hour.' },
        { label: '15m', ms: 15 * 60 * 1000, title: 'Appointment reminder', body: 'Your appointment starts in 15 minutes.' }
    ];

    const scheduledAtMs = new Date(appointment.scheduled_at).getTime();
    if (Number.isNaN(scheduledAtMs)) return;

    for (const userId of recipientIds.filter(Boolean)) {
        for (const slot of scheduleOffsets) {
            const notifyAt = new Date(scheduledAtMs - slot.ms);
            if (notifyAt.getTime() <= Date.now()) continue;

            await scheduleNotification({
                recipientUserId: userId,
                eventType: 'appointment.reminder',
                title: slot.title,
                body: slot.body,
                entityType: 'appointment',
                entityId: appointment.appointment_id,
                deepLink: `speechspectrum://appointments/${appointment.appointment_id}`,
                webPath: `/appointments/${appointment.appointment_id}`,
                payload: { reminder_slot: slot.label },
                scheduledFor: notifyAt.toISOString(),
                dedupeKey: `appointment:${appointment.appointment_id}:${userId}:${slot.label}`
            });
        }
    }
}

export async function notifyAppointmentCancelled(appointment, actorRole = 'system') {
    if (!appointment?.appointment_id) return;
    const recipients = [appointment.parent_id, appointment.expert_id].filter(Boolean);
    const body = actorRole === 'parent'
        ? 'The parent cancelled this appointment.'
        : actorRole === 'expert'
            ? 'The expert cancelled this appointment.'
            : 'This appointment has been cancelled.';

    await Promise.all(recipients.map((userId) => sendNotification({
        recipientUserId: userId,
        eventType: 'appointment.cancelled',
        title: 'Appointment cancelled',
        body,
        entityType: 'appointment',
        entityId: appointment.appointment_id,
        deepLink: `speechspectrum://appointments/${appointment.appointment_id}`,
        webPath: `/appointments/${appointment.appointment_id}`,
        payload: { cancelled_by: actorRole }
    })));
}

export async function notifyAppointmentCompleted(appointment) {
    if (!appointment?.parent_id || !appointment?.appointment_id) return;
    await sendNotification({
        recipientUserId: appointment.parent_id,
        eventType: 'appointment.completed',
        title: 'Appointment completed',
        body: 'Your appointment has been marked as completed.',
        entityType: 'appointment',
        entityId: appointment.appointment_id,
        deepLink: `speechspectrum://appointments/${appointment.appointment_id}`,
        webPath: `/appointments/${appointment.appointment_id}`
    });
}

export async function notifyAppointmentNoShow(appointment) {
    if (!appointment?.parent_id || !appointment?.appointment_id) return;
    await sendNotification({
        recipientUserId: appointment.parent_id,
        eventType: 'appointment.no_show',
        title: 'Appointment marked no-show',
        body: 'This appointment was marked as no-show by your expert.',
        entityType: 'appointment',
        entityId: appointment.appointment_id,
        deepLink: `speechspectrum://appointments/${appointment.appointment_id}`,
        webPath: `/appointments/${appointment.appointment_id}`
    });
}

export async function notifyPaymentStatus(appointmentId, eventType, title, body) {
    const supabase = getServiceSupabaseClient();
    const { data: appointment } = await supabase
        .from('appointments')
        .select('appointment_id, parent_id')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

    if (!appointment?.parent_id) return;

    await sendNotification({
        recipientUserId: appointment.parent_id,
        eventType,
        title,
        body,
        entityType: 'payment',
        entityId: appointmentId,
        deepLink: `speechspectrum://appointments/${appointmentId}/payment`,
        webPath: `/appointments/${appointmentId}/payment`
    });
}

export async function schedulePaymentReminders(appointment) {
    if (!appointment?.parent_id || !appointment?.appointment_id || !appointment?.updated_at) return;
    const base = new Date(appointment.updated_at).getTime();
    if (Number.isNaN(base)) return;

    const reminders = [
        { label: '12h', msAfterConfirm: 12 * 60 * 60 * 1000, body: 'Please complete payment for your confirmed appointment.' },
        { label: '21h', msAfterConfirm: 21 * 60 * 60 * 1000, body: 'Payment deadline is approaching for your appointment.' },
        { label: '23h30m', msAfterConfirm: 23.5 * 60 * 60 * 1000, body: 'Final reminder: complete payment to avoid auto-cancellation.' }
    ];

    for (const reminder of reminders) {
        const when = new Date(base + reminder.msAfterConfirm);
        if (when.getTime() <= Date.now()) continue;

        await scheduleNotification({
            recipientUserId: appointment.parent_id,
            eventType: 'payment.pending_reminder',
            title: 'Payment reminder',
            body: reminder.body,
            entityType: 'payment',
            entityId: appointment.appointment_id,
            deepLink: `speechspectrum://appointments/${appointment.appointment_id}/payment`,
            webPath: `/appointments/${appointment.appointment_id}/payment`,
            payload: { reminder_slot: reminder.label },
            scheduledFor: when.toISOString(),
            dedupeKey: `payment:${appointment.appointment_id}:${appointment.parent_id}:${reminder.label}`
        });
    }
}
