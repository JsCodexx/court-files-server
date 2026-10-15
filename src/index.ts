import './loadEnv';
import app from './app';
import { startSubscriptionCron } from './jobs/subscriptionCron';
import {
  assertCorsMatchesFrontend,
  getCorsAllowlist,
} from './utils/corsOrigins';
import { isRapidGatewayConfigured } from './utils/rapidgateway';

assertCorsMatchesFrontend();

function assertProductionPaymentConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (
    isRapidGatewayConfigured() &&
    !process.env.RAPIDGATEWAY_WEBHOOK_SECRET?.trim()
  ) {
    throw new Error(
      'RAPIDGATEWAY_WEBHOOK_SECRET is required in production when RapidGateway API keys are set'
    );
  }
}

assertProductionPaymentConfig();

if (process.env.ENABLE_SUBSCRIPTION_CRON !== 'false') {
  startSubscriptionCron();
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const port = Number(process.env.PORT) || 5500;

app.listen(port, () => {
  console.log(`Court Files API listening on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[cors] allowed origins: ${getCorsAllowlist().join(', ')}`);
  }
  if (process.env.NODE_ENV === 'production') {
    console.log(
      `RapidGateway configured: ${isRapidGatewayConfigured() ? 'yes' : 'no'}`
    );
  }
});
