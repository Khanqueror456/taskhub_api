import { env } from '../config/env.js';
import { maintenanceQueue } from './queues.js';

/** Safe to call on every startup: `upsert` creates the schedule or updates it in place */
export async function registerScheules() {
    await maintenanceQueue.upsertJobScheduler(
        'scan-overdue-schedule',
        { pattern : env.OVERDUE_SCAN_CRON },
        { name : 'scan-overdue' },
    )
}