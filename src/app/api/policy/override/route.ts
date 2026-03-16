export const dynamic = "force-dynamic";

import { createRetiredWorkRoute } from "@/app/api/_lib/retired-work";

export const POST = createRetiredWorkRoute(
  "Policies have been retired with the Work section."
);
