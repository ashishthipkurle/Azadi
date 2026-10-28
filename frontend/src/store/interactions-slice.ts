import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface PostInteraction {
  postId: string;
  liked: boolean;
  likeCount: number;
  commentCount: number;
}

export interface CommentItem {
  id: string;
  post_id: string;
  user_id?: string;
  user_name: string;
  body: string;
  parent_id?: string | null;
  created_at: string;
}

export interface PendingLikeAction {
  postId: string;
  liked: boolean;
  timestamp: number;
}

export interface InteractionsState {
  posts: Record<string, PostInteraction>;
  comments: Record<string, CommentItem[]>;
  pendingLikes: Record<string, PendingLikeAction>;
}

const initialState: InteractionsState = {
  posts: {},
  comments: {},
  pendingLikes: {},
};

export const interactionsSlice = createSlice({
  name: "interactions",
  initialState,
  reducers: {
    hydratePostsInteractions: (state, action: PayloadAction<Array<any>>) => {
      if (!Array.isArray(action.payload)) return;
      for (const p of action.payload) {
        if (!p?.id) continue;
        const hasPending = !!state.pendingLikes[p.id];
        const existing = state.posts[p.id];

        if (!existing) {
          state.posts[p.id] = {
            postId: p.id,
            liked: !!p.liked,
            likeCount: typeof p.like_count === "number" ? p.like_count : 0,
            commentCount: typeof p.comment_count === "number" ? p.comment_count : 0,
          };
        } else {
          // If user hasn't made an un-flushed like action, accept server like state
          if (!hasPending) {
            existing.liked = typeof p.liked === "boolean" ? p.liked : existing.liked;
            existing.likeCount = typeof p.like_count === "number" ? p.like_count : existing.likeCount;
          }
          if (typeof p.comment_count === "number") {
            existing.commentCount = Math.max(existing.commentCount, p.comment_count);
          }
        }
      }
    },

    toggleLikeOptimistic: (state, action: PayloadAction<{ postId: string }>) => {
      const { postId } = action.payload;
      const current = state.posts[postId] || {
        postId,
        liked: false,
        likeCount: 0,
        commentCount: 0,
      };

      const nextLiked = !current.liked;
      const nextCount = nextLiked ? current.likeCount + 1 : Math.max(0, current.likeCount - 1);

      state.posts[postId] = {
        ...current,
        liked: nextLiked,
        likeCount: nextCount,
      };

      state.pendingLikes[postId] = {
        postId,
        liked: nextLiked,
        timestamp: Date.now(),
      };
    },

    applyBatchConfirmed: (
      state,
      action: PayloadAction<Array<{ post_id: string; like_count: number; liked: boolean }>>
    ) => {
      if (!Array.isArray(action.payload)) return;
      for (const res of action.payload) {
        const pending = state.pendingLikes[res.post_id];
        // Only apply if there is no pending action initiated AFTER this batch
        if (!pending) {
          const existing = state.posts[res.post_id] || {
            postId: res.post_id,
            liked: false,
            likeCount: 0,
            commentCount: 0,
          };
          state.posts[res.post_id] = {
            ...existing,
            liked: res.liked,
            likeCount: res.like_count,
          };
        }
      }
    },

    clearPendingLikesForPosts: (state, action: PayloadAction<string[]>) => {
      for (const id of action.payload) {
        delete state.pendingLikes[id];
      }
    },

    setCommentsForPost: (
      state,
      action: PayloadAction<{ postId: string; comments: CommentItem[] }>
    ) => {
      const { postId, comments } = action.payload;
      state.comments[postId] = comments;
      if (state.posts[postId]) {
        state.posts[postId].commentCount = comments.length;
      }
    },

    addCommentOptimistic: (
      state,
      action: PayloadAction<{ postId: string; comment: CommentItem }>
    ) => {
      const { postId, comment } = action.payload;
      const existing = state.comments[postId] || [];
      state.comments[postId] = [comment, ...existing];
      if (state.posts[postId]) {
        state.posts[postId].commentCount = (state.posts[postId].commentCount || 0) + 1;
      } else {
        state.posts[postId] = {
          postId,
          liked: false,
          likeCount: 0,
          commentCount: 1,
        };
      }
    },

    replaceOptimisticComment: (
      state,
      action: PayloadAction<{ postId: string; tempId: string; realComment: CommentItem }>
    ) => {
      const { postId, tempId, realComment } = action.payload;
      const list = state.comments[postId];
      if (list) {
        const idx = list.findIndex((c) => c.id === tempId);
        if (idx !== -1) {
          list[idx] = realComment;
        }
      }
    },

    removeCommentOptimistic: (
      state,
      action: PayloadAction<{ postId: string; commentId: string }>
    ) => {
      const { postId, commentId } = action.payload;
      const list = state.comments[postId];
      if (list) {
        state.comments[postId] = list.filter((c) => c.id !== commentId);
        if (state.posts[postId]) {
          state.posts[postId].commentCount = Math.max(0, (state.posts[postId].commentCount || 1) - 1);
        }
      }
    },
  },
});

export const {
  hydratePostsInteractions,
  toggleLikeOptimistic,
  applyBatchConfirmed,
  clearPendingLikesForPosts,
  setCommentsForPost,
  addCommentOptimistic,
  replaceOptimisticComment,
  removeCommentOptimistic,
} = interactionsSlice.actions;

export default interactionsSlice.reducer;
