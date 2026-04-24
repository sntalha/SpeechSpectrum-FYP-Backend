import Constants from '../constant.js';
import {
    deactivatePushToken,
    processDueScheduledNotifications,
    registerPushToken,
    upsertNotificationPreferences
} from '../services/notification.service.js';

export default class NotificationController {
    static async registerToken(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { fcm_token, platform, app_name, device_id, device_name, app_version } = req.body;
            if (!fcm_token || !platform) {
                return res.status(400).json({ message: 'fcm_token and platform are required', status: false });
            }

            if (!['android', 'ios', 'web'].includes(String(platform).toLowerCase())) {
                return res.status(400).json({ message: 'platform must be android, ios or web', status: false });
            }

            const data = await registerPushToken({
                userId: user.id,
                fcmToken: fcm_token,
                platform: String(platform).toLowerCase(),
                appName: app_name || 'main',
                deviceId: device_id || null,
                deviceName: device_name || null,
                appVersion: app_version || null
            });

            return res.status(200).json({
                message: 'Push token registered successfully',
                data,
                status: true
            });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to register push token', error: error.message, status: false });
        }
    }

    static async unregisterToken(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { fcm_token } = req.body;
            if (!fcm_token) {
                return res.status(400).json({ message: 'fcm_token is required', status: false });
            }

            await deactivatePushToken({ userId: user.id, fcmToken: fcm_token });
            return res.status(200).json({ message: 'Push token unregistered successfully', status: true });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to unregister push token', error: error.message, status: false });
        }
    }

    static async updatePreferences(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const data = await upsertNotificationPreferences(user.id, req.body || {});
            return res.status(200).json({ message: 'Notification preferences updated', data, status: true });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to update preferences', error: error.message, status: false });
        }
    }

    static async getMyNotifications(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const page = Number(req.query.page || 1);
            const limit = Math.min(100, Number(req.query.limit || 20));
            const offset = (page - 1) * limit;

            const { data, error, count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact' })
                .eq('recipient_user_id', user.id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                return res.status(400).json({ message: 'Failed to fetch notifications', error: error.message, status: false });
            }

            return res.status(200).json({
                message: 'Notifications fetched successfully',
                data,
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    total_pages: Math.ceil((count || 0) / limit)
                },
                status: true
            });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to fetch notifications', error: error.message, status: false });
        }
    }

    static async markAsRead(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { notification_id } = req.params;
            const { data, error } = await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('notification_id', notification_id)
                .eq('recipient_user_id', user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: 'Failed to mark notification as read', error: error.message, status: false });
            }

            return res.status(200).json({ message: 'Notification marked as read', data, status: true });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to mark notification as read', error: error.message, status: false });
        }
    }

    static async markAllAsRead(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('recipient_user_id', user.id)
                .eq('is_read', false);

            if (error) {
                return res.status(400).json({ message: 'Failed to mark all notifications as read', error: error.message, status: false });
            }

            return res.status(200).json({ message: 'All notifications marked as read', status: true });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to mark all notifications as read', error: error.message, status: false });
        }
    }

    static async processScheduled(req, res) {
        try {
            const configuredCronSecret = Constants.CRON_SECRET;
            const authHeader = req.headers.authorization;

            if (configuredCronSecret && authHeader !== `Bearer ${configuredCronSecret}`) {
                return res.status(401).json({ message: 'Unauthorized', status: false });
            }

            const result = await processDueScheduledNotifications(200);
            return res.status(200).json({
                message: 'Scheduled notifications processed',
                data: result,
                status: true
            });
        } catch (error) {
            return res.status(500).json({ message: 'Failed to process scheduled notifications', error: error.message, status: false });
        }
    }
}
