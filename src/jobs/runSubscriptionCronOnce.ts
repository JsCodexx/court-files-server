import 'dotenv/config';
import { runSubscriptionMaintenance } from './subscriptionCron';

runSubscriptionMaintenance()
  .then(() => {
    console.log('Subscription maintenance finished.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
