import React, { useEffect, useRef, useState } from "react";
import { useIde } from "../../hooks/use-ide";
import { useWriteFile } from "@workspace/api-client-react";

export function MonacoEditor() {
  const { activeTabPath, tabs, updateTabContent, markTabClean, setCursorPosition } = useIde();
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTab = tabs.find(t => t.path === activeTabPath);
  const { mutate: writeFile } = useWriteFile();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const onMonacoLoaded = () => setIsReady(true);
    if ((window as any).monacoLoaded) {
      setIsReady(true);
    } else {
      window.addEventListener("monaco_loaded", onMonacoLoaded);
      return () => window.removeEventListener("monaco_loaded", onMonacoLoaded);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !containerRef.current) return;
    const monaco = (window as any).require("vs/editor/editor.main");
    if (!monaco) return;

    if (!editorRef.current) {
      editorRef.current = monaco.editor.create(containerRef.current, {
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "var(--app-font-mono)",
        padding: { top: 16 },
        scrollBeyondLastLine: false,
        roundedSelection: false,
        renderLineHighlight: "all",
      });

      editorRef.current.onDidChangeModelContent(() => {
        if (activeTabPath && editorRef.current) {
          const content = editorRef.current.getValue();
          updateTabContent(activeTabPath, content);
        }
      });

      editorRef.current.onDidChangeCursorPosition((e: any) => {
        setCursorPosition(e.position.lineNumber, e.position.column);
      });

      editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (activeTabPath && editorRef.current) {
          const content = editorRef.current.getValue();
          writeFile({ data: { path: activeTabPath, content } }, {
            onSuccess: () => {
              markTabClean(activeTabPath);
            }
          });
        }
      });
    }

    const editor = editorRef.current;
    if (activeTabPath && activeTab) {
      const model = editor.getModel();
      if (!model || model.uri.toString() !== `inmemory://${activeTabPath}`) {
        let newModel = monaco.editor.getModel(monaco.Uri.parse(`inmemory://${activeTabPath}`));
        if (!newModel) {
          newModel = monaco.editor.createModel(
            activeTab.content,
            activeTab.language,
            monaco.Uri.parse(`inmemory://${activeTabPath}`)
          );
        }
        editor.setModel(newModel);
      }
    } else {
      editor.setModel(null);
    }

    return () => {
      // Don't dispose editor on re-render, keep it alive
    };
  }, [isReady, activeTabPath, activeTab?.language]);

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col relative h-full">
      {activeTabPath ? (
        <div ref={containerRef} className="absolute inset-0" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center">
            <p className="mb-2 text-primary/80 font-semibold">CloudIDE</p>
            <p>Select a file to start editing</p>
          </div>
        </div>
      )}
    </div>
  );
}
