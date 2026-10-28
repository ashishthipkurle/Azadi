import { apiGet, apiPost } from "@/src/api";
import { AppDispatch, RootState } from "./index";
import {
  toggleLikeOptimistic,
  applyBatchConfirmed,
  clearPendingLikesForPosts,
  setCommentsForPost,
  addCommentOptimistic,
  replaceOptimisticComment,
  CommentItem,
} from "./interactions-slice";

let batchTimer: any = null;
let isFlushing = false;

/**
 * Toggles a like with instant 0ms optimistic UI update in Redux,
 * and buffers like/unlike actions for 2 seconds before sending them
 * in a batched packet to the database to prevent high concurrency locks.
 */
export const toggleLikeWithBatchBuffer =
  (postId: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    // 1. Immediately apply optimistic UI change to Redux (0ms delay)
    dispatch(toggleLikeOptimistic({ postId }));

    // 2. Schedule or reset the 2-second debounce timer to send packet
    if (batchTimer) {
      clearTimeout(batchTimer);
    }

    batchTimer = setTimeout(() => {
      dispatch(flushLikesPacket());
    }, 2000);
  };

/**
 * Flushes all queued like actions in a single batch packet to the database.
 */
export const flushLikesPacket =
  () => async (dispatch: AppDispatch, getState: () => RootState) => {
    if (isFlushing) return;
    const state = getState();
    const pending = state.interactions.pendingLikes;
    const postIds = Object.keys(pending);
    if (postIds.length === 0) return;

    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }

    isFlushing = true;
    const actions = postIds.map((id) => ({
      post_id: id,
      liked: pending[id].liked,
    }));

    try {
      console.log(`[LikesSync] Sending batch packet of ${actions.length} like(s) to database...`, actions);
      // Send the batch packet to the database
      const res = await apiPost<{
        ok: boolean;
        results: Array<{ post_id: string; like_count: number; liked: boolean }>;
      }>("/posts/batch-likes", { actions });

      console.log("[LikesSync] Database confirmed:", res);
      if (res?.results && Array.isArray(res.results)) {
        dispatch(clearPendingLikesForPosts(postIds));
        dispatch(applyBatchConfirmed(res.results));
      } else {
        dispatch(clearPendingLikesForPosts(postIds));
      }
    } catch (err) {
      console.warn("[LikesSync] Batch likes failed, attempting fallback:", err);
      // Fallback: try individual like toggle if batch endpoint is unavailable
      try {
        for (const action of actions) {
          const singleRes = await apiPost<{
            liked: boolean;
            like_count: number;
            post_id: string;
          }>(`/posts/${action.post_id}/like`);
          if (singleRes) {
            dispatch(
              applyBatchConfirmed([
                {
                  post_id: action.post_id,
                  like_count: singleRes.like_count,
                  liked: singleRes.liked,
                },
              ])
            );
          }
        }
        dispatch(clearPendingLikesForPosts(postIds));
      } catch (err2) {
        console.error("[LikesSync] Like sync failed:", err2);
        dispatch(clearPendingLikesForPosts(postIds));
      }
    } finally {
      isFlushing = false;
    }
  };

/**
 * Fetches comments from backend and saves to Redux.
 */
export const fetchCommentsForPost =
  (postId: string) => async (dispatch: AppDispatch) => {
    try {
      const serverComments = await apiGet<CommentItem[]>(`/posts/${postId}/comments`);
      if (Array.isArray(serverComments)) {
        dispatch(setCommentsForPost({ postId, comments: serverComments }));
        return serverComments;
      }
    } catch {
      // quiet fallback
    }
    return [];
  };

/**
 * Adds comment optimistically in Redux, then sends to backend.
 */
export const submitCommentForPost =
  (postId: string, text: string, user: { id?: string; name: string }) =>
  async (dispatch: AppDispatch) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticComment: CommentItem = {
      id: tempId,
      post_id: postId,
      user_id: user.id,
      user_name: user.name || "Reader",
      body: text,
      created_at: new Date().toISOString(),
    };

    // 1. Instantly show in Redux comments list
    dispatch(addCommentOptimistic({ postId, comment: optimisticComment }));

    // 2. Send to backend
    try {
      const saved = await apiPost<CommentItem>(`/posts/${postId}/comments`, {
        body: text,
      });
      if (saved && saved.id) {
        dispatch(
          replaceOptimisticComment({
            postId,
            tempId,
            realComment: saved,
          })
        );
        return saved;
      }
    } catch {
      // Retain optimistic comment if offline/server temporary failure
    }
    return optimisticComment;
  };
