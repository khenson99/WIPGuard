export const dynamic = "force-dynamic";

import { createRetiredWorkRoute } from "@/app/api/_lib/retired-work";

const RETIRED_MESSAGE = "Sprints have been retired with the Work section.";

export const GET = createRetiredWorkRoute(RETIRED_MESSAGE);
export const POST = createRetiredWorkRoute(RETIRED_MESSAGE);
