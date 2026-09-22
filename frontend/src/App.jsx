import React from 'react'
import { Editor } from "@monaco-editor/react"

const App = () => {
  return (
    <main className=' h-screen w-full bg-slate-950 flex gap-4 p-3'>
      <aside className=' h-full bg-slate-200 w-1/4 rounded-md'>

      </aside>

      <section className=' bg-neutral-800 w-3/4 rounded-lg overflow-hidden'>
         <Editor height="100%" defaultLanguage="javascript" defaultValue="// some comment" theme='vs-dark' />;
      </section>

    </main>
  )
}

export default App