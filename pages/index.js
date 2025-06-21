import Head from 'next/head';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';

const WELCOME_MESSAGE = "✨မင်္ဂလာပါခင်ဗျာ။ ကျွန်တော်က မိတ်ဆွေတို့ကို ကူညီမယ့် Bonanza E-reader Store ရဲ့ Assistant ဖြစ်ပါတယ်။ သိချင်တာမေးလို့ရပါတယ်။";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef(null);
  const clientConversationHistoryRef = useRef([]);

  useEffect(() => {
    // ✅ Clear saved chat when the page loads (clean start)
    localStorage.removeItem('chatHistory');
    restoreChatHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const escapeHtml = (text) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const restoreChatHistory = () => {
    setMessages([{ sender: 'bot', text: WELCOME_MESSAGE }]);
  };

  const sendMessage = async () => {
    const question = userInput.trim();
    if (!question) return;

    const newMessages = [...messages, { sender: 'user', text: question }];
    setMessages(newMessages);
    setUserInput('');

    const typingIndicator = { sender: 'bot', text: 'မေးခွန်းကိုဖြေဖို့ကြိုးစားနေပါတယ်...' };
    setMessages([...newMessages, typingIndicator]);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: clientConversationHistoryRef.current })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.reply || "✨ မဖြေပေးနိုင်ပါ။";

      if (data.updatedHistory && Array.isArray(data.updatedHistory)) {
        clientConversationHistoryRef.current = data.updatedHistory;
        localStorage.setItem('chatHistory', JSON.stringify(clientConversationHistoryRef.current));
      }

      await animateBotReply(reply);

      // ✅ Save this chat to Notion via /api/saveChat
      await saveChatToGoogleSheet(question, reply);

    } catch (error) {
      animateBotReply(`✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။ (${error.message})`);
      console.error("Error:", error);
    }
  };

  const saveChatToGoogleSheet = async (userMessage, botReply) => {
    try {
      const response = await fetch("/api/saveChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, botReply })
      });
      const data = await response.json();
      console.log("✅ Chat log saved:", data);
    } catch (error) {
      console.error("❗ Error saving chat to Notion:", error);
    }
  };

  const animateBotReply = async (text) => {
    const typingSpeed = 4; // milliseconds per character for fast animation
    const prefix = "✨ ";
    let displayedText = '';

    // Start with prefix
    setMessages(prev => [...prev.slice(0, -1), { sender: 'bot', text: prefix }]);

    for (let i = 0; i < text.length; i++) {
      displayedText += text[i];
      setMessages(prev => [...prev.slice(0, -1), { sender: 'bot', text: prefix + displayedText }]);
      await new Promise(resolve => setTimeout(resolve, typingSpeed));
      scrollToBottom();
    }
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
        <style>{`
          body {
            font-family: sans-serif;
            background: #121212;
            margin: 0;
            padding: 0;
            color: #ffffff;
          }
          #chat {
            width: 95%;
            max-width: 1100px;
            margin: 10px auto;
            background: #1a1a1a;
            padding: 10px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            height: 80vh;
            overflow: hidden;
          }
          .message {
            margin: 10px 0;
            padding: 10px 12px;
            border-radius: 5px;
            line-height: 1.6;
            animation: slideIn 0.4s ease-out;
            word-break: break-word;
          }
          .user {
            background-color: #2f003a;
            color: #ffffff;
            text-align: right;
          }
          .bot {
            background-color: #25002f;
            color: #ffffff;
            text-align: left;
          }
          input, button {
            font-size: 16px;
            padding: 10px;
            margin-top: 10px;
            width: 100%;
            box-sizing: border-box;
            background-color: #1e1e1e;
            color: #ffffff;
            border: 1px solid #555;
          }
          input::placeholder {
            color: #cccccc;
          }
          button {
            background-color: #8f2ac3;
            color: #ffffff;
            border: none;
            cursor: pointer;
            transition: background-color 0.3s, box-shadow 0.3s;
          }
          button:hover {
            background-color: #7a24a6;
            box-shadow: 0 0 10px #8f2ac3;
          }
          #logo-container {
            text-align: center;
            padding: 5px 0;
            background-color: #121212;
            animation: fadeIn 1s ease-in;
          }
          #subtitle {
            font-size: 15px;
            color: #cccccc;
            margin-top: 2px;
            animation: fadeIn 1.5s ease-in-out;
          }
          #messages {
            flex-grow: 1;
            overflow-y: auto;
            padding: 0 10px;
          }
          .footer {
            text-align: center;
            margin-top: 10px;
            color: #bbbbbb;
            font-size: 14px;
          }
          @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(-10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideIn {
            0% { opacity: 0; transform: translateX(-20px); }
            100% { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </Head>

      <div id="logo-container">
        <Image src="/logo.png" alt="Bonanza Logo" width={150} height={60} priority />
        <div id="subtitle">Bonanza E-Reader Store Assistant</div>
      </div>

      <div id="chat">
        <div id="messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.sender}`}
              dangerouslySetInnerHTML={{ __html: (msg.sender === 'user' ? "👨‍💼 " : "✨ ") + escapeHtml(msg.text) }}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <input
          type="text"
          value={userInput}
          placeholder="မေးခွန်းရေးပါ..."
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button onClick={sendMessage}>မေးမယ်</button>

        <div className="footer">Created by AZM for Bonanza</div>
      </div>
    </>
  );
}
