
import Head from 'next/head';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
const [messages, setMessages] = useState([]);
const [userInput, setUserInput] = useState('');
const messagesEndRef = useRef(null);
const welcomeMessage = "✨မင်္ဂလာပါခင်ဗျာ။ ကျွန်တော်က မိတ်ဆွေတို့ကို ကူညီမယ့် Bonanza E-reader Store ရဲ့ Assistant ဖြစ်ပါတယ်။ သိချင်တာမေးလို့ရပါတယ်။";

useEffect(() => {
setMessages([{ sender: 'bot', text: welcomeMessage }]);
}, []);

useEffect(() => {
scrollToBottom();
}, [messages]);

const scrollToBottom = () => {
messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
};

const sendMessage = async () => {
if (!userInput.trim()) return;

php
Copy
Edit
const newMessages = [...messages, { sender: 'user', text: userInput }];
setMessages(newMessages);
setUserInput('');

newMessages.push({ sender: 'bot', text: 'မေးခွန်းကိုဖြေဖို့ကြိုးစားနေပါတယ်...' });
setMessages([...newMessages]);

try {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: userInput })
  });

  const data = await response.json();
  const reply = data.reply || '✨ မဖြေပေးနိုင်ပါ။';

  typeWriterEffect(reply, newMessages.slice(0, -1));
} catch (error) {
  typeWriterEffect(`✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ (${error.message})`, newMessages.slice(0, -1));
}
};

const typeWriterEffect = (text, baseMessages) => {
let index = 0;
const typingSpeed = 15;
const typingInterval = setInterval(() => {
if (index <= text.length) {
const displayedText = text.substring(0, index);
setMessages([...baseMessages, { sender: 'bot', text: displayedText }]);
index++;
} else {
clearInterval(typingInterval);
}
}, typingSpeed);
};

const handleKeyDown = (e) => {
if (e.key === 'Enter') {
e.preventDefault();
sendMessage();
}
};

return (
<>
<Head>
<title>Bonanza E-Reader Store Assistant</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" href="/logo.png" type="image/png" />
</Head>

csharp
Copy
Edit
  <div id="logo-container" style={{ textAlign: 'center', padding: '5px 0', backgroundColor: '#121212' }}>
    <Image src="/logo.png" alt="Bonanza Logo" width={150} height={60} />
    <div id="subtitle" style={{ fontSize: '15px', color: '#cccccc', marginTop: '2px' }}>Bonanza E-Reader Store Assistant</div>
  </div>

  <div id="chat" style={{ width: '95%', maxWidth: '1100px', margin: '10px auto', background: '#1a1a1a', padding: '10px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', height: '80vh', overflow: 'hidden' }}>
    <div id="messages" style={{ flexGrow: 1, overflowY: 'auto', padding: '0 10px' }}>
      {messages.map((msg, idx) => (
        <div key={idx} className={`message ${msg.sender}`} style={{ margin: '10px 0', padding: '10px 12px', borderRadius: '5px', lineHeight: '1.6', backgroundColor: msg.sender === 'user' ? '#2f003a' : '#25002f', color: '#ffffff', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
          {msg.sender === 'user' ? '👨‍💼 ' : '✨ '}{msg.text}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>

    <input
      type="text"
      value={userInput}
      placeholder="မေးခွန်းရေးပါ..."
      onChange={(e) => setUserInput(e.target.value)}
      onKeyDown={handleKeyDown}
      style={{ fontSize: '16px', padding: '10px', marginTop: '10px', width: '100%', backgroundColor: '#1e1e1e', color: '#ffffff', border: '1px solid #555' }}
    />

    <button onClick={sendMessage} style={{ fontSize: '16px', padding: '10px', marginTop: '10px', width: '100%', backgroundColor: '#8f2ac3', color: '#ffffff', border: 'none', cursor: 'pointer' }}>မေးမယ်</button>

    <div className="footer" style={{ textAlign: 'center', marginTop: '10px', color: '#bbbbbb', fontSize: '14px' }}>Created by AZM for Bonanza</div>
  </div>
</>
);
}
