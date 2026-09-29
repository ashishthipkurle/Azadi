/**
 * HtmlBodyRenderer — renders HTML body content from the rich editor.
 *
 * On web, it uses dangerouslySetInnerHTML. On native, it uses a WebView.
 * Falls back to plain Text for non-HTML strings.
 */
import React from "react";
import { Platform, StyleSheet, useWindowDimensions, View, Text } from "react-native";
import { WebView } from "react-native-webview";

interface HtmlBodyRendererProps {
  html: string;
  colors: {
    ink: string;
    paper: string;
    surface: string;
    muted: string;
    line: string;
    red: string;
  };
}

/** Check if the body contains HTML tags */
function isHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

const buildReaderCSS = (colors: HtmlBodyRendererProps["colors"]) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .html-body-renderer {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.65;
    color: ${colors.ink};
    background: transparent;
    padding: 0;
    overflow-x: hidden;
  }
  .html-body-renderer img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 12px 0;
    display: block;
  }
  .html-body-renderer .img-wrapper { position: relative; display: block; margin: 12px 0; clear: both; }
  .html-body-renderer .img-wrapper.align-left { float: left; margin: 12px 16px 12px 0; width: 45%; }
  .html-body-renderer .img-wrapper.align-right { float: right; margin: 12px 0 12px 16px; width: 45%; }
  .html-body-renderer .img-wrapper.align-center { margin-left: auto; margin-right: auto; text-align: center; display: block; width: fit-content; }
  .html-body-renderer .img-wrapper.size-small { max-width: 30%; }
  .html-body-renderer .img-wrapper.size-medium { max-width: 60%; }
  .html-body-renderer .img-wrapper.size-large { max-width: 100%; }
  .html-body-renderer .img-wrapper .delete-btn { display: none; }
  .html-body-renderer .img-toolbar { display: none; }
  .html-body-renderer p, .html-body-renderer div { margin-bottom: 8px; }
  .html-body-renderer h2 {
    font-size: 22px;
    font-weight: 800;
    margin: 18px 0 8px 0;
    line-height: 1.3;
  }
  .html-body-renderer b, .html-body-renderer strong { font-weight: 700; }
  .html-body-renderer i, .html-body-renderer em { font-style: italic; }
`;

const buildReaderHTML = (body: string, colors: HtmlBodyRendererProps["colors"]) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.65;
    color: ${colors.ink};
    background: transparent;
    padding: 0;
    overflow-x: hidden;
  }
  img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 12px 0;
    display: block;
  }
  .img-wrapper { position: relative; display: block; margin: 12px 0; clear: both; }
  .img-wrapper.align-left { float: left; margin: 12px 16px 12px 0; width: 45%; }
  .img-wrapper.align-right { float: right; margin: 12px 0 12px 16px; width: 45%; }
  .img-wrapper.align-center { margin-left: auto; margin-right: auto; text-align: center; display: block; width: fit-content; }
  .img-wrapper.size-small { max-width: 30%; }
  .img-wrapper.size-medium { max-width: 60%; }
  .img-wrapper.size-large { max-width: 100%; }
  .img-wrapper .delete-btn { display: none; }
  .img-toolbar { display: none; } /* Hide toolbar in reader */
  p, div { margin-bottom: 8px; }
  h2 {
    font-size: 22px;
    font-weight: 800;
    margin: 18px 0 8px 0;
    line-height: 1.3;
  }
  b, strong { font-weight: 700; }
  i, em { font-style: italic; }
</style>
</head>
<body>
${body}
<script>
  // Auto-resize to content height
  function sendHeight() {
    const h = document.documentElement.scrollHeight;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: h }));
  }
  window.addEventListener('load', sendHeight);
  new ResizeObserver(sendHeight).observe(document.body);
  setTimeout(sendHeight, 200);
</script>
</body>
</html>
`;

/**
 * Web-only component: renders HTML body into a real DOM div.
 * React Native Web's View ignores dangerouslySetInnerHTML, so we use
 * a ref to a raw DOM element and set innerHTML directly.
 */
function WebHtmlBody({ html, colors }: HtmlBodyRendererProps) {
  const divRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (divRef.current) {
      divRef.current.innerHTML =
        `<style>${buildReaderCSS(colors)}</style><div class="html-body-renderer">${html}</div>`;
    }
  }, [html, colors]);

  // @ts-ignore — using raw DOM element on web
  return <div ref={divRef} style={{ marginBottom: 16 }} />;
}

export function HtmlBodyRenderer({ html, colors }: HtmlBodyRendererProps) {
  const [webViewHeight, setWebViewHeight] = React.useState(200);
  const { width } = useWindowDimensions();

  // If it's not HTML, render as plain text
  if (!isHtml(html)) {
    return <Text style={{ color: colors.ink, fontSize: 17, lineHeight: 26 }}>{html}</Text>;
  }

  // On web, render HTML into a real DOM div (RN Web's View ignores dangerouslySetInnerHTML)
  if (Platform.OS === "web") {
    return <WebHtmlBody html={html} colors={colors} />;
  }

  // On native, use a WebView
  return (
    <WebView
      source={{ html: buildReaderHTML(html, colors) }}
      style={[styles.webview, { height: webViewHeight, width: width - 40 }]}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      originWhitelist={["*"]}
      javaScriptEnabled
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === "height" && data.height > 0) {
            setWebViewHeight(data.height + 20);
          }
        } catch {}
      }}
    />
  );
}

const styles = StyleSheet.create({
  webContainer: {
    marginBottom: 16,
  },
  webview: {
    backgroundColor: "transparent",
  },
});
