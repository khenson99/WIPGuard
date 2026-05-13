export const dynamic = "force-dynamic";

import { createRetiredWorkRoute } from "@/app/api/_lib/retired-work";

export const GET = createRetiredWorkRoute(
  "Logbook has been retired with the Work section."
);
