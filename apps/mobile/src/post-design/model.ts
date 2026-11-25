import type { PostArtwork, PostStyle, PostFont, PostRatio } from "@markos/shared-types";

export interface PostDesignState {
  photo?: string;
  generatedPhoto?: string;
  preview?: string;
  attachedId?: string;
  template?: string;
  style?: PostStyle;
  font?: PostFont;
  ratio?: PostRatio;
  artwork?: PostArtwork;
  stage: "ideas" | "style" | "font" | "ratio" | "preview";
}

export const newPostDesign = (options: { photo?: string; ideas?: boolean } = {}): PostDesignState => ({
  stage: options.ideas ? "ideas" : "style",
  ...(options.photo ? { photo: options.photo } : {})
});

export { canPublishPostRatio, postOverlayCopy, postRatiosByValue, requestsPostDesign, wantsPostIdeas } from "@markos/shared-types";
