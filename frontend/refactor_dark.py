import os
import re

FILES = [
    "ui.tsx", "support-choice.tsx", "reader-menu.tsx", "razorpay.tsx", "media-player.tsx", "live-stage.tsx",
    "../app/index.tsx", "../app/(reporter)/studio.tsx", "../app/(reporter)/profile-edit.tsx",
    "../app/(admin)/dashboard.tsx", "../app/(reader)/feed.tsx", "../app/(reader)/live/[room].tsx",
    "../app/(reader)/pledges.tsx", "../app/(reader)/post/[id].tsx", "../app/(reader)/search.tsx",
    "../app/(reader)/saved.tsx", "../app/(reader)/notifications.tsx", "../app/(reader)/reporter/[id].tsx"
]

def process_file(filepath):
    full_path = os.path.join(r"d:\All Projects\My News App\Azadi\Azadi\frontend\src", filepath)
    if not os.path.exists(full_path):
        return

    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()

    # If it doesn't use C, skip
    if "import { C }" not in content and "import { C," not in content:
        return

    # Replace import { C } from "@/src/theme"
    content = re.sub(r'import \{ (.*?)C(.*?) \} from "@/src/theme";\n', 
                     lambda m: f'import {{ {m.group(1).strip()} {m.group(2).strip()} }} from "@/src/theme";\nimport {{ useTheme }} from "@/src/hooks/use-theme";\n'.replace("{ ,", "{").replace(", }", "}"), 
                     content)
    # Cleanup empty imports
    content = content.replace('import {  } from "@/src/theme";\n', '')

    # Find the main exported component
    # This is tricky, we'll just inject `const { colors } = useTheme();` and `const styles = useStyles(colors);` at the top of functions that use styles or colors.
    
    # We will just pass `colors` instead of `C` to styles
    # Replace `const styles = StyleSheet.create({` with `const createStyles = (colors: any) => StyleSheet.create({`
    content = content.replace("const styles = StyleSheet.create({", "const createStyles = (colors: any) => StyleSheet.create({")

    # Replace `C.` with `colors.` everywhere
    content = re.sub(r'\bC\.', 'colors.', content)

    # In every component that uses styles or colors, we need to add hooks.
    # To keep it simple, we will match `export function` or `export default function`
    # and insert the hooks right after the opening brace.
    def inject_hooks(m):
        func_def = m.group(0)
        return func_def + "\n  const { colors } = useTheme();\n  const styles = createStyles(colors);"
    
    content = re.sub(r'export (default )?function \w+\([^)]*\)(\s*:\s*\w+)?\s*\{', inject_hooks, content)
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"Processed {filepath}")

for file in FILES:
    process_file(file)
