import React, { useRef, useMemo, useState, useEffect } from 'react'
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"


const App = () => {

  //monaco editor reference
  const editorRef = useRef(null);

  const [username, setUsername] = useState( () => {
    return new URLSearchParams(window.location.search).get("username") || ""
  });

  const [users, setUsers] = ([])

 
  //collaborative yjs document
  const ydoc = useMemo( () => new Y.Doc(), [])

  //shared text inside ydoc
  const yText = useMemo( () => ydoc.getText("monaco"), [ydoc])


  const handleMount = (editor) => {
    editorRef.current = editor
  }
    
  const handleJoin = (e) => {
       e.preventDefault();
       setUsername(e.target.username.value)
       window.history.pushState({}, "", "?username=" + e.target.username.value)
  }

  useEffect( () => {
    if(username && editorRef.current){

    //connects backend with yjs
    const provider = new SocketIOProvider("http://localhost:3000", "monaco", ydoc, {
      autoConnect:true,
    })

    provider.awareness.setLocalState("user", { username })
    provider.awareness.on("change", () => {
      const states = Array.from(provider.awareness.getStates().values())
      setUsers(states.map(state => state.user).filter(user => Boolean(user.username)))

    }) 

    //connects monaco editor with yjs
    const monacoBinding = new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      provider.awareness
    )
    }
  }, [
    editorRef.current,
    username
  ])

  if(!username){
      return(
        <main className='h-screen w-full bg-gray-950 flex gap-4 p-4 items-center justify-center'>
            <form 
            onSubmit={handleJoin}
            className=' flex flex-col gap-4'>
                <input
                  type='text'
                  placeholder='Enter your name'
                  name='username'
                  className='p-2 rounded0lg bg-gray-600'
                />
                <button className='p-2 rounded0lg bg-gray-600' >Join</button>

            </form>
        </main>
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