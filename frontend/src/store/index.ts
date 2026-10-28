import { configureStore } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import interactionsReducer, { CommentItem } from "./interactions-slice";

export const store = configureStore({
  reducer: {
    interactions: interactionsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/**
 * Convenient hook to read real-time like/comment state for a single post from Redux.
 */
export function usePostInteraction(postId: string) {
  return useAppSelector((state) => state.interactions.posts[postId]);
}

const EMPTY_COMMENTS: CommentItem[] = [];

/**
 * Convenient hook to read real-time comments for a single post from Redux.
 */
export function usePostComments(postId: string) {
  return useAppSelector((state) => state.interactions.comments[postId] || EMPTY_COMMENTS);
}

export * from "./interactions-slice";
export * from "./likes-batch-manager";
