/**
 * RichEditor — A WYSIWYG editor for React Native / Expo.
 *
 * - On **web**: uses an iframe with contentEditable (no WebView needed).
 * - On **native** (iOS/Android): uses react-native-webview.
 *
 * Supports: free-form text, inline images at cursor, bold/italic/heading.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

export interface RichEditorRef {
  insertImage: (uri: string) => void;
  getContent: () => Promise<string>;
  setContent: (html: string) => void;
  getPlainText: () => Promise<string>;
  format: (cmd: "bold" | "italic" | "heading") => void;
}

interface RichEditorProps {
  placeholder?: string;
  initialContent?: string;
  onChange?: (html: string) => void;
  minHeight?: number;
  colors: {
    ink: string;
    surface: string;
    paper: string;
    muted: string;
    line: string;
    red: string;
  };
}

const buildEditorHTML = (
  placeholder: string,
  colors: RichEditorProps["colors"],
  initialContent: string
) => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px; line-height: 1.65; color: ${colors.ink};
    background: ${colors.surface}; padding: 14px; min-height: 100%;
    -webkit-font-smoothing: antialiased;
  }
  #editor { outline: none; min-height: 200px; word-wrap: break-word; overflow-wrap: break-word; }
  #editor:empty::before { content: attr(data-placeholder); color: #8A8F91; pointer-events: none; display: block; }
  #editor img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; display: block; cursor: pointer; }
  #editor img.selected { outline: 3px solid ${colors.red}; outline-offset: 2px; }
  #editor p, #editor div { margin-bottom: 8px; }
  #editor h2 { font-size: 22px; font-weight: 800; margin: 18px 0 8px 0; line-height: 1.3; }
  .img-wrapper { position: relative; display: block; margin: 12px 0; clear: both; }
  .img-wrapper.align-left { float: left; margin: 12px 16px 12px 0; width: 45%; }
  .img-wrapper.align-right { float: right; margin: 12px 0 12px 16px; width: 45%; }
  .img-wrapper.align-center { margin-left: auto; margin-right: auto; text-align: center; display: block; width: fit-content; }
  .img-wrapper.size-small { max-width: 30%; }
  .img-wrapper.size-medium { max-width: 60%; }
  .img-wrapper.size-large { max-width: 100%; }
  
  .img-toolbar {
    position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,0.75); border-radius: 8px;
    display: none; padding: 4px; gap: 4px; z-index: 10; align-items: center; pointer-events: auto;
  }
  .img-wrapper:hover .img-toolbar, .img-wrapper:focus-within .img-toolbar, .img-wrapper:has(img.selected) .img-toolbar { display: flex; }
  .img-toolbar button {
    background: transparent; border: none; color: white; font-size: 13px; font-weight: 600;
    padding: 4px 8px; border-radius: 4px; cursor: pointer;
  }
  .img-toolbar button:hover { background: rgba(255,255,255,0.2); }
  .img-toolbar .divider { width: 1px; height: 14px; background: rgba(255,255,255,0.3); margin: 0 4px; }
  
  .img-wrapper .delete-btn {
    position: absolute; top: 6px; right: 6px; width: 28px; height: 28px;
    border-radius: 14px; background: rgba(0,0,0,0.75); color: white; border: none;
    font-size: 18px; cursor: pointer; display: flex; align-items: center;
    justify-content: center; line-height: 1; opacity: 0; transition: opacity 0.2s; z-index: 10;
  }
  .img-wrapper:hover .delete-btn, .img-wrapper:has(img.selected) .delete-btn { opacity: 1; }
</style>
</head><body>
<div id="editor" contenteditable="true" data-placeholder="${placeholder}">${initialContent || ""}</div>
<script>
  var editor = document.getElementById('editor');
  var lastContent = editor.innerHTML;
  function post(obj) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    else if (window.parent) window.parent.postMessage(JSON.stringify(obj), '*');
  }
  function notifyChange() {
    var html = editor.innerHTML;
    if (html !== lastContent) { lastContent = html; post({ type: 'content', html: html, text: editor.innerText }); }
  }
  editor.addEventListener('input', notifyChange);
  editor.addEventListener('keyup', notifyChange);
  editor.addEventListener('click', function(e) {
    if (e.target.tagName !== 'BUTTON' && !e.target.classList.contains('img-toolbar')) {
      document.querySelectorAll('img.selected').forEach(function(i){ i.classList.remove('selected'); });
    }
    if (e.target.tagName === 'IMG') e.target.classList.add('selected');
    
    // Handle toolbar button clicks
    if (e.target.tagName === 'BUTTON' && e.target.closest('.img-toolbar')) {
      var w = e.target.closest('.img-wrapper');
      if (w) {
        var action = e.target.dataset.action;
        if (action === 'align-left') { w.classList.remove('align-center', 'align-right'); w.classList.add('align-left'); }
        if (action === 'align-center') { w.classList.remove('align-left', 'align-right'); w.classList.add('align-center'); }
        if (action === 'align-right') { w.classList.remove('align-left', 'align-center'); w.classList.add('align-right'); }
        if (action === 'size-small') { w.classList.remove('size-medium', 'size-large'); w.classList.add('size-small'); }
        if (action === 'size-medium') { w.classList.remove('size-small', 'size-large'); w.classList.add('size-medium'); }
        if (action === 'size-large') { w.classList.remove('size-small', 'size-medium'); w.classList.add('size-large'); }
        notifyChange();
      }
      e.preventDefault();
      return;
    }

    if (e.target.classList.contains('delete-btn')) {
      var w = e.target.closest('.img-wrapper'); if (w) { w.remove(); notifyChange(); }
    }
  });
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      var sel = document.querySelector('img.selected');
      if (sel) { var w = sel.closest('.img-wrapper'); if (w) w.remove(); else sel.remove(); e.preventDefault(); notifyChange(); }
    }
  });
  window.execCommand = function(cmd) {
    if (cmd === 'heading') document.execCommand('formatBlock', false, '<h2>');
    else document.execCommand(cmd);
    editor.focus(); notifyChange();
  };
  window.insertImage = function(uri) {
    editor.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
      var r = document.createRange(); r.selectNodeContents(editor); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
    var wrapper = document.createElement('div'); wrapper.className = 'img-wrapper size-large'; wrapper.contentEditable = 'false';
    var img = document.createElement('img'); img.src = uri; img.style.maxWidth = '100%';
    
    var toolbar = document.createElement('div'); toolbar.className = 'img-toolbar'; toolbar.contentEditable = 'false';
    toolbar.innerHTML = \`<button data-action="align-left">Left</button>
<button data-action="align-center">Center</button>
<button data-action="align-right">Right</button>
<div class="divider"></div>
<button data-action="size-small">S</button>
<button data-action="size-medium">M</button>
<button data-action="size-large">L</button>\`;

    var delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.innerHTML = '×'; delBtn.contentEditable = 'false';
    wrapper.appendChild(img); wrapper.appendChild(toolbar); wrapper.appendChild(delBtn);
    var range = sel.getRangeAt(0); range.deleteContents(); range.insertNode(wrapper);
    var br = document.createElement('div'); br.innerHTML = '<br>';
    wrapper.parentNode.insertBefore(br, wrapper.nextSibling);
    var nr = document.createRange(); nr.setStartAfter(br); nr.collapse(true);
    sel.removeAllRanges(); sel.addRange(nr);
    notifyChange();
  };
  window.setEditorContent = function(html) { 
    editor.innerHTML = html; 
    
    var imgs = editor.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.closest('.img-wrapper')) {
        var wrapper = document.createElement('div'); 
        wrapper.className = 'img-wrapper size-large'; 
        wrapper.contentEditable = 'false';
        
        var toolbar = document.createElement('div'); 
        toolbar.className = 'img-toolbar'; 
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = '<button data-action="align-left">Left</button><button data-action="align-center">Center</button><button data-action="align-right">Right</button><div class="divider"></div><button data-action="size-small">S</button><button data-action="size-medium">M</button><button data-action="size-large">L</button>';
        
        var delBtn = document.createElement('button'); 
        delBtn.className = 'delete-btn'; 
        delBtn.innerHTML = '×'; 
        delBtn.contentEditable = 'false';
        
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        wrapper.appendChild(toolbar);
        wrapper.appendChild(delBtn);
      }
    }
    
    lastContent = editor.innerHTML; 
  };
  window.getEditorContent = function() { post({ type: 'getContent', html: editor.innerHTML, text: editor.innerText }); };
  // Handle messages from parent (web iframe)
  window.addEventListener('message', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.action === 'insertImage') insertImage(d.uri);
      else if (d.action === 'format') execCommand(d.cmd);
      else if (d.action === 'setContent') setEditorContent(d.html);
      else if (d.action === 'getContent') getEditorContent();
    } catch(ex){}
  });
  post({ type: 'ready' });
</script></body></html>`;

// ─── Web implementation using iframe ────────────────────────────────
const WebRichEditor = forwardRef<RichEditorRef, RichEditorProps>(
  ({ placeholder = "Write your story...", initialContent = "", onChange, minHeight = 300, colors }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const contentResolveRef = useRef<((v: string) => void) | null>(null);
    const plainTextResolveRef = useRef<((v: string) => void) | null>(null);

    const postToIframe = useCallback((msg: any) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    }, []);

    useImperativeHandle(ref, () => ({
      insertImage: (uri: string) => postToIframe({ action: "insertImage", uri }),
      getContent: () => new Promise<string>((resolve) => {
        contentResolveRef.current = resolve;
        postToIframe({ action: "getContent" });
        setTimeout(() => { if (contentResolveRef.current) { contentResolveRef.current(""); contentResolveRef.current = null; } }, 2000);
      }),
      setContent: (html: string) => postToIframe({ action: "setContent", html }),
      getPlainText: () => new Promise<string>((resolve) => {
        plainTextResolveRef.current = resolve;
        postToIframe({ action: "getContent" });
        setTimeout(() => { if (plainTextResolveRef.current) { plainTextResolveRef.current(""); plainTextResolveRef.current = null; } }, 2000);
      }),
      format: (cmd) => postToIframe({ action: "format", cmd }),
    }));

    useEffect(() => {
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "content") { onChange?.(data.html); }
          else if (data.type === "getContent") {
            if (contentResolveRef.current) { contentResolveRef.current(data.html); contentResolveRef.current = null; }
            if (plainTextResolveRef.current) { plainTextResolveRef.current(data.text); plainTextResolveRef.current = null; }
          }
        } catch {}
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }, [onChange]);

    // Only build srcDoc once on mount using initialContent
    const srcDoc = React.useMemo(() => buildEditorHTML(placeholder, colors, initialContent), []);

    return (
      <View style={[styles.container, { minHeight, backgroundColor: colors.surface, borderRadius: 8 }]}>
        {/* @ts-ignore — iframe is web-only */}
        <iframe
          ref={iframeRef as any}
          srcDoc={srcDoc}
          style={{
            width: "100%",
            minHeight: minHeight,
            border: "none",
            borderRadius: 8,
            backgroundColor: colors.surface,
          }}
          title="Rich Text Editor"
        />
      </View>
    );
  }
);
WebRichEditor.displayName = "WebRichEditor";

// ─── Native implementation using WebView ────────────────────────────
let NativeRichEditor: React.ForwardRefExoticComponent<RichEditorProps & React.RefAttributes<RichEditorRef>>;
if (Platform.OS !== "web") {
  // Only import WebView on native to avoid the web error
  const { WebView } = require("react-native-webview");

  NativeRichEditor = forwardRef<RichEditorRef, RichEditorProps>(
    ({ placeholder = "Write your story...", initialContent = "", onChange, minHeight = 300, colors }, ref) => {
      const webViewRef = useRef<any>(null);
      const contentResolveRef = useRef<((v: string) => void) | null>(null);
      const plainTextResolveRef = useRef<((v: string) => void) | null>(null);

      const injectJS = useCallback((js: string) => {
        webViewRef.current?.injectJavaScript(`${js}; true;`);
      }, []);

      useImperativeHandle(ref, () => ({
        insertImage: (uri: string) => { const e = uri.replace(/'/g, "\\'"); injectJS(`insertImage('${e}')`); },
        getContent: () => new Promise<string>((resolve) => {
          contentResolveRef.current = resolve;
          injectJS("getEditorContent()");
          setTimeout(() => { if (contentResolveRef.current) { contentResolveRef.current(""); contentResolveRef.current = null; } }, 2000);
        }),
        setContent: (html: string) => {
          const e = html.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
          injectJS(`setEditorContent('${e}')`);
        },
        getPlainText: () => new Promise<string>((resolve) => {
          plainTextResolveRef.current = resolve;
          injectJS("getEditorContent()");
          setTimeout(() => { if (plainTextResolveRef.current) { plainTextResolveRef.current(""); plainTextResolveRef.current = null; } }, 2000);
        }),
        format: (cmd) => injectJS(`execCommand('${cmd}')`),
      }));

      const handleMessage = useCallback((event: any) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === "content") onChange?.(data.html);
          else if (data.type === "getContent") {
            if (contentResolveRef.current) { contentResolveRef.current(data.html); contentResolveRef.current = null; }
            if (plainTextResolveRef.current) { plainTextResolveRef.current(data.text); plainTextResolveRef.current = null; }
          }
        } catch {}
      }, [onChange]);

      // Only build html once on mount using initialContent
      const html = React.useMemo(() => buildEditorHTML(placeholder, colors, initialContent), []);

      return (
        <View style={[styles.container, { minHeight, backgroundColor: colors.surface, borderRadius: 8 }]}>
          <WebView
            ref={webViewRef}
            source={{ html }}
            style={[styles.webview, { minHeight }]}
            scrollEnabled={false}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleMessage}
            keyboardDisplayRequiresUserAction={false}
            allowsInlineMediaPlayback
            mixedContentMode="always"
          />
        </View>
      );
    }
  );
  NativeRichEditor.displayName = "NativeRichEditor";
} else {
  // Dummy — never used on web
  NativeRichEditor = WebRichEditor;
}

// ─── Exported component picks the right platform impl ───────────────
export const RichEditor = forwardRef<RichEditorRef, RichEditorProps>(
  (props, ref) => {
    if (Platform.OS === "web") return <WebRichEditor ref={ref} {...props} />;
    return <NativeRichEditor ref={ref} {...props} />;
  }
);
RichEditor.displayName = "RichEditor";

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
