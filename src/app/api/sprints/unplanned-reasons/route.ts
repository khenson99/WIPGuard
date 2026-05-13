export const dynamic = "force-dynamic";

import { createRetiredWorkRoute } from "@/app/api/_lib/retired-work";

export const GET = createRetiredWorkRoute(
  "Sprints have been retired with the Work section."
);
