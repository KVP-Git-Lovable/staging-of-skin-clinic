/**
 * Whether anything actually runs an activated journey.
 *
 * Activating a journey enrols patients and sets it active, but the sending is
 * done by the comms-process-journeys edge function, which is driven by cron.
 * That cron job does not exist yet: the function is deployed and answering, but
 * it authenticates on LOVABLE_CRON_SECRET, which is provisioned by Lovable when
 * a scheduled task is created, and no task has been created. Until then it
 * refuses every call with a 500 and no enrolled patient is ever messaged.
 *
 * So a journey can be built, approved and activated, and will sit there doing
 * nothing - which is a worse failure than a disabled button, because it looks
 * like it worked. While this is false the activate dialog says so plainly.
 *
 * Flip it to true in the same change that creates the cron job. Nothing else
 * needs to move: the engine, the schema and the activate flow are all in place
 * and already work, they are just never invoked.
 */
export const JOURNEY_SCHEDULER_ENABLED = false;

/** Shown wherever activating implies messages will start going out. */
export const JOURNEY_SCHEDULER_OFF_NOTICE =
  "Scheduled sending is not switched on yet. Patients will be enrolled and the journey will show as active, but no messages go out until the journey runner is scheduled.";
