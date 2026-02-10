import { useState } from 'react'
import Editor from './Editor'
import './App.css'

function App() {
  const [userName] = useState(() => `User ${Math.floor(Math.random() * 1000)}`)
  const [roomId, setRoomId] = useState('')
  const [joinedRoom, setJoinedRoom] = useState('')

  const handleJoin = () => {
    if (roomId.trim()) {
      setJoinedRoom(roomId.trim())
    }
  }

  const handleLeave = () => {
    setJoinedRoom('')
    setRoomId('')
  }

  if (!joinedRoom) {
    return (
      <div className="app login-screen">
        <div className="login-box">
          <h1>Collaborative Editor</h1>
          <p>Enter a room ID to join or create a document</p>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID (e.g., my-document)"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin} disabled={!roomId.trim()}>
            Join Room
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Room: {joinedRoom}</h1>
        <div className="header-right">
          <span className="user-name">{userName}</span>
          <button className="leave-btn" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </header>
      <main className="app-main">
        <Editor roomId={joinedRoom} userName={userName} />
      </main>
    </div>
  )
}

export default App
