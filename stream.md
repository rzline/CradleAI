$ curl -X POST "http://107.173.141.130:7861/aistudio/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer 123123" -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [
        {"role": "user", "content": "Explain quantum computing in simple terms."}
    ],
    "temperature": 0.7,
    "max_tokens": 500,
    "stream": true
}'
data: {"id": "chatcmpl-1747129503", "object": "chat.completion.chunk", "created": 1747129503, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": "Okay"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129503", "object": "chat.completion.chunk", "created": 1747129503, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": ", let'"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129504", "object": "chat.completion.chunk", "created": 1747129504, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": "s break down quantum computing in a way that's (hopefully) easy to"}, "finish_reason": nu
ll}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129504", "object": "chat.completion.chunk", "created": 1747129504, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": " understand.\n\nImagine regular computers use light switches that are either ON (1)"}, "f
inish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129504", "object": "chat.completion.chunk", "created": 1747129504, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": " or OFF (0). These are called bits.  That's how they store and process information.\n\nQu
antum computers use something called **qubits**. Think"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129504", "object": "chat.completion.chunk", "created": 1747129504, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": " of a dimmer switch instead of a simple on/off switch. A qubit can be ON (1), OFF (0), or
 **both at the same time**"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129504", "object": "chat.completion.chunk", "created": 1747129504, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": "!  This \"both at the same time\" thing is called **superposition**.\n\n**Why is superpos
ition important?**\n\nBecause a regular computer needs to try every possibility one after the other. A quantum computer, thanks to superpositi
on,"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129504", "object": "chat.completion.chunk", "created": 1747129504, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": " can explore many possibilities *simultaneously*.  Think of it like searching a maze. A r
egular computer explores each path one by one. A quantum computer explores all paths at the same time.\n\n**Another key concept is entanglemen
t.**\n\n"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129505", "object": "chat.completion.chunk", "created": 1747129505, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": "Imagine you have two of these special dimmer switches (qubits) and they're linked in a we
ird way. When you change one, the other *instantly* changes too, no matter how far apart they are.  This is entanglement.\n\n**Why is entangle
ment important?**\n\nEntanglement allows qubits to work"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129505", "object": "chat.completion.chunk", "created": 1747129505, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": " together in a coordinated way, further boosting the power of quantum computing and enabl
ing new algorithms.\n\n**So, to summarize:**\n\n*   **Regular computers use bits (0 or 1).**\n*   **Quantum computers use qubits (0, 1, or bot
h at the same time - superposition).**"}, "finish_reason": null}], "usage": {"total_tokens": 0}}

data: {"id": "chatcmpl-1747129505", "object": "chat.completion.chunk", "created": 1747129505, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": "\n*   **Qubits can be linked together in a spooky way called entanglement.**\n*   **Super
position and entanglement allow quantum computers to explore many possibilities at once, making them potentially much faster for certain probl
ems.**\n\n**What can quantum computers do?**\n\nQuantum computers aren't going to replace your"}, "finish_reason": null}], "usage": {"total_to
kens": 0}}

data: {"id": "chatcmpl-1747129506", "object": "chat.completion.chunk", "created": 1747129506, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": " laptop anytime soon. They're good at very specific types of problems, such as:\n\n*   **
Drug discovery:** Simulating molecules to find new medicines.\n*   **Materials science:** Designing new materials with specific properties.\n*
   **Cryptography:** Breaking existing encryption and creating new, unbreakable codes.\n*   "}, "finish_reason": null}], "usage": {"total_toke
ns": 0}}

data: {"id": "chatcmpl-1747129506", "object": "chat.completion.chunk", "created": 1747129506, "model": "gemini-2.0-flash-exp", "choices": [{"i
ndex": 0, "delta": {"role": "assistant", "content": "**Optimization:** Finding the best solution to complex problems, like logistics or financ
e.\n*   **Artificial Intelligence:** Speeding up machine learning algorithms.\n\n**In a nutshell:**\n\nQuantum computing is a fundamentally di
fferent way"}, "finish_reason": null}], "usage": {"total_tokens": 0}}
