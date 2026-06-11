import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";

export interface InstagramPublishPayload {
  accountId: string;
  contentItemId: string;
  caption: string;
  contentType: "CAROUSEL" | "POST" | "REEL" | "STORY";
  mediaUrls: string[];
}

export interface InstagramPublishResult {
  dryRun: boolean;
  instagramPostId?: string;
  payload: InstagramPublishPayload;
  status: "DRY_RUN" | "PUBLISHED";
}

export interface InstagramPublisher {
  publish(input: {
    contentItem: ContentItem;
    mediaAssets: MediaAsset[];
    workspace: Workspace;
  }): Promise<InstagramPublishResult>;
}

export class DryRunInstagramPublisher implements InstagramPublisher {
  async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): Promise<InstagramPublishResult> {
    const payload: InstagramPublishPayload = {
      accountId: input.workspace.instagramAccountId ?? "",
      contentItemId: input.contentItem.id,
      caption: buildCaption(input.contentItem),
      contentType: input.contentItem.contentType,
      mediaUrls: input.mediaAssets.map((asset) => asset.cdnUrl)
    };

    return {
      dryRun: true,
      payload,
      status: "DRY_RUN"
    };
  }
}

function buildCaption(contentItem: ContentItem): string {
  const caption = contentItem.captionEn ?? contentItem.captionAr ?? "";
  const hashtags = contentItem.hashtags.join(" ");

  return [caption, hashtags].filter(Boolean).join("\n\n");
}
