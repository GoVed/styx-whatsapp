import config from '../config.js';
import { MockWhatsAppBridge } from './mock.js';
import { LiveWhatsAppBridge } from './live.js';
import logger from '../utils/logger.js';

let activeBridgeInstance = null;

/**
 * Creates a new WhatsApp bridge instance according to the chosen mode.
 * @param {'live' | 'mock'} [mode]
 * @returns {MockWhatsAppBridge | LiveWhatsAppBridge}
 */
export function createBridge(mode = config.mode) {
  const chosenMode = (mode || 'mock').toLowerCase();
  logger.info({ mode: chosenMode }, 'Instantiating WhatsApp bridge');

  if (chosenMode === 'live') {
    return new LiveWhatsAppBridge();
  }
  return new MockWhatsAppBridge();
}

/**
 * Returns or initializes the shared singleton bridge instance.
 * @param {'live' | 'mock'} [mode]
 * @returns {MockWhatsAppBridge | LiveWhatsAppBridge}
 */
export function getBridge(mode) {
  if (!activeBridgeInstance) {
    activeBridgeInstance = createBridge(mode);
  }
  return activeBridgeInstance;
}

export { MockWhatsAppBridge, LiveWhatsAppBridge };
export default {
  createBridge,
  getBridge,
  MockWhatsAppBridge,
  LiveWhatsAppBridge
};
