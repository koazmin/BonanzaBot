// script.js
// Removed API_KEY and SYSTEM_PROMPT from here as they are now handled server-side for security and context management.

const messagesDiv = document.getElementById("messages");
const userInput = document.getElementById('userInput');
const sendButton = document.querySelector('button'); // Selects the first button element

// Store conversation history on the client side
// This array will hold objects like { role: "user", parts: [{ text: "..." }] } or { role: "model", parts: [{ text: "..." }] }
let clientConversationHistory = [];

// Initial bot welcome message (displayed client-side for immediate feedback)
const welcomeMessage = "✨မင်္ဂလာပါခင်ဗျာ။ ကျွန်တော်က မိတ်ဆွေတို့ကို ကူညီမယ့် Bavin Myanmar ရဲ့ Odoo 17 Assistant ဖြစ်ပါတယ်။ Odoo 17 ERP အကြောင်းသိချင်တာမေးလို့ရပါတယ်။";

async function sendMessage() {
  const question = userInput.value.trim();
  if (!question) return;

  displayMessage(question, 'user');
  userInput.value = "";

  // Show a loading message from the bot
  displayMessage("မေးခွန်းကိုဖြေဖို့ကြိုးစားနေပါတယ်...", 'bot');

  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        history: clientConversationHistory // Send the current client history to the server
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply || "✨ မဖြေပေးနိုင်ပါ။";

    // IMPORTANT: Update client-side history with the full history received from the server.
    // The server provides `updatedHistory` which includes the system prompt + all turns.
    if (data.updatedHistory && Array.isArray(data.updatedHistory)) {
      clientConversationHistory = data.updatedHistory;
      // Optional: Save to localStorage for persistence across browser sessions
      localStorage.setItem('chatHistory', JSON.stringify(clientConversationHistory));
    }

    animateBotReply(reply);
  } catch (error) {
    animateBotReply(`✨ ဆက်သွယ်မှုမအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။ (${error.message})`);
    console.error("Error:", error);
  }
}

function displayMessage(message, sender) {
  const messageContainer = document.createElement('div');
  messageContainer.classList.add('message', sender);
  // Using innerHTML with escapeHtml to allow for basic formatting if Gemini returns Markdown (like bold, lists)
  // Ensure the prefix is added correctly.
  messageContainer.innerHTML = (sender === 'user' ? " 👨‍💼 " : " ✨ ") + escapeHtml(message);
  messagesDiv.appendChild(messageContainer);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Typing animation for bot message
function animateBotReply(text) {
  const botMessages = messagesDiv.querySelectorAll('.message.bot');
  if (botMessages.length === 0) return;

  const messageElement = botMessages[botMessages.length - 1];
  let index = 0;
  const prefix = "✨ ";

  messageElement.textContent = prefix; // Clear loading message

  const typingInterval = setInterval(() => {
    if (index < text.length) {
      messageElement.textContent += text.charAt(index);
      index++;
      messagesDiv.scrollTop = messagesDiv.scrollHeight; // Keep scrolling
    } else {
      clearInterval(typingInterval);
    }
  }, 4); // Adjust typing speed here (ms per character)
}

// Helper function to escape HTML for display (prevents XSS if Gemini output contains HTML tags)
function escapeHtml(text) {
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Event Listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    event.preventDefault(); // Prevent default new line behavior
    sendMessage();
  }
});

// Load history and display welcome message on page load
document.addEventListener('DOMContentLoaded', () => {
  const storedHistory = localStorage.getItem('chatHistory');
  if (storedHistory) {
    try {
      const parsedHistory = JSON.parse(storedHistory);
      // Filter out the system prompt from the loaded history for client-side display
      // The server will re-add it as needed.
      const displayableHistory = parsedHistory.filter(msg =>
        msg.role !== 'user' || (msg.role === 'user' && msg.parts?.[0]?.text !== SYSTEM_PROMPT_FROM_SERVER) // Replace SYSTEM_PROMPT_FROM_SERVER with the actual system prompt text if it's identical on server
      );

      clientConversationHistory = parsedHistory; // Load full history including system prompt for sending to server

      // Display previous messages (excluding the system prompt)
      displayableHistory.forEach(msg => {
          // Check if it's a message to display and not just the system prompt instruction
          if (msg.parts && msg.parts.length > 0 && msg.parts[0].text) {
              displayMessage(msg.parts[0].text, msg.role);
          }
      });

      // If history was loaded but there's no actual conversation (only system prompt), or no history at all
      if (clientConversationHistory.length <= 1 || displayableHistory.length === 0) {
           displayMessage(welcomeMessage, 'bot');
      }

    } catch (e) {
      console.error("Failed to parse stored chat history:", e);
      localStorage.removeItem('chatHistory'); // Clear corrupted history
      displayMessage(welcomeMessage, 'bot'); // Display welcome message if history is bad
    }
  } else {
    // If no history found, display the initial welcome message
    displayMessage(welcomeMessage, 'bot');
  }
});
