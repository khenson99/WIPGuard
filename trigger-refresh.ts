import { runAnalyticsRefresh } from './src/lib/analytics/refresh-runner'; runAnalyticsRefresh(true).then(() => console.log('Done')).catch(console.error);
