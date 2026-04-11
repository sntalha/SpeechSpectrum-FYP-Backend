import { createRequire } from 'module';
import Constants from '../constant.js';

const require = createRequire(import.meta.url);
const { Safepay } = require('@sfpy/node-sdk');

export const SAFEPAY_ENVIRONMENT = 'sandbox';
export const SAFEPAY_WEBHOOK_SECRET = Constants.SAFEPAY_WEBHOOK_SECRET;
export const CHECKOUT_REDIRECT_URL = Constants.SAFEPAY_REDIRECT_URL;
export const CHECKOUT_CANCEL_URL = Constants.SAFEPAY_CANCEL_URL;

const safepayClient = new Safepay({
  environment: SAFEPAY_ENVIRONMENT,
  apiKey: Constants.SAFEPAY_API_KEY,
  v1Secret: Constants.SAFEPAY_V1_SECRET,
  webhookSecret: SAFEPAY_WEBHOOK_SECRET
});

export default safepayClient;