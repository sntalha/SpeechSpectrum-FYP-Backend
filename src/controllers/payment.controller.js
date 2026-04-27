import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import Constants from '../constant.js';
import safepayClient, {
    CHECKOUT_REDIRECT_URL,
    CHECKOUT_CANCEL_URL,
    SAFEPAY_WEBHOOK_SECRET
} from '../config/safepay-config.js';
import { notifyPaymentStatus } from '../services/notification-events.service.js';

/*
  Safepay payment flow used in this controller:
    1) Parent starts payment for a confirmed appointment (PKR only)
  2) Backend creates Safepay payment token
  3) Backend builds hosted checkout URL and stores/updates a pending payment row
  4) Frontend verifies tracker after redirect to finalize state updates
  5) Webhook acts as authoritative async confirmation with signature validation
*/

function getNowIso() {
    return new Date().toISOString();
}

function normalizeCallbackUrl(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }

        return parsed.toString();
    } catch (error) {
        return null;
    }
}

function resolveTrackerToken(paymentResponse) {
    return (
        paymentResponse?.token ||
        paymentResponse?.data?.token ||
        null
    );
}

function getWebhookSupabaseClient() {
    const supabaseKey = Constants.SUPABASE_SERVICE_KEY || Constants.SUPABASE_API_KEY;
    return createClient(Constants.SUPABASE_URL, supabaseKey);
}

export default class PaymentController {
    static async initiatePayment(req, res) {
        try {
            const supabase = req.supabase;

            const {
                data: { user },
                error: userError
            } = await supabase.auth.getUser();

            if (userError || !user) {
                return res.status(401).json({ message: 'Unauthorized', status: false });
            }

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();

            if (roleError || !profile?.role) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            if (profile.role !== 'parent') {
                return res.status(403).json({ message: 'Only parents can initiate payments', status: false });
            }

            const { appointment_id, redirect_url, cancel_url } = req.body;

            const redirectUrlInput =
                typeof redirect_url === 'string' && redirect_url.trim()
                    ? redirect_url.trim()
                    : CHECKOUT_REDIRECT_URL;

            const cancelUrlInput =
                typeof cancel_url === 'string' && cancel_url.trim()
                    ? cancel_url.trim()
                    : CHECKOUT_CANCEL_URL;

            const redirectUrl = normalizeCallbackUrl(redirectUrlInput);
            const cancelUrl = normalizeCallbackUrl(cancelUrlInput);

            if (!redirectUrl || !cancelUrl) {
                return res.status(400).json({
                    message: 'redirect_url and cancel_url must be valid absolute HTTP(S) URLs',
                    status: false
                });
            }

            if (!appointment_id) {
                return res.status(400).json({ message: 'appointment_id is required', status: false });
            }

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, parent_id, currency, fee_charged')
                .eq('appointment_id', appointment_id)
                .maybeSingle();

            if (appointmentError) {
                return res.status(400).json({
                    message: 'Failed to fetch appointment',
                    error: appointmentError.message,
                    status: false
                });
            }

            if (!appointment) {
                return res.status(404).json({ message: 'Appointment not found', status: false });
            }

            if (appointment.parent_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            if (String(appointment.currency || '').toUpperCase() !== 'PKR') {
                return res.status(400).json({
                    message: 'Only PKR payments are supported',
                    status: false
                });
            }

            const { data: existingPaidPayment, error: existingPaidPaymentError } = await supabase
                .from('payments')
                .select('payment_id')
                .eq('appointment_id', appointment_id)
                .eq('status', 'paid')
                .maybeSingle();

            if (existingPaidPaymentError) {
                return res.status(400).json({
                    message: 'Failed to check existing payment status',
                    error: existingPaidPaymentError.message,
                    status: false
                });
            }

            if (existingPaidPayment) {
                return res.status(400).json({
                    message: 'Payment already completed for this appointment',
                    status: false
                });
            }

            const amount = Math.round(Number(appointment.fee_charged) * 100);

            if (!Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({
                    message: 'Invalid appointment fee for payment',
                    status: false
                });
            }

            let paymentResponse;
            try {
                paymentResponse = await safepayClient.payments.create({
                    currency: 'PKR',
                    amount
                });
            } catch (safepayError) {
                console.error('Safepay payment token creation error:', safepayError);
                return res.status(500).json({
                    message: 'Failed to create Safepay payment token',
                    error: safepayError?.message || 'Unknown Safepay error',
                    status: false
                });
            }

            const trackerToken = resolveTrackerToken(paymentResponse);

            if (!trackerToken) {
                console.error('Safepay payment token response missing tracker token:', paymentResponse);
                return res.status(500).json({
                    message: 'Safepay payment token response did not include tracker token',
                    status: false
                });
            }

            console.info('Safepay tracker token:', trackerToken);

            let checkoutUrl;
            try {
                checkoutUrl = safepayClient.checkout.create({
                    token: trackerToken,
                    orderId: String(appointment_id),
                    redirectUrl,
                    cancelUrl,
                    source: 'custom',
                    webhooks: true
                });
                console.info('Safepay checkout URL:', checkoutUrl);
            } catch (safepayError) {
                console.error('Safepay checkout URL generation error:', safepayError);
                return res.status(500).json({
                    message: 'Failed to create Safepay checkout URL',
                    error: safepayError?.message || 'Unknown Safepay error',
                    status: false
                });
            }

            if (!checkoutUrl || typeof checkoutUrl !== 'string') {
                console.error('Safepay checkout URL generation returned invalid result:', checkoutUrl);
                return res.status(500).json({
                    message: 'Safepay checkout URL generation did not return a valid URL',
                    status: false
                });
            }

            const { data: pendingPayment, error: pendingPaymentError } = await supabase
                .from('payments')
                .select('payment_id')
                .eq('appointment_id', appointment_id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (pendingPaymentError) {
                return res.status(400).json({
                    message: 'Failed to inspect pending payment record',
                    error: pendingPaymentError.message,
                    status: false
                });
            }

            const paymentPayload = {
                appointment_id,
                parent_user_id: user.id,
                safepay_tracker: trackerToken,
                amount,
                currency: 'PKR',
                status: 'pending',
                metadata: {
                    appointment_id
                }
            };

            let paymentRecord;

            if (pendingPayment) {
                const { data: updatedPayment, error: updatePaymentError } = await supabase
                    .from('payments')
                    .update({
                        ...paymentPayload,
                        updated_at: getNowIso()
                    })
                    .eq('payment_id', pendingPayment.payment_id)
                    .select('payment_id')
                    .single();

                if (updatePaymentError) {
                    return res.status(400).json({
                        message: 'Failed to update pending payment record',
                        error: updatePaymentError.message,
                        status: false
                    });
                }

                paymentRecord = updatedPayment;
            } else {
                const { data: insertedPayment, error: insertPaymentError } = await supabase
                    .from('payments')
                    .insert([paymentPayload])
                    .select('payment_id')
                    .single();

                if (insertPaymentError) {
                    return res.status(400).json({
                        message: 'Failed to create payment record',
                        error: insertPaymentError.message,
                        status: false
                    });
                }

                paymentRecord = insertedPayment;
            }

            return res.status(200).json({
                status: true,
                checkout_url: checkoutUrl,
                tracker: trackerToken,
                payment_id: paymentRecord.payment_id
            });
        } catch (error) {
            console.error('initiatePayment error:', error);
            return res.status(500).json({
                message: 'Failed to initiate payment',
                error: error.message,
                status: false
            });
        }
    }

    static async verifyPayment(req, res) {
        try {
            const supabase = req.supabase;

            const {
                data: { user },
                error: userError
            } = await supabase.auth.getUser();

            if (userError || !user) {
                return res.status(401).json({ message: 'Unauthorized', status: false });
            }

            const { tracker } = req.body;

            if (!tracker) {
                return res.status(400).json({ message: 'tracker is required', status: false });
            }

            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .select('payment_id, appointment_id, parent_user_id, status')
                .eq('safepay_tracker', tracker)
                .maybeSingle();

            if (paymentError) {
                return res.status(400).json({
                    message: 'Failed to fetch payment by tracker',
                    error: paymentError.message,
                    status: false
                });
            }

            if (!payment) {
                return res.status(404).json({ message: 'Payment not found', status: false });
            }

            if (payment.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { sig } = req.body;

            if (sig) {
                const isSignatureValid = safepayClient.verify.signature({
                    body: {
                        sig,
                        tracker
                    }
                });

                if (!isSignatureValid) {
                    return res.status(400).json({
                        message: 'Invalid Safepay signature',
                        status: false
                    });
                }
            }

            if (payment.status === 'paid') {
                const { error: updateAppointmentError } = await supabase
                    .from('appointments')
                    .update({ payment_status: 'paid', updated_at: getNowIso() })
                    .eq('appointment_id', payment.appointment_id);

                if (updateAppointmentError) {
                    return res.status(400).json({
                        message: 'Failed to update appointment payment status',
                        error: updateAppointmentError.message,
                        status: false
                    });
                }

                notifyPaymentStatus(
                    payment.appointment_id,
                    'payment.succeeded',
                    'Payment successful',
                    'Your appointment payment has been completed successfully.'
                ).catch((notifyError) => {
                    console.error('notifyPaymentStatus(payment.succeeded) failed:', notifyError?.message || notifyError);
                });

                return res.status(200).json({
                    status: true,
                    payment_status: 'paid',
                    message: 'Payment successful'
                });
            }

            if (payment.status === 'cancelled' || payment.status === 'failed') {
                notifyPaymentStatus(
                    payment.appointment_id,
                    'payment.failed',
                    'Payment failed',
                    'Your payment did not complete. Please retry the payment to proceed.'
                ).catch((notifyError) => {
                    console.error('notifyPaymentStatus(payment.failed) failed:', notifyError?.message || notifyError);
                });

                return res.status(200).json({
                    status: true,
                    payment_status: 'cancelled'
                });
            }

            return res.status(200).json({
                status: true,
                payment_status: 'pending'
            });
        } catch (error) {
            console.error('verifyPayment error:', error);
            return res.status(500).json({
                message: 'Failed to verify payment',
                error: error.message,
                status: false
            });
        }
    }

    static async handleWebhook(req, res) {
        console.log('WEBHOOK headers:', JSON.stringify(req.headers, null, 2));
        console.log('WEBHOOK body:', JSON.stringify(req.body, null, 2));

        try {
            const signatureHeader = req.headers['x-sfpy-signature'];
            const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

            if (!signature || !SAFEPAY_WEBHOOK_SECRET) {
                console.warn('Safepay webhook missing signature or secret not configured');
                return;
            }

            const rawBodyStr = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

            // Detect webhook format version.
            // v2 format has top-level `version`.
            // v1 format keeps event details nested under `data`.
            const isV2Format = !!req.body?.version;

            let rawData;
            if (isV2Format) {
                // v2 test notifications: signature covers the full body.
                rawData = Buffer.from(rawBodyStr);
            } else {
                // v1 real payments: signature covers only `body.data`.
                const parsedRaw = JSON.parse(rawBodyStr);
                rawData = Buffer.from(JSON.stringify(parsedRaw.data));
            }

            const expectedSig = crypto
                .createHmac('sha512', SAFEPAY_WEBHOOK_SECRET)
                .update(rawData)
                .digest('hex');

            console.log('Webhook format:', isV2Format ? 'v2 (test)' : 'v1 (real payment)');
            console.log('Received sig:', signature);
            console.log('Expected sig:', expectedSig);
            console.log('Signature valid:', expectedSig === signature);

            if (expectedSig !== signature) {
                console.warn('Safepay webhook signature invalid');
                return;
            }

            const isV2 = !!req.body?.version;

            let eventType;
            let trackerToken;
            let safepayReference;

            if (isV2) {
                eventType = typeof req.body?.type === 'string' ? req.body.type.toLowerCase() : null;
                trackerToken = req.body?.data?.tracker || req.body?.data?.token || null;
                safepayReference =
                    req.body?.data?.reference ||
                    req.body?.data?.payment?.reference ||
                    req.body?.data?.payment?.id ||
                    null;
            } else {
                const eventTypeRaw = req.body?.data?.type || '';
                const state = String(req.body?.data?.notification?.state || '').toUpperCase();

                if (state === 'PAID') {
                    eventType = 'payment.succeeded';
                } else if (['FAILED', 'DECLINED', 'CANCELLED', 'CANCELED'].includes(state)) {
                    eventType = 'payment.failed';
                } else {
                    eventType = typeof eventTypeRaw === 'string' ? eventTypeRaw.toLowerCase() : null;
                }

                trackerToken =
                    req.body?.data?.notification?.tracker ||
                    req.body?.data?.tracker ||
                    req.body?.data?.token ||
                    null;

                safepayReference =
                    req.body?.data?.notification?.reference ||
                    req.body?.data?.reference ||
                    null;
            }

            if (!eventType) {
                console.warn('Safepay webhook event type missing');
                return;
            }

            const supabase = getWebhookSupabaseClient();
            const now = getNowIso();

            if (eventType === 'payment.succeeded') {
                if (!trackerToken) {
                    console.warn('Safepay payment.succeeded webhook missing tracker token');
                    return;
                }

                const { data: payment, error: paymentFetchError } = await supabase
                    .from('payments')
                    .select('payment_id, appointment_id, status')
                    .eq('safepay_tracker', trackerToken)
                    .maybeSingle();

                if (paymentFetchError) {
                    console.error('Failed to fetch payment in payment.succeeded webhook:', paymentFetchError);
                    return;
                }

                if (!payment) {
                    console.warn(`No payment found for Safepay tracker ${trackerToken}`);
                    return;
                }

                if (payment.status === 'paid') {
                    return;
                }

                const paymentUpdates = {
                    status: 'paid',
                    updated_at: now
                };

                if (safepayReference) {
                    paymentUpdates.safepay_reference = safepayReference;
                }

                const { error: updatePaymentError } = await supabase
                    .from('payments')
                    .update(paymentUpdates)
                    .eq('payment_id', payment.payment_id);

                if (updatePaymentError) {
                    console.error('Failed to mark payment paid from webhook:', updatePaymentError);
                    return;
                }

                const { error: updateAppointmentError } = await supabase
                    .from('appointments')
                    .update({ payment_status: 'paid', updated_at: now })
                    .eq('appointment_id', payment.appointment_id);

                if (updateAppointmentError) {
                    console.error('Failed to confirm appointment from webhook:', updateAppointmentError);
                    return;
                }

                notifyPaymentStatus(
                    payment.appointment_id,
                    'payment.succeeded',
                    'Payment successful',
                    'Your appointment payment has been completed successfully.'
                ).catch((notifyError) => {
                    console.error('notifyPaymentStatus(webhook payment.succeeded) failed:', notifyError?.message || notifyError);
                });

                console.info(`Safepay payment confirmed via webhook for tracker ${trackerToken}`);
                return;
            }

            if (eventType === 'payment.failed') {
                if (!trackerToken) {
                    console.warn('Safepay payment.failed webhook missing tracker token');
                    return;
                }

                const { data: payment, error: paymentFetchError } = await supabase
                    .from('payments')
                    .select('payment_id, status')
                    .eq('safepay_tracker', trackerToken)
                    .maybeSingle();

                if (paymentFetchError) {
                    console.error('Failed to fetch payment in payment.failed webhook:', paymentFetchError);
                    return;
                }

                if (!payment) {
                    console.warn(`No payment found for Safepay tracker ${trackerToken}`);
                    return;
                }

                const { error: updatePaymentError } = await supabase
                    .from('payments')
                    .update({ status: 'failed', updated_at: now })
                    .eq('payment_id', payment.payment_id);

                if (updatePaymentError) {
                    console.error('Failed to mark payment failed from webhook:', updatePaymentError);
                    return;
                }

                const { data: appointmentForFailed } = await supabase
                    .from('payments')
                    .select('appointment_id')
                    .eq('payment_id', payment.payment_id)
                    .maybeSingle();

                if (appointmentForFailed?.appointment_id) {
                    notifyPaymentStatus(
                        appointmentForFailed.appointment_id,
                        'payment.failed',
                        'Payment failed',
                        'Your payment did not complete. Please retry the payment to proceed.'
                    ).catch((notifyError) => {
                        console.error('notifyPaymentStatus(webhook payment.failed) failed:', notifyError?.message || notifyError);
                    });
                }

                console.error(`Safepay payment failed via webhook for tracker ${trackerToken}`);
            }
        } catch (error) {
            console.error('handleWebhook error:', error);
        } finally {
            if (!res.headersSent) {
                res.status(200).json({ received: true });
            }
        }
    }

    static async getPaymentStatus(req, res) {
        try {
            const supabase = req.supabase;

            const {
                data: { user },
                error: userError
            } = await supabase.auth.getUser();

            if (userError || !user) {
                return res.status(401).json({ message: 'Unauthorized', status: false });
            }

            const { appointment_id } = req.query;

            if (!appointment_id) {
                return res.status(400).json({
                    message: 'appointment_id query parameter is required',
                    status: false
                });
            }

            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .select('payment_id, status, amount, currency, created_at, updated_at')
                .eq('appointment_id', appointment_id)
                .eq('parent_user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (paymentError) {
                return res.status(400).json({
                    message: 'Failed to fetch payment status',
                    error: paymentError.message,
                    status: false
                });
            }

            return res.status(200).json({
                message: 'Payment status fetched successfully',
                data: payment || null,
                status: true
            });
        } catch (error) {
            console.error('getPaymentStatus error:', error);
            return res.status(500).json({
                message: 'Failed to fetch payment status',
                error: error.message,
                status: false
            });
        }
    }
}
