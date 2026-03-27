export type CaptureListItem = {
  id: string;
  title: string;
  url: string;
  fetch_method: string;
  source: string;
  ingested_at: string;
  publish: boolean;
  reaction_avg: number | null;
  reaction_count: number;
  youtube_video_id?: string;
};

/** One line in `{slug}.comment` (vault Markdown timeline). */
export type ReactionEntry = {
  at: string;
  rating: number;
  text?: string;
};

export type CaptureDetail = {
  id: string;
  vaultRoot: string;
  noteFm: Record<string, string | boolean>;
  sourceFm: Record<string, string | boolean>;
  noteBody: string;
  sourceBody: string;
  youtubeVideoId: string | null;
  transcriptEn: string;
  transcriptVi: string;
  milestones: { t: number; label: string; kind?: string }[] | null;
  /** Mean rating from `{slug}.comment` (same as library table). */
  reaction_avg: number | null;
  reaction_count: number;
};
