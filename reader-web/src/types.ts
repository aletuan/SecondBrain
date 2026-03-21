export type CaptureListItem = {
  id: string;
  title: string;
  url: string;
  fetch_method: string;
  source: string;
  ingested_at: string;
  publish: boolean;
  youtube_video_id?: string;
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
};
