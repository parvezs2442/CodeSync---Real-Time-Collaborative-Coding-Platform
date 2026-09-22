import React, { useRef, useMemo } from 'react'
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"


const App = () => {

  //monaco editor reference
  const editorRef = useRef(null);
 
  //collaborative yjs document
  const ydoc = useMemo( () => new Y.Doc(), [])

  //shared text inside ydoc
  const yText = useMemo( () => ydoc.getText("monaco"), [ydoc])


  const handleMount = (editor) => {
    editorRef.current = editor
    
    //connects backend with yjs
    const provider = new SocketIOProvider("http://localhost:3000", "monaco", ydoc, {
      autoConnect:true,
    })

    //connects monaco editor with yjs
    const monacoBinding = new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      provider.awareness
    )
  } 

  return (
    <main className=' h-screen w-full bg-slate-950 flex gap-4 p-3'>
      <aside className=' h-full bg-slate-200 w-1/4 rounded-md'>

      </aside>

      <section className=' bg-neutral-800 w-3/4 rounded-lg overflow-hidden'>
         <Editor height="100%"
          defaultLanguage="javascript"
          defaultValue="// some comment"
          theme='vs-dark'
          onMount={handleMount}
           />;
      </section>

    </main>
  )
}

export default App