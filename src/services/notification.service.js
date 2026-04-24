import { createClient } from '@supabase/supabase-js';
import Constants from '../constant.js';
import { initializeFirebaseAdmin, isFirebaseConfigured } from './firebase.service.js';

const APP_NAME_DEFAULT = 'main';

function getServiceSupabaseClient() {
    const serviceKey = Constants.SUPABASE_SERVICE_KEY || Constants.SUPABASE_API_KEY;
    return createClient(Constants.SUPABASE_URL, serviceKey);
}

function normalizeEventType(eventType) {
    return String(eventType || '').trim().toLowerCase();
}

async function getPreferences(supabase, userId) {
    const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        return null;
    }

    return data;
}

function eventAllowedByPreferences(eventType, preferences) {
    if (!preferences) return true;
    if (!preferences.push_enabled) return false;

    if (eventType.startsWith('appointment.')) return preferences.appointments_enabled;
    if (eventType.startsWith('payment.')) return preferences.payments_enabled;
    if (eventType.startsWith('record.')) return preferences.records_enabled;
    if (eventType.startsWith('assessment.')) return preferences.assessments_enabled;
    if (eventType.startsWith('expert.')) return preferences.expert_approval_enabled;
    if (eventType.endsWith('.reminder')) return preferences.reminders_enabled;
    return true;
}

async function saveNotification(supabase, payload) {
    const { data, error } = await supabase
        .from('notifications')
        .insert([payload])
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function fetchActiveTokens(supabase, userId) {
    const { data, error } = await supabase
        .from('user_push_tokens')
        .select('token_id, fcm_token, platform')
        .eq('user_id', userId)
        .eq('is_active', true);

    if (error) {
        return [];
    }

    return data || [];
}

async function insertDeliveryLogs(supabase, notificationId, tokens) {
    if (!tokens.length) return [];

    const rows = tokens.map((tokenRow) => ({
        notification_id: notificationId,
        token_id: tokenRow.token_id,
        provider: 'fcm',
        status: 'queued'
    }));

    const { data, error } = await supabase
        .from('notification_deliveries')
        .insert(rows)
        .select('delivery_id, token_id');

    if (error) {
        return [];
    }

    return data || [];
}

async function updateDeliveries(supabase, updates) {
    for (const item of updates) {
        await supabase
            .from('notification_deliveries')
            .update(item.values)
            .eq('delivery_id', item.delivery_id);
    }
}

async function disableInvalidToken(supabase, tokenId) {
    await supabase
        .from('user_push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('token_id', tokenId);
}

export async function sendNotification({
    recipientUserId,
    eventType,
    title,
    body,
    entityType = 'system',
    entityId = null,
    deepLink = null,
    webPath = null,
    payload = {}
}) {
    const supabase = getServiceSupabaseClient();
    const normalizedEventType = normalizeEventType(eventType);
    const preferences = await getPreferences(supabase, recipientUserId);

    const notification = await saveNotification(supabase, {
        recipient_user_id: recipientUserId,
        event_type: normalizedEventType,
        title,
        body,
        entity_type: entityType,
        entity_id: entityId,
        deep_link: deepLink,
        web_path: webPath,
        payload
    });

    if (!eventAllowedByPreferences(normalizedEventType, preferences)) {
        return { notification, delivered: false, reason: 'disabled_by_preference' };
    }

    const tokens = await fetchActiveTokens(supabase, recipientUserId);
    if (!tokens.length) {
        return { notification, delivered: false, reason: 'no_active_token' };
    }

    const deliveries = await insertDeliveryLogs(supabase, notification.notification_id, tokens);
    const tokenById = new Map(tokens.map((token) => [token.token_id, token]));
    const deliveryByTokenId = new Map(deliveries.map((d) => [d.token_id, d.delivery_id]));

    if (!isFirebaseConfigured()) {
        const failedUpdates = deliveries.map((delivery) => ({
            delivery_id: delivery.delivery_id,
            values: {
                status: 'failed',
                error_code: 'firebase_not_configured',
                error_message: 'Firebase Admin credentials are missing'
            }
        }));
        await updateDeliveries(supabase, failedUpdates);
        return { notification, delivered: false, reason: 'firebase_not_configured' };
    }

    const admin = initializeFirebaseAdmin();
    const message = {
        tokens: tokens.map((t) => t.fcm_token),
        notification: {
            title,
            body
        },
        data: {
            type: normalizedEventType,
            entity_type: String(entityType || ''),
            entity_id: entityId ? String(entityId) : '',
            deep_link: deepLink || '',
            web_path: webPath || ''
        }
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    const updates = [];
    response.responses.forEach((result, idx) => {
        const token = tokens[idx];
        const deliveryId = deliveryByTokenId.get(token.token_id);
        if (!deliveryId) return;

        if (result.success) {
            updates.push({
                delivery_id: deliveryId,
                values: {
                    status: 'sent',
                    provider_message_id: result.messageId || null,
                    sent_at: new Date().toISOString()
                }
            });
            return;
        }

        const errorCode = result.error?.code || 'unknown';
        const invalidTokenCodes = new Set([
            'messaging/registration-token-not-registered',
            'messaging/invalid-registration-token'
        ]);
        const status = invalidTokenCodes.has(errorCode) ? 'invalid_token' : 'failed';

        updates.push({
            delivery_id: deliveryId,
            values: {
                status,
                error_code: errorCode,
                error_message: result.error?.message || null
            }
        });
    });

    await updateDeliveries(supabase, updates);

    for (const update of updates) {
        if (update.values.status === 'invalid_token') {
            const delivery = deliveries.find((d) => d.delivery_id === update.delivery_id);
            if (delivery) {
                await disableInvalidToken(supabase, delivery.token_id);
            }
        }
    }

    return { notification, delivered: response.successCount > 0 };
}

export async function scheduleNotification({
    recipientUserId,
    eventType,
    title,
    body,
    entityType,
    entityId,
    deepLink = null,
    webPath = null,
    payload = {},
    scheduledFor,
    dedupeKey
}) {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
        .from('notification_schedule')
        .upsert([{
            recipient_user_id: recipientUserId,
            event_type: normalizeEventType(eventType),
            title,
            body,
            entity_type: entityType,
            entity_id: entityId,
            deep_link: deepLink,
            web_path: webPath,
            payload,
            scheduled_for: scheduledFor,
            dedupe_key: dedupeKey
        }], { onConflict: 'dedupe_key' })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function processDueScheduledNotifications(limit = 100) {
    const supabase = getServiceSupabaseClient();
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabase
        .from('notification_schedule')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', nowIso)
        .order('scheduled_for', { ascending: true })
        .limit(limit);

    if (error) {
        throw error;
    }

    let processed = 0;
    let failed = 0;

    for (const row of rows || []) {
        try {
            await sendNotification({
                recipientUserId: row.recipient_user_id,
                eventType: row.event_type,
                title: row.title,
                body: row.body,
                entityType: row.entity_type,
                entityId: row.entity_id,
                deepLink: row.deep_link,
                webPath: row.web_path,
                payload: row.payload || {}
            });

            await supabase
                .from('notification_schedule')
                .update({ status: 'processed', processed_at: new Date().toISOString() })
                .eq('schedule_id', row.schedule_id);
            processed += 1;
        } catch (err) {
            await supabase
                .from('notification_schedule')
                .update({ status: 'failed' })
                .eq('schedule_id', row.schedule_id);
            failed += 1;
        }
    }

    return { processed, failed, fetched: (rows || []).length };
}

export async function registerPushToken({
    userId,
    fcmToken,
    platform,
    appName = APP_NAME_DEFAULT,
    deviceId = null,
    deviceName = null,
    appVersion = null
}) {
    const supabase = getServiceSupabaseClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
        .from('user_push_tokens')
        .upsert([{
            user_id: userId,
            fcm_token: fcmToken,
            platform,
            app_name: appName,
            device_id: deviceId,
            device_name: deviceName,
            app_version: appVersion,
            is_active: true,
            last_seen_at: nowIso,
            updated_at: nowIso
        }], { onConflict: 'fcm_token' })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function deactivatePushToken({ userId, fcmToken }) {
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase
        .from('user_push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('fcm_token', fcmToken);

    if (error) {
        throw error;
    }
}

export async function upsertNotificationPreferences(userId, updates) {
    const supabase = getServiceSupabaseClient();
    const payload = {
        user_id: userId,
        ...updates
    };

    const { data, error } = await supabase
        .from('notification_preferences')
        .upsert([payload], { onConflict: 'user_id' })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}
