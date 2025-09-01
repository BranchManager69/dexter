# Grok API

## Docs
- Getting started [Introduction](https://grok-api.apidog.io/introduction-933934m0.md): 
- Getting started [Models and Pricing](https://grok-api.apidog.io/models-and-pricing-933995m0.md): 
- Getting started [Billing](https://grok-api.apidog.io/billing-934010m0.md): 
- Getting started [Consumption and Rate Limits](https://grok-api.apidog.io/consumption-and-rate-limits-934014m0.md): 
- Getting started [Usage Explorer](https://grok-api.apidog.io/usage-explorer-934024m0.md): 
- Getting started [Free Credits](https://grok-api.apidog.io/free-credits-934025m0.md): 
- Guides [Asynchronous Requests](https://grok-api.apidog.io/asynchronous-requests-934087m0.md): 
- Guides [Image Understanding](https://grok-api.apidog.io/image-understanding-934095m0.md): 
- Guides [Structured Outputs](https://grok-api.apidog.io/structured-outputs-934099m0.md): 
- Guides [Migration from Other Providers](https://grok-api.apidog.io/migration-from-other-providers-934101m0.md): 

## API Docs
- Guides [Chat](https://grok-api.apidog.io/chat-15796842e0.md): Text in, text out. Chat is the most popular feature on the xAI API, and can be used for anything from summarizing articles, generating creative writing, answering questions, providing customer support, to assisting with coding tasks.
- Guides [Reasoning](https://grok-api.apidog.io/reasoning-15799160e0.md): Grok 3 Mini is a lightweight, smaller thinking model. Unlike traditional models that generate answers immediately, Grok 3 Mini thinks before responding. It’s ideal for reasoning-heavy tasks that don’t demand extensive domain knowledge, and shines in math-specific and quantitative use cases, such as solving challenging puzzles or math problems.
- Guides [Streaming Response](https://grok-api.apidog.io/streaming-response-15799248e0.md): Streaming outputs is **supported by all models with text output capability** (Chat, Image Understanding, etc.). It is **not supported by models with image output capability** (Image Generation).
- Guides [Deferred Chat Completions](https://grok-api.apidog.io/deferred-chat-completions-15799322e0.md): Deferred Chat Completions allow you to create a chat completion, get a `response_id`, and retrieve the response at a later time. The result would be available to be requested exactly once within 24 hours, after which it would be discarded.
- Guides [ Image Generations](https://grok-api.apidog.io/-image-generations-15799848e0.md): Some of the models can provide image generation capabilities. You can provide some descriptions of the image you would like to generate, and let the model generate one or multiple pictures in the output.
- Guides [Fingerprint](https://grok-api.apidog.io/fingerprint-15799866e0.md): For each request to the xAI API, the response body will include a unique `system_fingerprint` value. This fingerprint serves as an identifier for the current state of the backend system's configuration.