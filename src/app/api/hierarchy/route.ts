export const dynamic = "force-dynamic";

import { createRetiredWorkRoute } from "@/app/api/_lib/retired-work";

export const GET = createRetiredWorkRoute(
  "The hierarchy endpoint has been retired with the Work section."
);
