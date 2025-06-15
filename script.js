const messagesDiv = document.getElementById("messages");
const userInput = document.getElementById('userInput');
const sendButton = document.querySelector('button');

let clientConversationHistory = [];

const welcomeMessage = "✨မင်္ဂလာပါခင်ဗျာ။ ကျွန်တော်က မိတ်ဆွေတို့ကို ကူညီမယ့် Bonanza E-reader Store ရဲ့ Assistant ဖြစ်ပါတယ်။ သိချင်တာမေးလို့ရပါတယ်။";

async function sendMessage() {
  const question = userInput.value.trim();
  if (!question) return;

  displayMessage(question, 'user');
  userInput.value = "";

  displayMessage("မေးခွန်းကိုဖြေဖို့ကြိုးစားနေပါတယ်...", 'bot');

  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: clientConversationHistory })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply || "✨ မဖြေပေးနိုင်ပါ။";

    if (data.updatedHistory && Array.isArray(data.updatedHistory)) {
      clientConversationHistory = data.updatedHistory;
      localStorage.setItem('chatHistory', JSON.stringify(clientConversationHistory));
    }

    animateBotReply(reply);

    // ✅ Save this chat to Google Sheets
    saveChatToGoogleSheet(question, reply);

  } catch (error) {
    animateBotReply(`✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။ (${error.message})`);
    console.error("Error:", error);
  }
}

async function saveChatToGoogleSheet(userMessage, botReply) {
  try {
    const response = await fetch("/api/saveChat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage, botReply })
    });

    const data = await response.json();
    console.log("✅ Chat log saved:", data);
  } catch (error) {
    console.error("❗ Error saving chat to Google Sheets:", error);
  }
}

function displayMessage(message, sender) {
  const messageContainer = document.createElement('div');
  messageContainer.classList.add('message', sender);
  messageContainer.innerHTML = (sender === 'user' ? " 👨‍💼 " : " ✨ ") + escapeHtml(message);
  messagesDiv.appendChild(messageContainer);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function animateBotReply(text) {
  const botMessages = messagesDiv.querySelectorAll('.message.bot');
  if (botMessages.length === 0) return;

  const messageElement = botMessages[botMessages.length - 1];
  let index = 0;
  const prefix = "✨ ";

  messageElement.textContent = prefix;

  const typingInterval = setInterval(() => {
    if (index < text.length) {
      messageElement.textContent += text.charAt(index);
      index++;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
      clearInterval(typingInterval);
    }
  }, 4);
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const storedHistory = localStorage.getItem('chatHistory');
  if (storedHistory) {
    try {
      const parsedHistory = JSON.parse(storedHistory);
      const displayableHistory = parsedHistory.filter(msg =>
        msg.role !== 'user' || (msg.role === 'user' && msg.parts?.[0]?.text !== SYSTEM_PROMPT_FROM_SERVER)
      );

      clientConversationHistory = parsedHistory;

      displayableHistory.forEach(msg => {
        if (msg.parts && msg.parts.length > 0 && msg.parts[0].text) {
          displayMessage(msg.parts[0].text, msg.role);
        }
      });

      if (clientConversationHistory.length <= 1 || displayableHistory.length === 0) {
        displayMessage(welcomeMessage, 'bot');
      }

    } catch (e) {
      console.error("Failed to parse stored chat history:", e);
      localStorage.removeItem('chatHistory');
      displayMessage(welcomeMessage, 'bot');
    }
  } else {
    displayMessage(welcomeMessage, 'bot');
  }
});
