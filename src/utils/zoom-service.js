import axios from 'axios';
import Constants from '../constant.js';

class ZoomService {
    /**
     * Get Zoom OAuth Access Token using Server-to-Server OAuth
     */
    static async getAccessToken() {
        try {
            const auth = Buffer.from(
                `${Constants.ZOOM_CLIENT_ID}:${Constants.ZOOM_CLIENT_SECRET}`
            ).toString('base64');
            const response = await axios.post(
                `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(Constants.ZOOM_ACCOUNT_ID)}`,
                {},
                {
                    headers: {
                        Authorization: `Basic ${auth}`,
                    },
                }
            );
            return response.data.access_token;
        } catch (error) {
            console.error('Error getting Zoom access token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Zoom');
        }
    }

    /**
     * Create a Zoom meeting
     * @param {Object} meetingData - Meeting configuration
     * @param {string} meetingData.topic - Meeting topic/title
     * @param {string} meetingData.start_time - ISO 8601 format datetime
     * @param {number} meetingData.duration - Duration in minutes
     * @param {string} meetingData.timezone - Timezone (default: UTC)
     */
    static async createMeeting({ topic, start_time, duration = 30, timezone = 'UTC' }) {
        try {
            const accessToken = await this.getAccessToken();

            const meetingPayload = {
                topic,
                type: 2, // Scheduled meeting
                start_time,
                duration,
                timezone,
                settings: {
                    waiting_room: true,
                    join_before_host: false,
                    host_video: true,
                    participant_video: true,
                    mute_upon_entry: true,
                },
            };

            const response = await axios.post(
                'https://api.zoom.us/v2/users/me/meetings',
                meetingPayload,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return {
                join_url: response.data.join_url,
                meeting_id: response.data.id,
                password: response.data.password,
                start_url: response.data.start_url,
            };
        } catch (error) {
            console.error('Error creating Zoom meeting:', error.response?.data || error.message);
            throw new Error('Failed to create Zoom meeting');
        }
    }
}

export default ZoomService;
