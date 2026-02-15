import { describe, expect, it } from "vitest";
import {
  buildGoogleDriveCommentDedupeKey,
  defaultGoogleDriveEscalationConfig,
} from "@/lib/integrations/google-drive-comment-escalation";

describe("google-drive-comment-escalation helpers", () => {
  it("returns default drive escalation config", () => {
    expect(defaultGoogleDriveEscalationConfig()).toEqual({
      folderIds: [],
      maxFilesPerRun: 50,
      maxCommentsPerFile: 50,
      dueInHours: 24,
      requireAssignment: true,
      reviewKeywords: ["review", "feedback", "take a look", "approve"],
    });
  });

  it("builds canonical dedupe key", () => {
    const key = buildGoogleDriveCommentDedupeKey({
      fileId: "file_123",
      commentId: "comment_789",
      variant: "assigned_comment",
    });

    expect(key).toBe(
      "google_workspace:drive_comment:file_123:comment_789:assigned_comment"
    );
  });
});
