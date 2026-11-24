export const COMMENT_LIMIT = 800;
export const MODERATION_REASON_LIMIT = 200;

export type CommentPart = { text: string } | { note: string };

export interface NewsComment {
  id: string;
  author: string | null;
  own: boolean;
  state: 'visible' | 'deleted' | 'removed';
  parts: CommentPart[];
  reason: string | null;
  revision: number;
  createdAt: number;
  edited: boolean;
  recoverable: boolean;
}

export interface NewsCommentPage {
  open: boolean;
  revision: number;
  moderator: boolean;
  canManageThread: boolean;
  comments: NewsComment[];
  next: string | null;
}

type CommentReference = { id: string; revision: number };
export type NewsCommentAction =
  | { action: 'thread'; open: boolean; revision: number }
  | { action: 'post'; id: string; text: string }
  | (CommentReference & { action: 'edit'; parts: string[] })
  | (CommentReference & { action: 'delete' | 'restore' })
  | (CommentReference & { action: 'remove'; reason: string })
  | (CommentReference & { action: 'redact'; part: number; start: number; end: number; reason: string });
